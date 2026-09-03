#!/usr/bin/env python3
import http.cookiejar
import os
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://localhost:8088"
IDP = "http://localhost:8089"


class Jar(http.cookiejar.CookieJar):
    pass


def opener(jar):
    return urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        urllib.request.HTTPRedirectHandler(),
    )


def cookie_names(jar):
    return sorted({c.name for c in jar})


def get(op, url):
    req = urllib.request.Request(url, method="GET")
    with op.open(req, timeout=15) as resp:
        body = resp.read()
        return resp.geturl(), resp.status, body, dict(resp.headers)


def post(op, url, data):
    raw = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=raw, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with op.open(req, timeout=15) as resp:
        body = resp.read()
        return resp.geturl(), resp.status, body, dict(resp.headers)


def _docker_prefix():
    sock = "/var/run/docker.sock"
    if os.path.exists(sock) and os.access(sock, os.R_OK):
        return ["docker"]
    return ["sudo", "docker"]


def redis(*args):
    cmd = [*_docker_prefix(), "exec", "navhub-redis-1", "redis-cli", *args]
    return subprocess.check_output(cmd, text=True).strip()


def expire_all_sessions():
    keys = redis("KEYS", "session:*").splitlines()
    keys = [k for k in keys if k and k != "session:slide:" and not k.startswith("session:slide:")]
    session_keys = [k for k in keys if k.startswith("session:") and not k.startswith("session:slide:")]
    n = 0
    for k in session_keys:
        redis("DEL", k)
        n += 1
    print("expired", n, "sessions", session_keys)
    return n


def status(op):
    _, _, body, _ = get(op, BASE + "/auth/status")
    return json.loads(body.decode())


def main():
    jar = http.cookiejar.CookieJar()
    op = opener(jar)

    st = status(op)
    assert st["ssoEnabled"] is True, st
    assert st["authenticated"] is False, st
    print("PASS status sso enabled, logged out")

    # Establish IdP session
    url, code, body, _ = post(
        op,
        IDP + "/login",
        {"username": "alice", "password": "alice", "resume": ""},
    )
    print("idp login landed", url, code, cookie_names(jar))
    assert "idp_session" in cookie_names(jar)

    # Interactive SSO (no prompt=none) restoring /hello
    url, code, body, _ = get(op, BASE + "/auth/login?return_to=/hello")
    print("interactive login landed", url, code, cookie_names(jar))
    assert "nh_sid" in cookie_names(jar), cookie_names(jar)
    assert url.endswith("/hello") or "/hello" in url, url
    st = status(op)
    print("status after login", st)
    assert st["authenticated"] is True
    assert st.get("ssoSession") is True
    me_url, me_code, me_body, _ = get(op, BASE + "/api/me")
    print("me", me_code, me_body[:200])
    assert me_code == 200
    print("PASS interactive SSO login + return_to")

    expire_all_sessions()
    st = status(op)
    print("status after expire", st)
    assert st["authenticated"] is False
    try:
        get(op, BASE + "/api/me")
        raise SystemExit("expected 401 from /api/me")
    except urllib.error.HTTPError as e:
        assert e.code == 401, e.code
        print("PASS /api/me 401 after app session expiry")

    # Silent reauth with IdP session still present
    url, code, body, _ = get(op, BASE + "/auth/login?prompt=none&return_to=/keep-me")
    print("silent login landed", url, code, cookie_names(jar))
    st = status(op)
    print("status after silent", st)
    assert st["authenticated"] is True, st
    assert "/keep-me" in url, url
    assert "nh_sso=interactive" not in url
    print("PASS silent reauth with IdP session")

    # Logout IdP only
    get(op, IDP + "/logout")
    expire_all_sessions()
    st = status(op)
    assert st["authenticated"] is False

    url, code, body, _ = get(op, BASE + "/auth/login?prompt=none&return_to=/keep-me")
    print("silent without idp landed", url, code, cookie_names(jar))
    assert "nh_sso=interactive" in url, url
    st = status(op)
    assert st["authenticated"] is False, st
    print("PASS silent failure falls back to interactive, no loop")

    print("ALL E2E CHECKS PASSED")


if __name__ == "__main__":
    main()
