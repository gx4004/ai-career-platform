from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from app.limiter import limiter
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
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthProvidersResponse,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.config import settings
from app.services.captcha import verify_captcha
from app.services.email_blocklist import is_disposable_email
from app.services.email_service import send_password_reset_email
from app.services.tool_runs import delete_all_user_data

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
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

    if settings.CAPTCHA_ENABLED:
        if not body.captcha_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA token is required",
            )
        is_valid = await verify_captcha(body.captcha_token)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CAPTCHA verification failed",
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
    refresh = create_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)

    return _user_response(user)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
def refresh_token(
    request: Request,
    response: Response,
    body: RefreshTokenRequest | None = None,
    db: Session = Depends(get_db),
):
    token = request.cookies.get("cw_refresh")
    if not token and body:
        token = body.refresh_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )
    user_id = verify_refresh_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)
    set_auth_cookies(response, access, refresh)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/logout", status_code=200)
def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@router.delete("/me", status_code=204)
def delete_account(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clear_auth_cookies(response)
    delete_all_user_data(db, current_user.id)
    return None


@router.get("/providers", response_model=AuthProvidersResponse)
def get_providers():
    providers = []
    if settings.GOOGLE_CLIENT_ID:
        providers.append("google")
    return AuthProvidersResponse(providers=providers)


@router.post("/password-reset/request", status_code=200)
@limiter.limit("3/minute")
async def request_password_reset(request: Request, body: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        token = create_password_reset_token(user.email, user.hashed_password or "")
        frontend_base = settings.FRONTEND_URL or "http://localhost:3000"
        reset_url = f"{frontend_base}/reset-password?token={token}"
        await send_password_reset_email(user.email, reset_url)
    return {"message": "If an account with this email exists, a reset link has been sent."}


@router.post("/password-reset/confirm", status_code=200)
async def confirm_password_reset(body: PasswordResetConfirm, db: Session = Depends(get_db)):
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
