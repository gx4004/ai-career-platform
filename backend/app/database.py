import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings

logger = logging.getLogger(__name__)

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite and settings.ENVIRONMENT != "development":
    raise RuntimeError(
        f"SQLite is not supported in {settings.ENVIRONMENT}. "
        f"Set DATABASE_URL to a PostgreSQL connection string."
    )

connect_args = {}
if _is_sqlite:
    connect_args["check_same_thread"] = False

if not _is_sqlite and settings.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS:
    connect_args["options"] = (
        f"-c idle_in_transaction_session_timeout={settings.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS}"
    )

# Production pool sizing: 20 connections + 10 overflow handles typical 4-worker deployments
pool_size = settings.DB_POOL_SIZE or (20 if settings.ENVIRONMENT == "production" else 5)
max_overflow = settings.DB_MAX_OVERFLOW

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=pool_size,
    max_overflow=max_overflow,
    pool_timeout=settings.DB_POOL_TIMEOUT_SECONDS,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        # If a route raised mid-transaction (e.g. after db.add() but before
        # db.commit()), close the connection to the pool with a clean state.
        # Guard rollback itself — a poisoned connection (lost socket, server
        # OOM) can fail to roll back, and we must not mask the original
        # exception with a rollback failure.
        try:
            db.rollback()
        except Exception as rollback_exc:
            logger.warning(
                "get_db: rollback after route exception failed error_type=%s",
                type(rollback_exc).__name__,
            )
        raise
    finally:
        db.close()


# ── Scheduler leader guard (CON-9) ──
#
# The recurring jobs live in the web process. With more than one instance every
# one of them would ingest and expire at once, so only the instance that holds
# this PostgreSQL session-level advisory lock starts them. SQLite (local dev) is
# single-process by construction and is always the leader.
_SCHEDULER_LEADER_LOCK_KEY = 0x43574B53  # "CWKS"
_leader_connection = None
_leader_engine = None


def _close_lock_resources(connection, engine) -> None:
    for resource, closer in ((connection, "close"), (engine, "dispose")):
        if resource is not None:
            try:
                getattr(resource, closer)()
            except Exception as exc:
                logger.warning(
                    "scheduler leader cleanup failed error_type=%s", type(exc).__name__
                )


def try_acquire_scheduler_leader() -> bool:
    """Take the leader lock for the life of this process; True when we lead.

    Fails open (returns True with a warning) if the lock cannot be attempted, so a
    database blip at boot does not silently disable retention on a single
    instance; duplicate runs are idempotent and only waste fetches. A declined or
    failed attempt closes its connection and engine, so a follower can retry.
    """
    global _leader_connection, _leader_engine
    if _is_sqlite or _leader_connection is not None:
        return True
    connection = None
    lock_engine = None
    try:
        # A dedicated, never-pooled, autocommit connection: the lock lives as long
        # as this session, and no open transaction can be reaped by
        # idle_in_transaction_session_timeout.
        lock_engine = create_engine(
            settings.DATABASE_URL, poolclass=NullPool, isolation_level="AUTOCOMMIT"
        )
        connection = lock_engine.connect()
        acquired = bool(
            connection.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": _SCHEDULER_LEADER_LOCK_KEY}
            ).scalar()
        )
    except Exception as exc:
        logger.warning(
            "scheduler leader election failed; running schedulers error_type=%s",
            type(exc).__name__,
        )
        _close_lock_resources(connection, lock_engine)
        return True
    if not acquired:
        _close_lock_resources(connection, lock_engine)
        return False
    _leader_connection = connection
    _leader_engine = lock_engine
    return True


def release_scheduler_leader() -> None:
    global _leader_connection, _leader_engine
    # Closing the session releases the lock.
    _close_lock_resources(_leader_connection, _leader_engine)
    _leader_connection = None
    _leader_engine = None
