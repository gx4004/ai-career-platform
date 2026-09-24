from pydantic import BaseModel, ConfigDict, Field


class ATSIngestionOutcomeItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    source_key: str
    provider: str
    fetched: int = Field(ge=0)
    stored: int = Field(ge=0)
    deduplicated: int = Field(ge=0)
    skipped: int = Field(ge=0)
    errored: int = Field(ge=0)


class ATSIngestionRefreshResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcomes: list[ATSIngestionOutcomeItem] = Field(default_factory=list)
    # source_key -> "ExceptionClassName: message" for any source whose
    # ingestion raised before producing an outcome (e.g. refused, unreachable).
    failures: dict[str, str] = Field(default_factory=dict)
