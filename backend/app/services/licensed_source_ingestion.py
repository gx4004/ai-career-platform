from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
from sqlalchemy.orm import Session

from app.models.discovery_source import DiscoverySource
from app.schemas.discovery_sources import (
    DiscoveryAllowedBehavior,
    LicensedSourceQuery,
)
from app.services.analytics import safe_record_activation_event
from app.services.discovery_sources import (
    SourceIngestionAuthorization,
    SourceIngestionRefused,
    require_ingestion_allowed,
)
from app.services.outbound_target import resolve_public_target

DISCOVERY_USER_AGENT = "CareerWorkbenchDiscovery/1.0"
_TIMEOUT_SECONDS = 10.0
_MAX_RESPONSE_BYTES = 2_000_000
_FETCH_CONTENT_TYPES = frozenset(
    {
        "application/json",
        "application/atom+xml",
        "application/rss+xml",
        "application/xml",
        "text/xml",
    }
)
_ROBOTS_CONTENT_TYPES = frozenset({"text/plain"})


class LicensedSourceFetchRefused(RuntimeError):
    pass


@dataclass(frozen=True)
class LicensedSourceFetchResult:
    source_id: str
    source_family: str
    content: bytes
    content_type: str
    retrieved_at: datetime


async def fetch_licensed_source(
    db: Session,
    *,
    source_key: str,
    behavior: DiscoveryAllowedBehavior,
    query: LicensedSourceQuery,
) -> LicensedSourceFetchResult:
    """Fetch one governed licensed API/feed without persisting a listing."""
    source = db.query(DiscoverySource).filter_by(source_key=source_key).first()
    source_family = source.source_family if source is not None else None
    try:
        authorization = require_ingestion_allowed(db, source_key, behavior)
        _validate_licensed_authorization(authorization)
        query_values = query.model_dump(mode="json", exclude_none=True)
        _validate_query(authorization, query_values)
        policy_fingerprint = authorization.policy_fingerprint
        request_count = 2 if authorization.robots_policy == "required" else 1
        _claim_rate(
            db,
            authorization.source_id,
            request_count,
        )
        if authorization.robots_policy == "required":
            robots_url = _robots_url(authorization.endpoint_url)
            robots, _ = await _fetch_resource(robots_url, {}, _ROBOTS_CONTENT_TYPES)
            parser = RobotFileParser()
            parser.parse(robots.decode("utf-8", errors="replace").splitlines())
            if not parser.can_fetch(DISCOVERY_USER_AGENT, authorization.endpoint_url):
                raise LicensedSourceFetchRefused("robots_disallowed")

        # Re-check immediately before the governed source request so a kill
        # switch flipped during the robots request halts this source only.
        authorization = require_ingestion_allowed(db, source_key, behavior)
        _validate_query(authorization, query_values)
        if authorization.policy_fingerprint != policy_fingerprint:
            raise LicensedSourceFetchRefused("source_policy_changed_during_fetch")
        content, content_type = await _fetch_resource(
            authorization.endpoint_url,
            query_values,
            _FETCH_CONTENT_TYPES,
        )
    except (LicensedSourceFetchRefused, SourceIngestionRefused):
        if source_family is not None:
            _record_fetch_outcome(db, source_family, "blocked")
        raise
    except Exception:
        if source_family is not None:
            _record_fetch_outcome(db, source_family, "failure")
        raise

    _record_fetch_outcome(db, authorization.source_family, "success")
    return LicensedSourceFetchResult(
        source_id=authorization.source_id,
        source_family=authorization.source_family,
        content=content,
        content_type=content_type,
        retrieved_at=datetime.now(UTC),
    )


def _validate_licensed_authorization(
    authorization: SourceIngestionAuthorization,
) -> None:
    if authorization.source_family != "licensed" or authorization.allowed_behavior not in {
        "api",
        "feed",
    }:
        raise LicensedSourceFetchRefused("not_a_licensed_api_or_feed")


def _validate_query(
    authorization: SourceIngestionAuthorization,
    query: dict[str, str | int | bool],
) -> None:
    unexpected = set(query) - set(authorization.allowed_query_parameters)
    if unexpected:
        raise LicensedSourceFetchRefused("query_parameter_not_allowed")
    if any(len(str(value)) > 200 for value in query.values()):
        raise LicensedSourceFetchRefused("query_value_too_long")


def _claim_rate(
    db: Session,
    source_id: str,
    request_count: int,
) -> None:
    """Atomically claim a source's fixed-window request budget across replicas."""
    now = datetime.now(UTC)
    source = (
        db.query(DiscoverySource)
        .populate_existing()
        .filter(DiscoverySource.id == source_id)
        .with_for_update()
        .one()
    )
    started_at = source.rate_window_started_at
    if started_at is not None and started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    if started_at is None or (now - started_at).total_seconds() >= 60:
        source.rate_window_started_at = now
        source.rate_window_count = 0
    if source.rate_window_count + request_count > source.rate_limit_per_minute:
        db.rollback()
        raise LicensedSourceFetchRefused("source_rate_limit_exceeded")
    source.rate_window_count += request_count
    db.commit()


async def _fetch_resource(
    url: str,
    query: dict[str, str | int | bool],
    allowed_content_types: frozenset[str],
) -> tuple[bytes, str]:
    target = resolve_public_target(url)
    transport = httpx.AsyncHTTPTransport(retries=0)
    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=_TIMEOUT_SECONDS,
        transport=transport,
        trust_env=False,
    ) as client:
        request = client.build_request(
            "GET",
            target.connect_url,
            params=query,
            headers={
                "Host": target.host_header,
                "User-Agent": DISCOVERY_USER_AGENT,
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
            if content_length and int(content_length) > _MAX_RESPONSE_BYTES:
                raise httpx.HTTPError("Discovery response is too large")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > _MAX_RESPONSE_BYTES:
                    raise httpx.HTTPError("Discovery response is too large")
            return bytes(body), content_type
        finally:
            await response.aclose()


def _robots_url(endpoint_url: str) -> str:
    parsed = urlparse(endpoint_url)
    return urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))


def _record_fetch_outcome(db: Session, source_family: str, outcome: str) -> None:
    safe_record_activation_event(
        db,
        event_name="discovery_source_fetch_outcome",
        operational_dimension=source_family,
        operational_outcome=outcome,
    )
