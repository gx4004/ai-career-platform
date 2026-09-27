"""SSRF-safe, size- and content-type-bounded GET for governed discovery sources."""

from __future__ import annotations

import httpx

from app.services.outbound_target import resolve_public_target

DISCOVERY_USER_AGENT = "CareerWorkbenchDiscovery/1.0"
_TIMEOUT_SECONDS = 10.0
_MAX_RESPONSE_BYTES = 2_000_000


async def fetch_public_resource(
    url: str,
    query: dict[str, str | int | bool],
    allowed_content_types: frozenset[str],
    *,
    timeout_seconds: float = _TIMEOUT_SECONDS,
    max_bytes: int = _MAX_RESPONSE_BYTES,
    user_agent: str = DISCOVERY_USER_AGENT,
) -> tuple[bytes, str]:
    """GET one public HTTPS resource and return ``(body, content_type)``.

    The host is resolved once and must be public (no private, loopback or mixed
    public/private DNS answers); the connection is pinned to that address.
    Redirects are never followed, and the response is refused when its content
    type is not allowed or its body exceeds ``max_bytes``.
    """
    target = resolve_public_target(url)
    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=timeout_seconds,
        transport=transport,
        trust_env=False,
    ) as client:
        request = client.build_request(
            "GET",
            target.connect_url,
            params=query,
            headers={
                "Host": target.host_header,
                "User-Agent": user_agent,
                "Accept": ",".join(sorted(allowed_content_types)),
            },
            extensions={"sni_hostname": target.hostname},
        )
        response = await client.send(request, stream=True)
        try:
            response.raise_for_status()
            content_type = (
                response.headers.get("content-type", "").partition(";")[0].strip().lower()
            )
            if content_type not in allowed_content_types:
                raise httpx.HTTPError("Unsupported discovery response content type")
            content_length = response.headers.get("content-length")
            if content_length and int(content_length) > max_bytes:
                raise httpx.HTTPError("Discovery response is too large")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise httpx.HTTPError("Discovery response is too large")
            return bytes(body), content_type
        finally:
            await response.aclose()
