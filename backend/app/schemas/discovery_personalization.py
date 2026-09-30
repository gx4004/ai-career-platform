from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DismissalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    listing_id: str = Field(min_length=1, max_length=64)


class DismissalItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    listing_id: str
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def normalize(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class PersonalizationExport(BaseModel):
    """The owner's discovery dismissals, part of the career-data export."""

    model_config = ConfigDict(extra="forbid")

    dismissals: list[DismissalItem]
