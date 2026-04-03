import ipaddress

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import settings


def _get_client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS and _is_trusted_proxy(request):
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            candidate = forwarded_for.split(",")[0].strip()
            if _is_valid_ip(candidate):
                return candidate
    return get_remote_address(request)


def _is_trusted_proxy(request: Request) -> bool:
    client_host = request.client.host if request.client else None
    if not client_host or not _is_valid_ip(client_host):
        return False

    parsed = ipaddress.ip_address(client_host)
    if parsed.is_loopback or parsed.is_private:
        return True

    for network in _trusted_proxy_networks():
        if parsed in network:
            return True
    return False


def _trusted_proxy_networks() -> list[ipaddress._BaseNetwork]:
    networks: list[ipaddress._BaseNetwork] = []
    for raw_value in settings.TRUSTED_PROXY_CIDRS.split(","):
        candidate = raw_value.strip()
        if not candidate:
            continue
        try:
            networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError:
            continue
    return networks


def _is_valid_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return False
    return True


limiter = Limiter(key_func=_get_client_ip)
