# ruff: noqa: E402
import os
import tempfile
from pathlib import Path

# Test isolation: backend/.env is the developer's runtime config (it enables the
# ATS ingestion scheduler and the headed Autopilot browser). pydantic-settings
# reads `.env` from the current directory, so a run from backend/ would pick it
# up and hang. Build the app settings from a directory without a `.env`, then pin
# every field to its built-in default in the environment (environment values beat
# `.env`), so any later Settings() is just as isolated. Values the caller sets in
# the real environment are kept, except the two switches that start background
# workers, which tests always get off.
_cwd = Path.cwd()
with tempfile.TemporaryDirectory() as _empty:
    os.chdir(_empty)
    try:
        from app.config import Settings as _Settings
    finally:
        os.chdir(_cwd)
for _name, _field in _Settings.model_fields.items():
    os.environ.setdefault(_name, str(_field.default))
os.environ["ATS_INGESTION_ENABLED"] = "false"
os.environ["AUTOPILOT_EXPERIMENT_ENABLED"] = "false"

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.security import create_access_token, hash_password
from app.database import Base, get_db
from app.limiter import limiter
from app.main import app
from app.models.discovered_listing import DiscoveredListing, DiscoveredListingAttribution
from app.models.discovery_source import DiscoverySource
from app.models.evidence_item import EvidenceItem
from app.models.user import User
from app.services.ats_providers import PROVIDERS, provider_for_endpoint
from app.services.cv_fit import clear_fit_caches
from app.services.discovered_listings import listing_content_sha256

TEST_DB_URL = "sqlite://"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    limiter.reset()
    # A PDF or fit cached by one test must never answer for another (the pool may be faked).
    clear_fit_caches()
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    user = User(
        email="test@example.com",
        hashed_password=hash_password("password123"),
        full_name="Test User",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user):
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_ai_result(monkeypatch):
    """Helper to mock AI client responses."""

    def _mock(result: dict):
        async def fake_complete(*args, **kwargs):
            return result

        # Patch in every service module that imports complete_structured
        for mod in [
            "app.services.resume_analyzer",
            "app.services.job_matcher",
            "app.services.cover_letter_gen",
            "app.services.interview_gen",
            "app.services.career_recommender",
            "app.services.portfolio_planner",
        ]:
            monkeypatch.setattr(f"{mod}.complete_structured", fake_complete)

    return _mock


# ── Job Discovery ──


class DiscoveryFactory:
    """Governed sources, listings and confirmed evidence for Discovery tests.

    Times are relative to the real clock because the HTTP endpoints have no
    ``now`` seam.
    """

    def __init__(self, db):
        self.db = db
        self._count = 0
        self._default_source: DiscoverySource | None = None

    def source(
        self,
        slug: str = "acme",
        *,
        provider: str = "greenhouse",
        display_name: str | None = None,
        retention_days: int = 30,
        allowed: bool = True,
    ) -> DiscoverySource:
        source = DiscoverySource(
            source_key=f"employer-ats-{provider}-{slug}",
            display_name=display_name or slug.title(),
            source_family="employer_ats",
            owner="Discovery Operations",
            terms_status="accepted" if allowed else "pending",
            terms_reviewed_at=datetime.now(UTC) if allowed else None,
            terms_reviewed_by="reviewer@example.com" if allowed else None,
            allowed_behavior="ats_integration",
            endpoint_url=PROVIDERS[provider].endpoint_template.format(slug=slug),
            rate_limit_per_minute=20,
            attribution_rule="Show company, source name and original link",
            retention_days=retention_days,
            kill_switch=not allowed,
        )
        self.db.add(source)
        self.db.commit()
        return source

    def listing(
        self,
        source: DiscoverySource | None = None,
        *,
        title: str = "Platform Engineer",
        company: str = "Acme",
        description: str = "Build reliable platform services with a small, friendly team.",
        location: str | None = None,
        remote: bool | None = None,
        posted_days_ago: float | None = 1,
        retrieved_days_ago: float = 1,
        apply_url: str | None = None,
        listing_id: str | None = None,
    ) -> DiscoveredListing:
        """A listing attributed to ``source``; identical text reuses the canonical row."""
        if source is None:
            self._default_source = self._default_source or self.source()
            source = self._default_source
        self._count += 1
        now = datetime.now(UTC)
        digest = listing_content_sha256(title, company, description)
        listing = self.db.query(DiscoveredListing).filter_by(content_sha256=digest).first()
        if listing is None:
            listing = DiscoveredListing(
                content_sha256=digest,
                title=title,
                company=company,
                description=description,
                location=location,
                remote=remote,
                posted_at=(
                    None if posted_days_ago is None else now - timedelta(days=posted_days_ago)
                ),
                apply_url=apply_url,
            )
            if listing_id is not None:
                listing.id = listing_id
            self.db.add(listing)
            self.db.flush()
        host = provider_for_endpoint(source.endpoint_url).listing_host
        self.db.add(
            DiscoveredListingAttribution(
                listing_id=listing.id,
                source_id=source.id,
                source_listing_key=f"job-{self._count}",
                source_url=f"https://{host}/acme/jobs/{self._count}",
                retrieved_at=now - timedelta(days=retrieved_days_ago),
            )
        )
        self.db.commit()
        return listing

    def evidence(self, user_id: str, text: str, *, kind: str = "skill") -> EvidenceItem:
        key = "target" if kind == "preference" else "name"
        item = EvidenceItem(
            user_id=user_id,
            kind=kind,
            content={key: text},
            provenance="user-entered",
            confirmation_state="confirmed",
        )
        self.db.add(item)
        self.db.commit()
        return item

    def user_headers(self, email: str, *, admin: bool = False) -> dict[str, str]:
        user = User(email=email, hashed_password=hash_password("password123"), is_admin=admin)
        self.db.add(user)
        self.db.commit()
        return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def discovery(db):
    return DiscoveryFactory(db)
