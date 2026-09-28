"""The three public employer-ATS job-board APIs discovery reads (#323).

One place for each provider's API host, endpoint template, fixed query and the
hosted-board host its postings link to.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class ATSProvider:
    name: str
    label: str
    api_host: str
    endpoint_template: str
    # One fixed query per provider, never derived from user input.
    query: dict[str, str]
    listing_host: str
    slug_after: str


PROVIDERS: dict[str, ATSProvider] = {
    provider.name: provider
    for provider in (
        ATSProvider(
            name="greenhouse",
            label="Greenhouse",
            api_host="boards-api.greenhouse.io",
            endpoint_template="https://boards-api.greenhouse.io/v1/boards/{slug}/jobs",
            query={"content": "true"},
            listing_host="boards.greenhouse.io",
            slug_after="boards",
        ),
        ATSProvider(
            name="lever",
            label="Lever",
            api_host="api.lever.co",
            endpoint_template="https://api.lever.co/v0/postings/{slug}",
            query={"mode": "json"},
            listing_host="jobs.lever.co",
            slug_after="postings",
        ),
        ATSProvider(
            name="ashby",
            label="Ashby",
            api_host="api.ashbyhq.com",
            endpoint_template="https://api.ashbyhq.com/posting-api/job-board/{slug}",
            query={"includeCompensation": "false"},
            listing_host="jobs.ashbyhq.com",
            slug_after="job-board",
        ),
    )
}
_BY_API_HOST = {provider.api_host: provider for provider in PROVIDERS.values()}


def provider_for_endpoint(endpoint_url: str | None) -> ATSProvider | None:
    return _BY_API_HOST.get(urlparse(endpoint_url or "").hostname or "")


def listing_host_for_api_host(api_host: str) -> str | None:
    provider = _BY_API_HOST.get(api_host)
    return provider.listing_host if provider else None


def board_slug(provider: ATSProvider, endpoint_url: str) -> str | None:
    parts = [part for part in urlparse(endpoint_url).path.split("/") if part]
    try:
        return parts[parts.index(provider.slug_after) + 1]
    except (ValueError, IndexError):
        return None
