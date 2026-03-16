import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.security import create_access_token, hash_password
from app.database import Base, get_db
from app.main import app
from app.models.user import User

TEST_DB_URL = "sqlite://"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
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
