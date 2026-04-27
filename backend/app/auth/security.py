import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from starlette.responses import Response

from app.config import settings
from app.database import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False

    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire, "iat": now}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "type": "refresh",
        "jti": uuid.uuid4().hex,
        "tv": token_version,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_refresh_token(token: str) -> dict | None:
    """Return decoded claims {sub, tv} if valid refresh token, else None.

    Caller must still compare tv against the user's current token_version
    to detect revocation (password reset, explicit logout-everywhere).
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") != "refresh":
            return None
        sub = payload.get("sub")
        if not sub:
            return None
        return {"sub": sub, "tv": payload.get("tv", 0)}
    except JWTError:
        return None


def _reset_token_secret(password_hash: str) -> str:
    """Derive a reset-specific secret that invalidates when the password changes."""
    return f"{settings.SECRET_KEY}:reset:{password_hash[:16]}"


def create_password_reset_token(email: str, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": email, "exp": expire, "iat": now, "type": "password_reset", "jti": uuid.uuid4().hex}
    return jwt.encode(payload, _reset_token_secret(password_hash), algorithm=settings.ALGORITHM)


def verify_password_reset_token(token: str, password_hash: str) -> str | None:
    try:
        payload = jwt.decode(token, _reset_token_secret(password_hash), algorithms=[settings.ALGORITHM])
        if payload.get("type") != "password_reset":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    is_prod = settings.ENVIRONMENT != "development"
    response.set_cookie(
        key="cw_access",
        value=access_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/api",
    )
    response.set_cookie(
        key="cw_refresh",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/v1/auth/refresh",  # Scoped to exact endpoint — frontend silentRefresh() must call /api/v1/auth/refresh
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="cw_access", path="/api")
    response.delete_cookie(key="cw_refresh", path="/api/v1/auth/refresh")


def decode_token(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("type") == "refresh":
            return None
        return payload.get("sub")
    except JWTError:
        return None


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    token = None
    if credentials is not None:
        token = credentials.credentials
    else:
        token = request.cookies.get("cw_access")

    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    user_id = decode_token(token)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated"
        )
    return user


def get_current_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def get_optional_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Resolve the current user without requiring auth.

    A missing, expired, malformed, or revoked token is treated as "guest" — we
    never raise from here. Tool routers rely on this to fall through into the
    guest-demo path; raising 401 would break stale-session UX (an expired access
    cookie should silently downgrade to guest, not fail the whole request).
    """
    token = None
    if credentials is not None:
        token = credentials.credentials
    else:
        token = request.cookies.get("cw_access")

    if token is None:
        return None

    user_id = decode_token(token)
    if user_id is None:
        return None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None

    return user
