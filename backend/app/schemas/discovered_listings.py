from pydantic import BaseModel, ConfigDict, Field


class DiscoveredListingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_listing_key: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=40, max_length=100_000)
    source_url: str = Field(pattern=r"^https://", max_length=2_048)
