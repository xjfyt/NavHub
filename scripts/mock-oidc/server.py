#!/usr/bin/env python3
"""Casdoor-shaped OIDC mock for NavHub silent-SSO tests (not for production)."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ISSUER = os.environ.get("MOCK_ISSUER", "http://localhost:8089").rstrip("/")
CLIENT_ID = os.environ.get("MOCK_CLIENT_ID", "navhub")
CLIENT_SECRET = os.environ.get("MOCK_CLIENT_SECRET", "navhub-secret")
USER = {
    "sub": os.environ.get("MOCK_SUB", "alice"),
    "email": os.environ.get("MOCK_EMAIL", "alice@example.com"),
    "email_verified": True,
    "name": os.environ.get("MOCK_NAME", "Alice"),
    "preferred_username": os.environ.get("MOCK_USERNAME", "alice"),
}
PASSWORD = os.environ.get("MOCK_PASSWORD", "alice")
PORT = int(os.environ.get("PORT", "8089"))
KID = "mock-key-1"

_lock = threading.Lock()
_codes: dict[str, dict] = {}
_access: dict[str, dict] = {}
_private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public = _private.public_key()


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def int_b64(n: int) -> str:
    length = (n.bit_length() + 7) // 8
    return b64url(n.to_bytes(length, "big"))


def jwks() -> dict:
    pub = _public.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": KID,
                "n": int_b64(pub.n),
                "e": int_b64(pub.e),
            }
        ]
    }


def sign_jwt(claims: dict) -> str:
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT", "kid": KID}).encode())
    payload = b64url(json.dumps(claims).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = _private.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f"{header}.{payload}.{b64url(sig)}"


def pkce_s256(verifier: str) -> str:
    return b64url(hashlib.sha256(verifier.encode("ascii")).digest())


def html_login(qs: str, err: str = "") -> bytes:
    msg = f"<p style='color:red'>{err}</p>" if err else ""
    return f"""<!doctype html><html><body>
<h1>Mock IdP</h1>{msg}
<form method="post" action="/login">
<input type="hidden" name="resume" value="{qs}">
<label>user <input name="username" value="{USER['preferred_username']}"></label><br>
<label>pass <input name="password" type="password" value="{PASSWORD}"></label><br>
<button type="submit">Sign in</button>
</form>
<p><a href="/logout">Logout IdP session</a></p>
</body></html>""".encode()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[mock-oidc]", fmt % args, flush=True)

    def _send(self, code: int, body: bytes, ctype: str = "text/html", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if extra:
            for k, v in extra:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: dict):
        raw = json.dumps(obj).encode()
        self._send(code, raw, "application/json")

    def _cookie_user(self) -> str | None:
        raw = self.headers.get("Cookie", "")
        c = SimpleCookie()
        c.load(raw)
        morsel = c.get("idp_session")
        if morsel and morsel.value == USER["sub"]:
            return USER["sub"]
        return None

    def _redirect(self, url: str, extra=None):
        self._send(302, b"", "text/plain", [("Location", url)] + (extra or []))

    def do_GET(self):
        u = urlparse(self.path)
        path, qs = u.path, u.query
        params = parse_qs(qs)
        if path in ("/.well-known/jwks", "/.well-known/jwks.json"):
            return self._json(200, jwks())
        if path == "/logout":
            return self._send(
                200,
                b"logged out",
                extra=[("Set-Cookie", "idp_session=; Path=/; Max-Age=0")],
            )
        if path == "/healthz":
            return self._json(200, {"ok": True, "issuer": ISSUER})
        if path == "/login":
            return self._send(200, html_login(qs))
        if path == "/login/oauth/authorize":
            return self._authorize(params, qs)
        if path == "/api/userinfo":
            return self._userinfo()
        return self._send(404, b"not found")

    def do_POST(self):
        u = urlparse(self.path)
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode() if length else ""
        form = parse_qs(body)
        if u.path == "/login":
            user = (form.get("username") or [""])[0]
            pw = (form.get("password") or [""])[0]
            resume = (form.get("resume") or [""])[0]
            if user != USER["preferred_username"] or pw != PASSWORD:
                return self._send(401, html_login(resume, "bad credentials"))
            cookie = ("Set-Cookie", f"idp_session={USER['sub']}; Path=/; HttpOnly; SameSite=Lax")
            if not resume:
                return self._send(200, b"ok", extra=[cookie])
            dest = "/login/oauth/authorize?" + resume
            return self._redirect(dest, extra=[cookie])
        if u.path == "/api/login/oauth/access_token":
            return self._token(form)
        return self._send(404, b"not found")

    def _authorize(self, params: dict, qs: str):
        prompt = (params.get("prompt") or [""])[0]
        state = (params.get("state") or [""])[0]
        nonce = (params.get("nonce") or [""])[0]
        challenge = (params.get("code_challenge") or [""])[0]
        redirect_uri = (params.get("redirect_uri") or [""])[0]
        client_id = (params.get("client_id") or [""])[0]
        if client_id != CLIENT_ID or not redirect_uri:
            return self._send(400, b"bad client")
        session = self._cookie_user()
        if not session:
            if prompt == "none":
                q = urlencode({"error": "login_required", "state": state})
                sep = "&" if "?" in redirect_uri else "?"
                return self._redirect(f"{redirect_uri}{sep}{q}")
            return self._redirect("/login?" + qs)
        code = secrets.token_urlsafe(24)
        with _lock:
            _codes[code] = {
                "nonce": nonce,
                "challenge": challenge,
                "redirect_uri": redirect_uri,
                "exp": time.time() + 120,
            }
        q = urlencode({"code": code, "state": state})
        sep = "&" if "?" in redirect_uri else "?"
        return self._redirect(f"{redirect_uri}{sep}{q}")

    def _token(self, form: dict):
        code = (form.get("code") or [""])[0]
        verifier = (form.get("code_verifier") or [""])[0]
        client_id = (form.get("client_id") or [""])[0]
        secret = (form.get("client_secret") or [""])[0]
        if client_id != CLIENT_ID or secret != CLIENT_SECRET:
            return self._json(401, {"error": "invalid_client"})
        with _lock:
            rec = _codes.pop(code, None)
        if not rec or rec["exp"] < time.time():
            return self._json(400, {"error": "invalid_grant"})
        if rec["challenge"] and pkce_s256(verifier) != rec["challenge"]:
            return self._json(400, {"error": "invalid_grant", "error_description": "pkce"})
        now = int(time.time())
        claims = {
            "iss": ISSUER,
            "aud": CLIENT_ID,
            "sub": USER["sub"],
            "email": USER["email"],
            "email_verified": True,
            "name": USER["name"],
            "preferred_username": USER["preferred_username"],
            "nonce": rec["nonce"],
            "exp": now + 300,
            "iat": now,
        }
        access = secrets.token_urlsafe(24)
        with _lock:
            _access[access] = {"exp": now + 300}
        self._json(
            200,
            {
                "access_token": access,
                "token_type": "Bearer",
                "expires_in": 300,
                "id_token": sign_jwt(claims),
            },
        )

    def _userinfo(self):
        auth = self.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else ""
        with _lock:
            rec = _access.get(token)
        if not rec or rec["exp"] < time.time():
            return self._json(401, {"error": "invalid_token"})
        self._json(
            200,
            {
                "sub": USER["sub"],
                "email": USER["email"],
                "email_verified": True,
                "name": USER["name"],
                "preferred_username": USER["preferred_username"],
            },
        )


if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"mock-oidc {ISSUER} on :{PORT}", flush=True)
    httpd.serve_forever()
