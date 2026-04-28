from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./career_platform.db"
    SECRET_KEY: str = "change-me-to-a-random-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    ALGORITHM: str = "HS256"

    LLM_PROVIDER: str = "vertex"
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_PRACTICE_MODEL: str = ""
    GOOGLE_API_KEY: str = ""

    VERTEX_PROJECT_ID: str = ""
    VERTEX_LOCATION: str = "us-central1"

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"

    ENVIRONMENT: str = "development"
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXY_CIDRS: str = ""

    RESULT_CACHE_TTL_SECONDS: int = 3600
    RESULT_CACHE_ENABLED: bool = True
    BLENDED_SCORING_ENABLED: bool = True

    CAPTCHA_ENABLED: bool = False
    CAPTCHA_SECRET_KEY: str = ""
    CAPTCHA_VERIFY_URL: str = "https://www.google.com/recaptcha/api/siteverify"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""

    RESEND_API_KEY: str = ""
    PASSWORD_RESET_FROM_EMAIL: str = "noreply@careerworkbench.com"
    PASSWORD_RESET_REPLY_TO: str = ""
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 60

    DISPOSABLE_EMAIL_BLOCK_ENABLED: bool = True

    SENTRY_DSN: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
