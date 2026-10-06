from typing import Annotated

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

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

    @field_validator("full_name", mode="before")
    @classmethod
    def full_name_is_trimmed(cls, v: str | None) -> str | None:
        # Before the length bound, so the 200 limit applies to the trimmed text.
        if not isinstance(v, str):
            return v
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


class ProfileUpdateRequest(BaseModel):
    """`PATCH /auth/me`: the account's own name and address."""

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = Field(default=None, max_length=200)
    email: NormalizedEmail | None = None

    @field_validator("full_name", mode="before")
    @classmethod
    def full_name_is_trimmed(cls, v: str | None) -> str | None:
        if not isinstance(v, str):
            return v
        return v.strip() or None

    @model_validator(mode="after")
    def require_a_change(self):
        if not self.model_fields_set:
            raise ValueError("Send a name or an email address to change")
        if "email" in self.model_fields_set and self.email is None:
            raise ValueError("Email address cannot be empty")
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("current_password")
    @classmethod
    def current_is_valid_utf8(cls, v: str) -> str:
        utf8_size(v)
        return v

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        utf8_size(v)
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return _validate_bcrypt_password(v)


class PasswordResetRequestResponse(BaseModel):
    message: str
    # Development only (a local frontend): the link that was just emailed, so the
    # reset can be finished without a mail provider. Never set anywhere else.
    dev_reset_url: str | None = None


class AuthSessionResponse(BaseModel):
    ok: bool = True


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    is_active: bool
    is_admin: bool = False
    created_at: str | None = None
    # False for an account that signs in only with Google: it sets a password through the emailed link.
    has_password: bool = True

    model_config = {"from_attributes": True}


class SessionStateResponse(BaseModel):
    """`GET /auth/session`: the signed-in user, or null for a guest (never a 401)."""

    user: UserResponse | None = None
    # True only for a guest whose refresh cookie would succeed at POST /auth/refresh,
    # so a client without a local session hint still knows to refresh once.
    refreshable: bool = False


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
