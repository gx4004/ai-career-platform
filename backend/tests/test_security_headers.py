"""SecurityHeadersMiddleware on the API surface (R3 #75/#81).

``SecurityHeadersMiddleware`` (``app/main.py``) sets a locked-down header set on
every backend response: a JSON API serves no document, so its CSP is
``default-src 'none'`` and framing is denied outright. None of it was asserted
anywhere — only the CV-PDF route incidentally checked ``nosniff`` — so a middleware
edit or removal would pass the whole suite. These lock the current values.

Scope is deliberately the *backend* API only. The browser-facing document and
asset headers (the page CSP, COOP/CORP, HSTS) live in ``frontend/serve.mjs``,
which serves the SPA, and are covered by ``frontend/tests/serve.test.mjs``. HSTS
activation, production CORS origins, and CSRF ratification remain owner/deployment
decisions (D-UNK-10) and are out of scope here — this only pins behaviour that is
already shipped and unconditional.
"""

# The middleware sets these unconditionally, so the values are asserted exactly:
# a drift (e.g. X-Frame-Options weakened to SAMEORIGIN, or the API CSP loosened
# past 'none') is a security regression, not a formatting change.
EXPECTED_HEADERS = {
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


def test_successful_api_response_carries_every_security_header(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    for header, value in EXPECTED_HEADERS.items():
        assert response.headers.get(header) == value, header


def test_error_responses_also_carry_the_security_headers(client):
    """The headers must survive the error path, not just the happy path.

    A 404 is generated below the router layer, so this proves the middleware
    wraps error responses too — the usual place header-setting silently regresses.
    """
    response = client.get("/api/v1/this-route-does-not-exist")

    assert response.status_code == 404
    for header, value in EXPECTED_HEADERS.items():
        assert response.headers.get(header) == value, header


def test_api_content_security_policy_forbids_all_content_and_framing(client):
    """The API CSP must stay maximally restrictive.

    A JSON/PDF API renders no document, so anything looser than ``'none'`` only
    widens attack surface. Pinned separately from the exact-match test so the
    intent is legible: no source of any kind is allowed, and the response may not
    be framed.
    """
    csp = client.get("/api/v1/health").headers.get("content-security-policy", "")

    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "unsafe-inline" not in csp
    assert "unsafe-eval" not in csp
