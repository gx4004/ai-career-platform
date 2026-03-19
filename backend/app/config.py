from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./career_platform.db"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ALGORITHM: str = "HS256"

    LLM_PROVIDER: str = "vertex"
    LLM_MODEL: str = "gemini-2.5-flash"
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    VERTEX_PROJECT_ID: str = ""
    VERTEX_LOCATION: str = "us-central1"

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    ENVIRONMENT: str = "development"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
