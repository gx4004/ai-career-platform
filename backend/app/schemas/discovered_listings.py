from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DiscoveredListingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_listing_key: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=40, max_length=100_000)
    source_url: str = Field(pattern=r"^https://", max_length=2_048)
    # ATS-sourced fields (#323). Optional: only employer_ats adapters populate
    # them; licensed/paste/public-page ingestion leaves them null.
    location: str | None = Field(default=None, max_length=200)
    remote: bool | None = None
    posted_at: datetime | None = None
    apply_url: str | None = Field(default=None, pattern=r"^https://", max_length=2_048)
    department: str | None = Field(default=None, max_length=200)

    @field_validator("posted_at")
    @classmethod
    def require_offset(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
