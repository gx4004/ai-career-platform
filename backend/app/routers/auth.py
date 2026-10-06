from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import (
    clear_auth_cookies,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    dummy_password_hash,
    get_current_user,
    get_optional_current_user,
    hash_password,
    set_auth_cookies,
    verify_password,
    verify_password_reset_token,
    verify_refresh_token,
)
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.routers.google_auth import google_sign_in_configured
from app.schemas.auth import (
    AuthProvidersResponse,
    AuthSessionResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    ProfileUpdateRequest,
    RegisterRequest,
    SessionStateResponse,
    UserResponse,
)
from app.services.email_blocklist import is_disposable_email
from app.services.email_service import send_password_reset_email
from app.services.tool_runs import delete_all_user_data

router = APIRouter()


@router.post("/login", response_model=AuthSessionResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    # Sync on purpose: bcrypt takes ~250 ms and must run in the threadpool, not on
    # the event loop that serves every other request.
    user = db.query(User).filter(func.lower(User.email) == body.email).first()
    stored_hash = user.hashed_password if user else None
    # Always pay for one verification (against a dummy hash when there is no
    # stored password) so an unknown address is not faster than a wrong password.
    password_ok = verify_password(body.password, stored_hash or dummy_password_hash())
    if not user or not stored_hash or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )
    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)
    return AuthSessionResponse()


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
    if settings.DISPOSABLE_EMAIL_BLOCK_ENABLED and is_disposable_email(body.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Disposable email addresses are not allowed",
        )

    existing = db.query(User).filter(func.lower(User.email) == body.email).first()
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
    try:
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent registration of the same address: the
        # unique lower(email) index is the real guard.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None
    db.refresh(user)

    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)

    return _user_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.get("/session", response_model=SessionStateResponse)
def get_session(current_user: User | None = Depends(get_optional_current_user)):
    """The signed-in user or null, always a 200: a guest's page load is not a failed request.

    Reads the same access cookie (or bearer token) as ``/me`` and never refreshes or
    sets cookies; an expired, revoked or malformed token is simply a guest.
    """
    return SessionStateResponse(user=_user_response(current_user) if current_user else None)


@router.patch("/me", response_model=UserResponse)
@limiter.limit("10/minute")
def update_me(
    request: Request,
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.email is not None:
        # The own address in other capitals is no change, only normalisation.
        if body.email != current_user.email.lower():
            if settings.DISPOSABLE_EMAIL_BLOCK_ENABLED and is_disposable_email(body.email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Disposable email addresses are not allowed",
                )
            taken = (
                db.query(User.id)
                .filter(func.lower(User.email) == body.email, User.id != current_user.id)
                .first()
            )
            if taken:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Email already registered",
                )
        current_user.email = body.email
    if "full_name" in body.model_fields_set:
        current_user.full_name = body.full_name
    try:
        db.commit()
    except IntegrityError:
        # Lost a race for the address: the unique lower(email) index is the real guard.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None
    db.refresh(current_user)
    return _user_response(current_user)


@router.post("/change-password", response_model=AuthSessionResponse)
@limiter.limit("5/minute")
def change_password(
    request: Request,
    response: Response,
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Sync on purpose (bcrypt, see login). A wrong current password is a 400, not a
    # 401: the client reads a 401 as an expired session.
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no password yet. Use \"Forgot password\" to set one.",
        )
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    current_user.hashed_password = hash_password(body.new_password)
    # Ends every other session (and any copied token); this one gets fresh cookies.
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()
    access = create_access_token(current_user.id, current_user.token_version)
    refresh = create_refresh_token(current_user.id, current_user.token_version)
    set_auth_cookies(response, access, refresh)
    return AuthSessionResponse()


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
    access = create_access_token(user.id, user.token_version)
    refresh = create_refresh_token(user.id, user.token_version)
    set_auth_cookies(response, access, refresh)
    return AuthSessionResponse()


@router.post("/logout", status_code=200)
def logout(
    request: Request,
    response: Response,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
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
    if current_user is not None:
        # Clearing cookies only helps this browser; bumping the version also
        # kills any copy of the session tokens (refresh included).
        current_user.token_version = (current_user.token_version or 0) + 1
        db.commit()
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


@router.get("/providers", response_model=AuthProvidersResponse)
def get_providers():
    providers = []
    if google_sign_in_configured():
        providers.append("google")
    return AuthProvidersResponse(providers=providers)


@router.post(
    "/password-reset/request",
    status_code=200,
    response_model=PasswordResetRequestResponse,
    response_model_exclude_none=True,
)
@limiter.limit("3/minute")
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    result = PasswordResetRequestResponse(
        message="If an account with this email exists, a reset link has been sent."
    )
    user = db.query(User).filter(func.lower(User.email) == body.email).first()
    if user:
        token = create_password_reset_token(user.email, user.hashed_password or "")
        frontend_base = settings.FRONTEND_URL or "http://localhost:3000"
        # Keep the bearer token in the URL fragment so it is not sent in HTTP
        # requests, Referer headers, or ordinary server access logs.
        reset_url = f"{frontend_base}/reset-password#token={token}"
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
        if _dev_reset_link_allowed(request, reset_url):
            result.dev_reset_url = reset_url
    return result


def _dev_reset_link_allowed(request: Request, reset_url: str) -> bool:
    """Hand the reset link back only to a caller on this machine, in development.

    Anywhere else it would let whoever knows an address take over the account.
    ENVIRONMENT and FRONTEND_URL both default to local values, so a deployment
    that forgot both settings is caught only by the caller check: a request from
    another machine or through a hosting proxy does not arrive from loopback (the
    local Vite dev proxy does, which is the intended path).
    """
    if settings.ENVIRONMENT != "development":
        return False
    if (request.client.host if request.client else "") not in {"127.0.0.1", "::1"}:
        return False
    parsed = urlparse(reset_url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "http" and (
        host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".localhost")
    )


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
    user = db.query(User).filter(func.lower(User.email) == str(email_claim).strip().lower()).first()
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
