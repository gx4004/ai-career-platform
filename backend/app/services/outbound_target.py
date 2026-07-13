from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlparse, urlunparse


@dataclass(frozen=True)
class ResolvedPublicTarget:
    connect_url: str
    hostname: str
    host_header: str


def resolve_public_target(url: str) -> ResolvedPublicTarget:
    """Resolve and pin one credential-free public HTTP(S) target."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Only HTTP(S) URLs are supported")
    hostname = parsed.hostname or ""
    if not hostname:
        raise ValueError("URL must have a hostname")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("Credentials in URLs are not allowed")
    if "\\" in parsed.netloc or "%" in parsed.netloc:
        raise ValueError("Encoded or ambiguous URL authorities are not allowed")
    if hostname.endswith(".") or "%" in hostname:
        raise ValueError("Non-canonical hostnames are not allowed")
    if all(character.isdigit() or character == "." for character in hostname):
        try:
            ipaddress.ip_address(hostname)
        except ValueError as exc:
            raise ValueError("Alternate numeric IP formats are not allowed") from exc

    default_port = 443 if parsed.scheme == "https" else 80
    try:
        port = parsed.port or default_port
    except ValueError as exc:
        raise ValueError("URL port is invalid") from exc
    if port != default_port:
        raise ValueError("Only standard HTTP(S) ports are allowed")

    try:
        addrinfo = socket.getaddrinfo(hostname, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError("URL hostname could not be resolved") from exc

    public_ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for _family, _, _, _, sockaddr in addrinfo:
        try:
            address = ipaddress.ip_address(sockaddr[0])
        except ValueError as exc:
            raise ValueError("URL resolved to an invalid address") from exc
        if not address.is_global:
            raise ValueError("URLs resolving to private/internal IPs are not allowed")
        if address not in public_ips:
            public_ips.append(address)

    if not public_ips:
        raise ValueError("URL hostname did not resolve to a public address")

    selected_ip = public_ips[0]
    connect_host = f"[{selected_ip}]" if selected_ip.version == 6 else str(selected_ip)
    connect_url = urlunparse(
        (
            parsed.scheme,
            connect_host,
            parsed.path or "/",
            parsed.params,
            parsed.query,
            "",
        )
    )
    host_header = hostname if port == default_port else f"{hostname}:{port}"
    return ResolvedPublicTarget(connect_url, hostname, host_header)
