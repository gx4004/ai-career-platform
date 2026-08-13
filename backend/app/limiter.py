import hashlib
import hmac
import ipaddress
from contextvars import ContextVar

import anyio
from limits.storage import storage_from_string
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.auth.security import decode_token
from app.config import settings


def _get_client_ip(request: Request) -> str:
    peer = get_remote_address(request)
    if not settings.TRUST_PROXY_HEADERS or not _is_trusted_proxy_address(peer):
        return peer

    forwarded_for = request.headers.get("X-Forwarded-For")
    if not forwarded_for:
        return peer

    for candidate in reversed(forwarded_for.split(",")):
        candidate = candidate.strip()
        if not _is_valid_ip(candidate):
            continue
        if not _is_trusted_proxy_address(candidate):
            return candidate
    return peer


def _is_trusted_proxy_address(value: str) -> bool:
    if not _is_valid_ip(value):
        return False
    address = ipaddress.ip_address(value)
    return any(address in network for network in _trusted_proxy_networks())


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


def _get_abuse_identity(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not token:
        token = request.cookies.get("cw_access", "")
    subject = decode_token(token) if token else None
    identity_type = "account" if subject else "guest"
    identity_value = subject or _get_client_ip(request)
    return f"{identity_type}:{_hash_identity(identity_value)}"


def _get_source_identity(request: Request) -> str:
    return f"source:{_hash_identity(_get_client_ip(request))}"


def get_abuse_identity_type(request: Request) -> str:
    return _get_abuse_identity(request).partition(":")[0]


def _hash_identity(value: str) -> str:
    secret = settings.ABUSE_IDENTITY_HMAC_KEY or settings.SECRET_KEY
    return hmac.new(
        secret.encode("utf-8"),
        value.strip().lower().encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:32]


def validate_abuse_control_config() -> None:
    if (
        settings.ENVIRONMENT != "development"
        and settings.RATE_LIMIT_STORAGE_URI.startswith("memory://")
    ):
        raise RuntimeError(
            "RATE_LIMIT_STORAGE_URI must use shared storage outside development"
        )


limiter = Limiter(
    key_func=_get_abuse_identity,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    key_prefix=settings.RATE_LIMIT_KEY_PREFIX,
    in_memory_fallback_enabled=False,
)
_model_identity_limit = limiter.shared_limit(
    lambda: settings.MODEL_COST_LIMIT,
    scope="model-identity",
    key_func=_get_abuse_identity,
)
_model_source_limit = limiter.shared_limit(
    lambda: settings.MODEL_SOURCE_COST_LIMIT,
    scope="model-source",
    key_func=_get_source_identity,
)
_resource_identity_limit = limiter.shared_limit(
    lambda: settings.RESOURCE_IMPORT_LIMIT,
    scope="resource-identity",
    key_func=_get_abuse_identity,
)
_resource_source_limit = limiter.shared_limit(
    lambda: settings.RESOURCE_SOURCE_LIMIT,
    scope="resource-source",
    key_func=_get_source_identity,
)


def model_abuse_limits(func):
    return _model_identity_limit(_model_source_limit(func))


# Some endpoints serve both a model-backed and a purely deterministic mode from
# one route. Only the model-backed mode spends provider budget, so charging the
# shared cost limit for every request would let cheap local computation be
# rate-limited away by an unrelated LLM spend — and would let an exhausted
# budget take a free feature offline with it.
#
# The waiver is request-scoped and defaults to *charged*: a route that forgets
# to waive still pays, so a mistake over-charges rather than opening a hole.
_model_budget_charged: ContextVar[bool] = ContextVar("model_budget_charged", default=True)


def waive_model_budget() -> None:
    """Exempt the current request from the shared model-cost budget.

    Call only from a dependency, before the limited handler runs — the limits
    are evaluated on entry to the handler, so a later call has no effect.
    """
    _model_budget_charged.set(False)


def _model_budget_waived() -> bool:
    return not _model_budget_charged.get()


# Same scopes as the unconditional limits above, so waivable and unconditional
# endpoints draw down one shared budget rather than two parallel ones.
_waivable_model_identity_limit = limiter.shared_limit(
    lambda: settings.MODEL_COST_LIMIT,
    scope="model-identity",
    key_func=_get_abuse_identity,
    exempt_when=_model_budget_waived,
)
_waivable_model_source_limit = limiter.shared_limit(
    lambda: settings.MODEL_SOURCE_COST_LIMIT,
    scope="model-source",
    key_func=_get_source_identity,
    exempt_when=_model_budget_waived,
)


def waivable_model_abuse_limits(func):
    """Shared model-cost limits that a dependency may waive per request.

    Skips the counter entirely when waived rather than charging zero, so a
    deterministic request stays served even after the budget is exhausted.
    """
    return _waivable_model_identity_limit(_waivable_model_source_limit(func))


def resource_abuse_limits(func):
    return _resource_identity_limit(_resource_source_limit(func))


class AbuseCounterStore:
    def __init__(self):
        self._storage = storage_from_string(settings.RATE_LIMIT_STORAGE_URI)

    def increment(self, namespace: str, identity: str, *, expiry: int) -> int:
        return self._storage.incr(
            self._key(namespace, identity),
            expiry=expiry,
        )

    def get(self, namespace: str, identity: str) -> int:
        value = self._storage.get(self._key(namespace, identity))
        return int(value or 0)

    def clear(self, namespace: str, identity: str) -> None:
        self._storage.clear(self._key(namespace, identity))

    def reset_all(self) -> None:
        self._storage.reset()

    @staticmethod
    def _key(namespace: str, identity: str) -> str:
        return (
            f"{settings.RATE_LIMIT_KEY_PREFIX}:{namespace}:"
            f"{_hash_identity(identity)}"
        )


abuse_counters = AbuseCounterStore()


def _reset_abuse_state_for_tests() -> None:
    if settings.ENVIRONMENT != "development":
        raise RuntimeError("Global abuse-state reset is development-only")
    limiter.reset()
    abuse_counters.reset_all()


async def record_account_pressure(
    namespace: str,
    account_identifier: str,
) -> float:
    count = abuse_counters.increment(
        namespace,
        account_identifier,
        expiry=settings.ACCOUNT_ACTION_WINDOW_SECONDS,
    )
    delayed_attempts = max(
        0, count - settings.ACCOUNT_PROGRESSIVE_DELAY_AFTER
    )
    delay = min(
        delayed_attempts * 0.5,
        settings.ACCOUNT_PROGRESSIVE_DELAY_CAP_SECONDS,
    )
    if delay:
        await anyio.sleep(delay)
    return delay


async def record_auth_failure(account_identifier: str) -> float:
    failure_count = abuse_counters.increment(
        "auth-failure",
        account_identifier,
        expiry=settings.AUTH_FAILURE_WINDOW_SECONDS,
    )
    delayed_attempts = max(
        0, failure_count - settings.AUTH_PROGRESSIVE_DELAY_AFTER
    )
    delay = min(
        delayed_attempts * 0.5,
        settings.AUTH_PROGRESSIVE_DELAY_CAP_SECONDS,
    )
    if delay:
        await anyio.sleep(delay)
    return delay


def clear_auth_failures(account_identifier: str) -> None:
    abuse_counters.clear("auth-failure", account_identifier)
