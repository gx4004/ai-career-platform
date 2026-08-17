from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.security import (
    clear_auth_cookies,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    set_auth_cookies,
    verify_password,
    verify_password_reset_token,
    verify_refresh_token,
)
from app.config import settings
from app.database import get_db
from app.limiter import clear_auth_failures, limiter, record_account_pressure, record_auth_failure
from app.models.user import User
from app.schemas.auth import (
    AuthProvidersResponse,
    AuthSessionResponse,
    DeleteAccountRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RegisterRequest,
    UserResponse,
)
from app.services.captcha import CaptchaVerdict, challenge_provider, verify_captcha
from app.services.email_blocklist import is_disposable_email
from app.services.email_service import send_password_reset_email
from app.services.tool_runs import delete_all_user_data

router = APIRouter()


class AuthProvidersPayload(AuthProvidersResponse):
    """Sign-up configuration this deployment advertises to the client.

    Extends the existing provider advertisement instead of adding a second
    configuration endpoint: the client already asks this endpoint what is
    configured before it renders the sign-up surface, and the registration
    challenge is exactly that kind of deployment fact. Only public
    configuration is exposed — never the provider secret.
    """

    captcha_required: bool = False
    captcha_provider: str | None = None


@router.post("/login", response_model=AuthSessionResponse)
@limiter.limit("10/minute")
async def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        await record_auth_failure(body.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    clear_auth_failures(body.email)
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)
    return AuthSessionResponse()


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
    await record_account_pressure("registration", body.email)

    # The challenge runs before anything that inspects this address, so no
    # response can reveal whether an address is already registered (or blocked)
    # until the challenge is satisfied. Returning the 409 first made the
    # challenge useless for the abuse it exists to stop: an attacker could
    # enumerate accounts at the plain rate limit while the challenge was on.
    if settings.CAPTCHA_ENABLED:
        if not body.captcha_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA token is required",
            )
        verdict = await verify_captcha(body.captcha_token)
        if verdict is not CaptchaVerdict.VERIFIED:
            # A refused token and an unreachable provider both fail closed, and
            # both get the same generic answer: the client-visible response
            # must not become a probe for provider state, and provider detail
            # never reaches the body. The unavailable case is distinguished
            # where it matters — in the service's warning log — and matches the
            # existing enabled-but-unconfigured posture, which also refuses to
            # register when the challenge cannot be asked.
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA verification failed",
            )

    if settings.DISPOSABLE_EMAIL_BLOCK_ENABLED and is_disposable_email(body.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Disposable email addresses are not allowed",
        )

    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)

    return _user_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.post("/refresh", response_model=AuthSessionResponse)
@limiter.limit("20/minute")
def refresh_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get("cw_refresh")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )
    claims = verify_refresh_token(token)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user = db.query(User).filter(User.id == claims["sub"]).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if claims.get("tv", 0) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)
    return AuthSessionResponse()


@router.post("/logout", status_code=200)
def logout(request: Request, response: Response):
    origin = request.headers.get("origin")
    allowed_origins = {
        value.strip().rstrip("/")
        for value in settings.CORS_ORIGINS.split(",")
        if value.strip()
    }
    if settings.FRONTEND_URL:
        allowed_origins.add(settings.FRONTEND_URL.rstrip("/"))
    if origin and origin.rstrip("/") not in allowed_origins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Origin is not allowed",
        )
    clear_auth_cookies(response)
    return {"ok": True}


@router.post("/me/delete", status_code=204)
@limiter.limit("5/minute")
def delete_account(
    request: Request,
    response: Response,
    body: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the current user's account and all associated data.

    The frontend gates this behind a typed-email confirmation; the API
    contract enforces the same confirmation server-side so a direct API
    call (curl, malicious extension, leaked auth cookie used by an attacker
    with another tab open) cannot bypass the ceremony. Confirmation is
    case-insensitive on the email — see schemas.auth.DeleteAccountRequest.
    """
    if body.confirmation.strip().lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Confirmation must match the account email exactly.",
        )
    clear_auth_cookies(response)
    delete_all_user_data(db, current_user.id)
    return None


@router.get("/providers", response_model=AuthProvidersPayload)
def get_providers():
    providers = []
    if settings.GOOGLE_CLIENT_ID:
        providers.append("google")
    provider = challenge_provider()
    return AuthProvidersPayload(
        providers=providers,
        captcha_required=provider is not None,
        captcha_provider=provider,
    )


@router.post("/password-reset/request", status_code=200)
@limiter.limit("3/minute")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    await record_account_pressure("password-reset", body.email)
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        token = create_password_reset_token(user.email, user.hashed_password or "")
        frontend_base = settings.FRONTEND_URL or "http://localhost:3000"
        # Keep the bearer token in the URL fragment so it is not sent in HTTP
        # requests, Referer headers, or ordinary server access logs.
        reset_url = f"{frontend_base}/reset-password#token={token}"
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
    return {"message": "If an account with this email exists, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=200)
@limiter.limit("10/minute")
def confirm_password_reset(request: Request, body: PasswordResetConfirm, db: Session = Depends(get_db)):
    # Reset tokens are signed with a secret derived from the user's password
    # hash, so we need the user record to verify the token. Extract the
    # subject (email) from unverified claims for lookup only — the actual
    # signature check happens below via verify_password_reset_token().
    try:
        from jose import jwt as jose_jwt
        from jose.exceptions import JWTError
        unverified = jose_jwt.get_unverified_claims(body.token)
        email_claim = unverified.get("sub")
    except (JWTError, ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if not email_claim:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user = db.query(User).filter(User.email == email_claim).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    # Verify token with password-derived secret (auto-invalidates after password change)
    email = verify_password_reset_token(body.token, user.hashed_password or "")
    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.hashed_password = hash_password(body.new_password)
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    return {"message": "Password has been reset successfully."}


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        is_admin=getattr(user, "is_admin", False),
        created_at=user.created_at.isoformat() if user.created_at else None,
    )
