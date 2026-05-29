//! AUTH-1 / AUTH-7: OIDC hardening for the SSO login flow.
//!
//! This module collects the security-critical, network-free logic so it can be
//! unit-tested as pure functions:
//!   * PKCE (RFC 7636) `code_verifier` generation + S256 `code_challenge`.
//!   * The browser-bound flow secret (`state` + `nonce` + `code_verifier`) that
//!     is serialized into an HttpOnly, SameSite=Lax cookie at login start and
//!     required (and consumed single-use) at callback.
//!   * ID-token (JWT) verification against a provider JWKS, including
//!     `iss` / `aud` / `exp` / `nonce` claim validation.
//!
//! Network IO (JWKS fetch with a TLS-validating client + short-lived cache)
//! lives here too but is kept separate from the pure verifier so tests never
//! touch the network.

use crate::error::{AppError, AppResult};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use jsonwebtoken::jwk::{AlgorithmParameters, Jwk, JwkSet};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Cookie name holding the opaque, browser-bound OAuth flow secret. HttpOnly so
/// JS can't read it; SameSite=Lax so the cross-site IdP callback redirect still
/// carries it (mirrors the session cookie reasoning in `session.rs`).
pub const FLOW_COOKIE_NAME: &str = "nh_oauth";

/// Lifetime of the login flow cookie. The user must complete the IdP round-trip
/// within this window; afterwards the cookie expires and the callback fails
/// closed (no bound state to match).
pub const FLOW_COOKIE_TTL_SECS: i64 = 600;

/// The per-login secret bound to the browser. Generated at login start, stored
/// opaquely in the HttpOnly flow cookie, and verified (then discarded) at the
/// callback. Binds `state` (CSRF / login-fixation defense, AUTH-7), `nonce`
/// (ID-token replay defense, AUTH-1) and the PKCE `code_verifier` (auth-code
/// interception defense, AUTH-1) to the same browser.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OauthFlow {
    pub state: String,
    pub nonce: String,
    pub code_verifier: String,
}

impl OauthFlow {
    /// Generate a fresh flow secret with cryptographically-random `state`,
    /// `nonce` and a PKCE `code_verifier`.
    pub fn generate() -> Self {
        Self {
            state: rand_token(32),
            nonce: rand_token(32),
            code_verifier: gen_code_verifier(),
        }
    }

    /// The PKCE `code_challenge` (S256) derived from this flow's verifier.
    pub fn code_challenge(&self) -> String {
        code_challenge_s256(&self.code_verifier)
    }

    /// Serialize into the opaque cookie value (base64url of the JSON form).
    /// Opaque rather than signed: the cookie is HttpOnly and the value is only
    /// ever compared against itself (the callback matches the query `state`
    /// against the cookie's `state`), so confidentiality + integrity come from
    /// it never leaving the server-set HttpOnly cookie, not from a MAC. This
    /// avoids introducing a signing-key dependency while still giving us a
    /// browser-bound, single-use secret.
    pub fn encode_cookie_value(&self) -> String {
        let json = serde_json::to_vec(self).expect("OauthFlow serializes");
        URL_SAFE_NO_PAD.encode(json)
    }

    /// Parse the opaque cookie value produced by [`encode_cookie_value`].
    /// Returns `None` on any malformation so the caller fails closed.
    pub fn decode_cookie_value(value: &str) -> Option<Self> {
        let bytes = URL_SAFE_NO_PAD.decode(value.as_bytes()).ok()?;
        serde_json::from_slice(&bytes).ok()
    }
}

/// Build the `Set-Cookie` value carrying the opaque flow secret. Mirrors the
/// session cookie conventions in `session.rs`: HttpOnly, Path=/, SameSite=Lax
/// (so the cross-site IdP callback redirect still sends it), and `Secure`
/// gated by the same `is_https_public` logic. Short-lived (`FLOW_COOKIE_TTL_SECS`).
pub fn build_flow_cookie(value: &str, secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{}={}; HttpOnly; Path=/; SameSite=Lax; Max-Age={}{}",
        FLOW_COOKIE_NAME, value, FLOW_COOKIE_TTL_SECS, secure_attr
    )
}

/// Clear the flow cookie (single-use): emitted after the callback consumes it,
/// or on any callback failure, so a stale bound secret can't be reused.
pub fn clear_flow_cookie(secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0{}",
        FLOW_COOKIE_NAME, secure_attr
    )
}

/// Extract the raw flow-cookie value from a request `Cookie` header.
pub fn extract_flow_cookie(headers: &axum::http::HeaderMap) -> Option<String> {
    let cookie_header = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let kv = part.trim();
        if let Some((k, v)) = kv.split_once('=') {
            if k == FLOW_COOKIE_NAME {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Generate a random token from the unreserved alphanumeric set.
fn rand_token(len: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(len)
        .map(char::from)
        .collect()
}

/// RFC 7636 §4.1: a PKCE `code_verifier` is 43-128 chars from the unreserved
/// set `[A-Z a-z 0-9 - . _ ~]`. We use 64 alphanumeric chars (well inside the
/// allowed set and length bounds, ~380 bits of entropy).
pub fn gen_code_verifier() -> String {
    rand_token(64)
}

/// RFC 7636 §4.2: `code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`
/// with the S256 method (no padding).
pub fn code_challenge_s256(code_verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(digest)
}

/// Minimal set of OIDC ID-token claims we trust after verification.
#[derive(Debug, Clone, Deserialize)]
pub struct IdTokenClaims {
    pub sub: String,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub email_verified: Option<bool>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default, rename = "preferred_username")]
    pub preferred_username: Option<String>,
    #[serde(default)]
    pub nonce: Option<String>,
    /// Expiry (seconds since epoch). Required; verification fails if absent.
    pub exp: i64,
}

/// Why ID-token verification failed. Kept distinct from `AppError` so the pure
/// verifier has no Axum/HTTP dependency and is trivially unit-testable.
#[derive(Debug, PartialEq, Eq)]
pub enum IdTokenError {
    /// Malformed JWT, missing `kid`, or no matching/unsupported JWK.
    Malformed(&'static str),
    /// Signature did not verify against the matching JWK.
    BadSignature,
    /// `iss` / `aud` claim mismatch.
    BadClaims(&'static str),
    /// `exp` in the past (beyond leeway).
    Expired,
    /// `nonce` missing or did not equal the browser-bound nonce.
    BadNonce,
}

/// Clock skew leeway (seconds) applied to the `exp` check.
const EXP_LEEWAY_SECS: i64 = 60;

/// Pure ID-token verifier (AUTH-1). No network, no wall clock — `now` is passed
/// in (unix seconds) so expiry is deterministically testable.
///
/// Steps:
///   1. Parse the JWT header, require a `kid`, and look up the matching JWK.
///   2. Verify the RS256 signature against that JWK and validate `iss` + `aud`
///      via `jsonwebtoken` (signature + iss/aud are clock-independent).
///   3. Manually enforce `exp` against the injected `now` (with small leeway)
///      and `nonce` against the browser-bound value.
///
/// Returns the verified claims, or an [`IdTokenError`] describing the first
/// failure. Callers MUST treat any error as a hard reject (403).
pub fn verify_id_token(
    jwt: &str,
    jwks: &JwkSet,
    expected_iss: &str,
    expected_aud: &str,
    expected_nonce: &str,
    now: i64,
) -> Result<IdTokenClaims, IdTokenError> {
    let header = decode_header(jwt).map_err(|_| IdTokenError::Malformed("bad header"))?;
    let kid = header
        .kid
        .ok_or(IdTokenError::Malformed("missing kid"))?;
    let jwk: &Jwk = jwks
        .find(&kid)
        .ok_or(IdTokenError::Malformed("no jwk for kid"))?;
    // We only accept RSA keys (Casdoor signs ID tokens with RS256).
    if !matches!(jwk.algorithm, AlgorithmParameters::RSA(_)) {
        return Err(IdTokenError::Malformed("unsupported jwk type"));
    }
    let decoding_key =
        DecodingKey::from_jwk(jwk).map_err(|_| IdTokenError::Malformed("bad jwk"))?;

    // Validate signature + iss + aud with jsonwebtoken. We DISABLE its built-in
    // exp check (it uses the process wall clock, which is untestable) and run
    // exp ourselves against `now` below.
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[expected_iss]);
    validation.set_audience(&[expected_aud]);
    validation.validate_exp = false;
    validation.validate_nbf = false;
    // `exp` is still required to be present in the token; we check it manually.
    validation.set_required_spec_claims(&["exp", "iss", "aud"]);

    let data = decode::<IdTokenClaims>(jwt, &decoding_key, &validation).map_err(|e| {
        use jsonwebtoken::errors::ErrorKind;
        match e.kind() {
            ErrorKind::InvalidSignature => IdTokenError::BadSignature,
            ErrorKind::InvalidIssuer => IdTokenError::BadClaims("iss"),
            ErrorKind::InvalidAudience => IdTokenError::BadClaims("aud"),
            ErrorKind::MissingRequiredClaim(_) => IdTokenError::BadClaims("missing claim"),
            _ => IdTokenError::BadSignature,
        }
    })?;
    let claims = data.claims;

    // exp against injected clock (with leeway).
    if claims.exp + EXP_LEEWAY_SECS < now {
        return Err(IdTokenError::Expired);
    }

    // nonce must be present AND equal the browser-bound value.
    match claims.nonce.as_deref() {
        Some(n) if n == expected_nonce => {}
        _ => return Err(IdTokenError::BadNonce),
    }

    Ok(claims)
}

/// How long a fetched JWKS is trusted before we refetch. Short enough to pick up
/// provider key rotation reasonably fast, long enough to avoid hammering the IdP
/// on every login.
const JWKS_CACHE_TTL: Duration = Duration::from_secs(300);

/// In-memory JWKS cache shared across requests. Holds the last-fetched key set
/// plus the time it was fetched; on miss / expiry / unknown-kid it refetches via
/// a TLS-validating client.
#[derive(Default)]
struct JwksCacheInner {
    keys: Option<JwkSet>,
    fetched_at: Option<Instant>,
}

pub struct JwksCache {
    inner: Mutex<JwksCacheInner>,
}

impl Default for JwksCache {
    fn default() -> Self {
        Self::new()
    }
}

impl JwksCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(JwksCacheInner::default()),
        }
    }

    fn is_fresh(at: Option<Instant>) -> bool {
        matches!(at, Some(t) if t.elapsed() < JWKS_CACHE_TTL)
    }

    /// Return a JWKS guaranteed to contain `kid` when possible. Serves from cache
    /// when fresh and the kid is present; otherwise (cold cache, stale, or the
    /// kid is missing — i.e. likely a key rotation) refetches once. The
    /// `client` MUST be TLS-validating (never the lenient client).
    pub async fn get_for_kid(
        &self,
        client: &reqwest::Client,
        jwks_uri: &str,
        kid: &str,
    ) -> AppResult<JwkSet> {
        {
            let guard = self.inner.lock().await;
            if Self::is_fresh(guard.fetched_at) {
                if let Some(set) = &guard.keys {
                    if set.find(kid).is_some() {
                        return Ok(set.clone());
                    }
                }
            }
        }
        // Cold / stale / kid-not-found → refetch once under the lock so
        // concurrent logins coalesce onto a single network fetch.
        let mut guard = self.inner.lock().await;
        if Self::is_fresh(guard.fetched_at) {
            if let Some(set) = &guard.keys {
                if set.find(kid).is_some() {
                    return Ok(set.clone());
                }
            }
        }
        let fetched = fetch_jwks(client, jwks_uri).await?;
        guard.keys = Some(fetched.clone());
        guard.fetched_at = Some(Instant::now());
        Ok(fetched)
    }
}

/// Fetch a JWKS document over HTTPS using a TLS-validating client.
async fn fetch_jwks(client: &reqwest::Client, jwks_uri: &str) -> AppResult<JwkSet> {
    let resp = client.get(jwks_uri).send().await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        return Err(AppError::Internal(format!(
            "jwks fetch failed ({status}) from {jwks_uri}: {text}"
        )));
    }
    let set: JwkSet = serde_json::from_str(&text)
        .map_err(|e| AppError::Internal(format!("parse jwks from {jwks_uri}: {e}")))?;
    Ok(set)
}

/// Derive the OIDC JWKS endpoint for a Casdoor issuer/endpoint. Casdoor exposes
/// `<endpoint>/.well-known/jwks`. We accept an explicit override so operators
/// with a non-standard provider can configure it directly; an empty override
/// falls back to the derivation.
pub fn derive_jwks_uri(issuer: &str, configured: &str) -> String {
    let configured = configured.trim();
    if !configured.is_empty() {
        return configured.to_string();
    }
    format!("{}/.well-known/jwks", issuer.trim_end_matches('/'))
}

/// High-level: verify an ID token end-to-end. Looks up the signing key from the
/// (cached) JWKS by the token's `kid`, refetching on miss, then runs the pure
/// [`verify_id_token`] verifier. `now` defaults to the system clock here; tests
/// exercise the pure verifier directly with an injected clock.
#[allow(clippy::too_many_arguments)]
pub async fn verify_id_token_with_cache(
    cache: &Arc<JwksCache>,
    client: &reqwest::Client,
    jwks_uri: &str,
    jwt: &str,
    expected_iss: &str,
    expected_aud: &str,
    expected_nonce: &str,
) -> Result<IdTokenClaims, IdTokenError> {
    let header = decode_header(jwt).map_err(|_| IdTokenError::Malformed("bad header"))?;
    let kid = header.kid.ok_or(IdTokenError::Malformed("missing kid"))?;
    let jwks = cache
        .get_for_kid(client, jwks_uri, &kid)
        .await
        .map_err(|_| IdTokenError::Malformed("jwks fetch failed"))?;
    let now = chrono::Utc::now().timestamp();
    verify_id_token(jwt, &jwks, expected_iss, expected_aud, expected_nonce, now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use serde_json::json;

    // ---- PKCE (AUTH-1) ----

    // RFC 7636 Appendix B test vector.
    #[test]
    fn pkce_s256_rfc7636_vector() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        assert_eq!(code_challenge_s256(verifier), expected);
    }

    #[test]
    fn pkce_verifier_length_in_rfc_bounds() {
        let v = gen_code_verifier();
        assert!(v.len() >= 43 && v.len() <= 128, "len was {}", v.len());
        assert!(v
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '~')));
    }

    // ---- Flow cookie (AUTH-7) ----

    #[test]
    fn flow_cookie_roundtrip_matches() {
        let flow = OauthFlow {
            state: "the-state".into(),
            nonce: "the-nonce".into(),
            code_verifier: "the-verifier".into(),
        };
        let cookie = flow.encode_cookie_value();
        let decoded = OauthFlow::decode_cookie_value(&cookie).expect("decodes");
        // matching state passes
        assert_eq!(decoded.state, flow.state);
        assert_eq!(decoded.nonce, flow.nonce);
        assert_eq!(decoded.code_verifier, flow.code_verifier);
        assert_eq!(decoded, flow);
    }

    #[test]
    fn flow_cookie_mismatched_state_is_detectable() {
        let flow = OauthFlow::generate();
        let cookie = flow.encode_cookie_value();
        let decoded = OauthFlow::decode_cookie_value(&cookie).unwrap();
        // a callback presenting a different state must NOT match the bound one
        assert_ne!(decoded.state, "attacker-supplied-state");
        assert_eq!(decoded.state, flow.state);
    }

    #[test]
    fn flow_cookie_absent_or_garbage_fails_closed() {
        assert!(OauthFlow::decode_cookie_value("").is_none());
        assert!(OauthFlow::decode_cookie_value("!!!not-base64!!!").is_none());
        // valid base64url but not our JSON shape
        let junk = URL_SAFE_NO_PAD.encode(b"{\"unrelated\":true}");
        assert!(OauthFlow::decode_cookie_value(&junk).is_none());
    }

    #[test]
    fn flow_generate_is_random_and_distinct() {
        let a = OauthFlow::generate();
        let b = OauthFlow::generate();
        assert_ne!(a.state, b.state);
        assert_ne!(a.nonce, b.nonce);
        assert_ne!(a.code_verifier, b.code_verifier);
        // challenge is deterministic from the verifier
        assert_eq!(a.code_challenge(), code_challenge_s256(&a.code_verifier));
    }

    // ---- ID-token verification (AUTH-1) ----
    //
    // Two fixed RSA-2048 keypairs (generated offline with OpenSSL) so the test
    // is deterministic and adds no crypto-generation dependency. KID1/KID2 name
    // them in the JwkSet. We sign with key 1 and put key 1 in the JwkSet; the
    // "different key" case signs with key 2 while the JwkSet still only holds
    // key 1, so the signature must fail.

    const KID1: &str = "test-key-1";
    const KID2: &str = "test-key-2";

    const K1_PEM: &str = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCt7gtLu54m84oA\nh+P4qNYg0YKpUtf+P+Xrme6DUj3f59cxFcrdkp/vWcJ/OUNvknef6D5yKQJGjmN/\nViN9RgJf+F2om6nCWYzkzGIFxuGOzHwp01rWX9mf8JTuIkaM94jlCoaPDgAnz0hN\npsl40xMyaJiLzalqbkS4RV5UfONf0iwkK18MbUKqa5V06zdTh9l+irX3oMpUBe4v\nTVWUlMgOU4tve5mxJcpEm1I3HkIqRx5IwQd+KJcK3AqNcEGZWFkWIx1p0HYWJ3aZ\nqOyNDg9C5+MZaCxL6WdI4gCK8cuCm3E2UIKI/dP2bNwOyfnlM59jQCPQMGOKzwME\nUiHqVjvtAgMBAAECggEAA+JAvBvtncdCTf8mm/30hyioMGznuo3YFlW5j63fPncU\nDzh7g3WGj8savP+WS290GzivgOrhnVZ0uw6Aq2yqTx8KSnapES/g7+g/0E5eHyLe\nv1RZJCIeANO2MVSSFE9w0xBGoeAV5VRppoo+UScqFhnPgSo0wvD24XNYJWsktr6I\n6q84R7uKAc+/Uj/hFxJo7y3QVrB1MQO1Pi+dPKGsk4sFPGNOJKT/2zxh/53CoGY/\niQooyetpOlmmPhzGZDxdvJX1x+FIr57DqyOQJf5JgOM/SxZrLHn3vORBxWNtYpMH\nnajRjkfCJWBWUmTPsZp50OgyIvUF0iJsDTNYFbIjpQKBgQD0H12umaxFkSuAnHUf\nid4Vmlu8GXfv1M9zeTaFacVMKvkQ4qBT9euTU+0Jmu4trf6x7+qS6IxfcWcn14lj\nTJTVgDH9a0ixBYhPxvFDBScy6owqDJ/9HBdK8QwiQ+CUZtLi2DKrDrgV2SDSWC+9\nz1SFvnlRTZU5ys/75UVHPAT1YwKBgQC2ZGc7Ic9jTJg0rw8sU+3Nvbb7qHQ+IDk+\nEKfQQyj8RN7ge55UoLkjIbGYDqndQKTDIK66zSrAkT877lZn1PDDDHFVHBLMIl4b\n7gWKMbstxMlT74IVLVG/EssQI+O3mc9DKgfFkjhWG3aSXUDKwgMlUMncuLl3G2zO\nkHwPuXuybwKBgQDJoNJucExiFPnaOt9d0jAUpa4Y2Ow/sQQ6uqW2YVrsgx29vYBw\neFA/GfVQlp8cKXaQnrie5+VwuyhZNuMpmcnf4Qbo6WBbnVctlQIVub7bhe+Il27Y\nzgfLBPZhorBtwdNyOuD2eay/lttOADpGSmTkJiLrbOnQlttbkMy8fi0WQwKBgCJx\nY20vPVKrLDMGu/7K+qVXpi5v6UOyIh0uWAJkLGE3QD90GLoyf8O6oSbt3fYCNxsC\nGPz9sY0b4K0YnQiOlci/mMdRvdr+wnbTxAgMzCQgfUR0fkQxgrZqfh5WKLKLQTCV\nx1HwAuN/3CxXn9yqNp3dW8FqwNtVOn7nmgX+KPXRAoGABbIcFSbZky/EEMtL0K16\nR3XSj4PTnxz+aOD5EermB2rFD95PqN7Dx6YxMiiloOHsIUaoGbR0/wXr1OvxJkJ1\n2aEVoQrvdRquMq9K2J77HV3yRGwycJBMPrH5wunFaLTzxvYNlP11FFOrD3GQ7c2z\neRRNLn86fusHsd/6uCt1Sdo=\n-----END PRIVATE KEY-----\n";

    const K2_PEM: &str = "-----BEGIN PRIVATE KEY-----\nMIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQDqaf66xSKjf1PC\nYf4zbnciKQ0qdxb5FkQAcg1TOizvvSgZR5OPuYI9CZx8+S5j5ZGoECV0dVw6egbK\nImePM8kZ/F7W5j4TTC6v36goBtnxFc/60CPJ9iV2s3nuO8KFLMtJ2BXTvmWMiQtS\ndRapV1m0KMKO62EhpWlyQre2HntcY0UH8V21vg+4cpHbVysBs7UFJpUw6lLWoLVz\nveHqX8O3is6nwiCF294zM3xSuuvvwtnDEb+4ItzwObh6kuFX4yw9LXNw/KjhPMTp\nK+OVf9LzovaIkKx/2IDwh7h3RthhFPa7wcYeAp1Sry7wuttgAGThMpEYfbg+CA+7\nOMnuT+p7AgMBAAECgf8vdkadNPejzaP9N4TAj8fkosCHrep42d6Vjdd6LSKWvTXh\nPcd4J5dhxGXAPV5R26l3iHgM8bY6y3o/HbgvcSIb9ifoWws2h7ZBkIdQ6Lzik11e\nQHD+ngKihgmqCBov3LdMZvQEa13O6/CJltYqc1qLn7UaOuOabGNtPxTzSuNZ+7Gg\naZrUn+7UuHs1T2jhHiIhXm20gRAvT1jPOdUL/YG5ol/oVkn2b+3mDcQsH5BQJzO/\nSEb+fMBFQ0tWL6kMYKxPag2BaiyxlGo64CGRn7O7ksl3a1YzhwjZOXBX0vEPp/6F\noaVQQcrGEEI9D8DyqBT6OrvUALjCQ7GkDVIrVLUCgYEA9eJywkccV/hu4kr+PDJN\nWM6iO2lFsXbGgqMjWpFTkhQzlObnG0QtsDRNM7GhVt580jQ8HECSAuCIwfg1GUzu\nll5ytKt1R6shqslZW3XuOCwMfhFUOjxosmtPDjJsOdeypba/1y7PVh9+krpBcZ6/\nGUSj4USdooIXO3ASyWOBNu0CgYEA9A6+fj6UEbFDLDYB62eMKZlIywJrVLYWIcMS\n1QX2hwFOgFZyVUSt4+ZJ5Lv8bd7QPmDQlBu2VEKoaUJBzx2zSTZgDV346H7u8EKb\nPlCFkMmFFlBaOoRQL3ECkGsRL/p+2m3AE2zMr5auZGSim+utzdSj3naDpVD/4RvW\nWFl90gcCgYBT16p/+pV8nbbZrO6yAgkDzjndflEIaVLZOt2URVe0yPSpwm5tirr1\niXAFv30fTPBNEQiqLY5cMsoPMh6RCP2WApCkcI6mKIFrZgr1N+pJ9yMvXaNV1EFz\nDUpAsgrbUmSVQxJ5QnnqiQS07ZPhNVs+N3yWFLqXrjpTxyxwxWBLJQKBgQDo8Qmw\nxVneaSqMECBU50hIjB2GZpC7EfCd2Osol8BtqzmaFOibqimu1CbDQwn0dC6e2xk5\nxBmK4vSLQso9PUPaJSQYnhDtF/pHJ8u09nYFc9KrMZZtM8y0+1BPN2H4QUbChO5H\nnBjhnxhkigkKeTAyvTqLIuMT7vPLkB5NxVzqEQKBgEXRDM7tYYYe6+phYXkC2URU\noslrcZ9ITugL3YyYvhowE1K463AhlwByFQdIenY5CL/rs50tuonjLe4gsRwTgkl3\nrVeKhYChfwnS2xSr3kUKQQYpO7GiS+LyT85vvjbK8JZXxnlIjfyzDC+RJYFI+TKV\nwcofwwTOX0WZqLPSS2S2\n-----END PRIVATE KEY-----\n";

    const K1_N: &str = "re4LS7ueJvOKAIfj-KjWINGCqVLX_j_l65nug1I93-fXMRXK3ZKf71nCfzlDb5J3n-g-cikCRo5jf1YjfUYCX_hdqJupwlmM5MxiBcbhjsx8KdNa1l_Zn_CU7iJGjPeI5QqGjw4AJ89ITabJeNMTMmiYi82pam5EuEVeVHzjX9IsJCtfDG1CqmuVdOs3U4fZfoq196DKVAXuL01VlJTIDlOLb3uZsSXKRJtSNx5CKkceSMEHfiiXCtwKjXBBmVhZFiMdadB2Fid2majsjQ4PQufjGWgsS-lnSOIAivHLgptxNlCCiP3T9mzcDsn55TOfY0Aj0DBjis8DBFIh6lY77Q";
    const K1_E: &str = "AQAB";

    fn jwks_with_key1() -> JwkSet {
        let jwk = json!({
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": KID1,
            "n": K1_N,
            "e": K1_E,
        });
        let set = json!({ "keys": [jwk] });
        serde_json::from_value(set).expect("valid jwks")
    }

    /// Sign an ID token with the given PKCS#8 PEM key and `kid`.
    fn sign(pem: &str, kid: &str, claims: serde_json::Value) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(kid.to_string());
        let key = EncodingKey::from_rsa_pem(pem.as_bytes()).expect("valid rsa pem");
        encode(&header, &claims, &key).expect("encode jwt")
    }

    const ISS: &str = "https://idp.example.com";
    const AUD: &str = "navhub-client";
    const NONCE: &str = "browser-bound-nonce";
    const NOW: i64 = 1_700_000_000;

    fn good_claims() -> serde_json::Value {
        json!({
            "iss": ISS,
            "aud": AUD,
            "sub": "user-123",
            "email": "u@example.com",
            "email_verified": true,
            "nonce": NONCE,
            "exp": NOW + 300,
        })
    }

    // (1) ACCEPTS correct iss/aud/nonce/exp + valid signature.
    #[test]
    fn idtoken_accepts_valid() {
        let jwt = sign(K1_PEM, KID1, good_claims());
        let claims = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW)
            .expect("should accept a fully-valid token");
        assert_eq!(claims.sub, "user-123");
        assert_eq!(claims.email.as_deref(), Some("u@example.com"));
        assert_eq!(claims.email_verified, Some(true));
    }

    // (2) REJECTS wrong iss.
    #[test]
    fn idtoken_rejects_wrong_iss() {
        let mut c = good_claims();
        c["iss"] = json!("https://evil.example.com");
        let jwt = sign(K1_PEM, KID1, c);
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::BadClaims("iss"));
    }

    // (3) REJECTS wrong aud.
    #[test]
    fn idtoken_rejects_wrong_aud() {
        let mut c = good_claims();
        c["aud"] = json!("some-other-client");
        let jwt = sign(K1_PEM, KID1, c);
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::BadClaims("aud"));
    }

    // (4) REJECTS expired exp.
    #[test]
    fn idtoken_rejects_expired() {
        let mut c = good_claims();
        c["exp"] = json!(NOW - 3600); // long past, beyond leeway
        let jwt = sign(K1_PEM, KID1, c);
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::Expired);
    }

    // (5) REJECTS wrong/absent nonce.
    #[test]
    fn idtoken_rejects_wrong_nonce() {
        let mut c = good_claims();
        c["nonce"] = json!("not-the-bound-nonce");
        let jwt = sign(K1_PEM, KID1, c);
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::BadNonce);
    }

    #[test]
    fn idtoken_rejects_absent_nonce() {
        let mut c = good_claims();
        c.as_object_mut().unwrap().remove("nonce");
        let jwt = sign(K1_PEM, KID1, c);
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::BadNonce);
    }

    // (6) REJECTS a signature from a different key (key 2 signs, JwkSet has key 1).
    #[test]
    fn idtoken_rejects_signature_from_other_key() {
        // Sign with key 2 but advertise KID1 so the verifier looks up key 1's
        // JWK; the signature must then fail to verify.
        let jwt = sign(K2_PEM, KID1, good_claims());
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::BadSignature);
    }

    #[test]
    fn idtoken_rejects_unknown_kid() {
        // honest kid2, but JwkSet only has key 1 → no JWK for kid.
        let jwt = sign(K2_PEM, KID2, good_claims());
        let err = verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).unwrap_err();
        assert_eq!(err, IdTokenError::Malformed("no jwk for kid"));
    }

    #[test]
    fn idtoken_accepts_within_exp_leeway() {
        let mut c = good_claims();
        c["exp"] = json!(NOW - 30); // expired 30s ago, within 60s leeway
        let jwt = sign(K1_PEM, KID1, c);
        assert!(verify_id_token(&jwt, &jwks_with_key1(), ISS, AUD, NONCE, NOW).is_ok());
    }
}
