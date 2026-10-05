from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator

from app.schemas.validation import utf8_size

# Addresses are compared case-insensitively everywhere; EmailStr alone only
# lower-cases the domain, so a mobile keyboard's "Qa@..." would be a new person.
NormalizedEmail = Annotated[EmailStr, AfterValidator(lambda value: value.strip().lower())]


def _validate_bcrypt_password(value: str) -> str:
    if utf8_size(value) > 72:
        raise ValueError("Password must be at most 72 UTF-8 bytes")
    return value


class LoginRequest(BaseModel):
    email: NormalizedEmail
    password: str

    @field_validator("password")
    @classmethod
    def password_is_valid_utf8(cls, v: str) -> str:
        # Existing bcrypt hashes created before the 72-byte registration bound
        # must remain usable. Only validate encoding at login; enforce the new
        # byte ceiling when creating or replacing a password.
        utf8_size(v)
        return v


class RegisterRequest(BaseModel):
    email: NormalizedEmail
    password: str
    # Bounded so a pasted paragraph cannot break the account menu layout.
    full_name: str | None = Field(default=None, max_length=200)
    tos_accepted: bool  # Required field, no default

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        utf8_size(v)
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return _validate_bcrypt_password(v)

    @field_validator("full_name")
    @classmethod
    def full_name_is_trimmed(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.strip() or None

    @field_validator("tos_accepted")
    @classmethod
    def tos_must_be_accepted(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must accept the Terms of Service")
        return v


class PasswordResetRequest(BaseModel):
    email: NormalizedEmail


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        utf8_size(v)
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return _validate_bcrypt_password(v)


class AuthSessionResponse(BaseModel):
    ok: bool = True


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    is_active: bool
    is_admin: bool = False
    created_at: str | None = None

    model_config = {"from_attributes": True}


class AuthProvidersResponse(BaseModel):
    providers: list[str] = []


class DeleteAccountRequest(BaseModel):
    """Confirmation payload for `POST /auth/me/delete`.

    The router compares `confirmation` (case-insensitive, trimmed) against the
    authenticated user's email. The Settings UI requires the same string in a
    typed-confirmation dialog; surfacing the requirement here makes the
    ceremony part of the API contract instead of a client-side niceity.
    """

    confirmation: str
