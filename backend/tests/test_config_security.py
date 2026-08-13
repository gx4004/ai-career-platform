import pytest
from pydantic import ValidationError

from app.config import Settings


def test_only_accepted_hs256_token_algorithm_is_configurable():
    assert Settings(ALGORITHM="HS256").ALGORITHM == "HS256"
    with pytest.raises(ValidationError):
        Settings(ALGORITHM="ES256")
