/*
 * NavHub minimal service worker (hand-written, no workbox).
 *
 * Goals & safety rules — read before editing:
 *  - Versioned cache name; `activate` purges every cache that isn't the
 *    current version so a new deploy never serves a stale shell.
 *  - App shell (index.html) is precached on install for an offline fallback.
 *  - NAVIGATIONS  -> network-first, falling back to the cached shell only when
 *    the network is unreachable. This guarantees a fresh index after a deploy
 *    and never strands the user on a stale SPA that could 401-loop.
 *  - STATIC ASSETS (hashed JS/CSS/fonts/images) -> cache-first. Safe because
 *    Vite fingerprints filenames, so a cached asset is immutable.
 *  - NEVER cached, NEVER intercepted: cross-origin requests and anything under
 *    /api, /auth, /metrics, /uploads. Auth tokens and user data must always hit
 *    the network so nothing is served stale or leaked from the cache.
 */

const CACHE_VERSION = "v1";
const CACHE_NAME = `navhub-shell-${CACHE_VERSION}`;
const SHELL_URL = "/index.html";

// Precache the app shell + manifest/icons. Static JS/CSS are fingerprinted and
// unknown at build time, so they are cached lazily on first fetch instead.
const PRECACHE_URLS = [
  "/",
  SHELL_URL,
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-maskable.svg",
];

// Same-origin path prefixes that must always go to the network and never be
// cached: API, auth, metrics and user uploads.
const NEVER_CACHE_PREFIXES = ["/api/", "/auth/", "/metrics", "/uploads/"];

function isNeverCache(pathname) {
  return NEVER_CACHE_PREFIXES.some((p) => pathname.startsWith(p));
}

// Heuristic for immutable static assets we are happy to cache-first.
function isStaticAsset(url) {
  if (url.pathname.startsWith("/assets/")) return true;
  return /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i.test(
    url.pathname,
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll is atomic; if one URL 404s nothing is cached. Use individual
      // best-effort puts so a missing optional file can't block install.
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((u) =>
            cache.add(u).catch(() => {
              /* best-effort precache */
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("navhub-shell-") && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Allow the page to trigger an immediate activation of a waiting worker.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Everything else (POST, cross-origin,
  // websockets, etc.) falls through to the network untouched.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Auth / API / metrics / uploads: never intercept, never cache.
  if (isNeverCache(url.pathname)) return;

  // Navigations: network-first with cached-shell offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(SHELL_URL).then((cached) => cached || caches.match("/")),
      ),
    );
    return;
  }

  // Static assets: cache-first, populate on miss.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Only cache successful, basic (same-origin) responses.
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
  // Anything else: let the browser handle it normally (no caching).
});
