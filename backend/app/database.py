import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

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

# Production pool sizing: 20 connections + 10 overflow handles typical 4-worker deployments
pool_size = 20 if settings.ENVIRONMENT == "production" else 5
max_overflow = 10

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_size=pool_size,
    max_overflow=max_overflow,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
