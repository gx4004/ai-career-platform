import logging

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.auth.security import create_access_token, create_refresh_token, set_auth_cookies
from app.config import settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def _resolve_frontend_url() -> str:
    allowed_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    return settings.FRONTEND_URL or (allowed_origins[0] if allowed_origins else "http://localhost:3000")


def _oauth_error_redirect(reason: str) -> RedirectResponse:
    """Redirect browser back to the frontend with a reason code.

    The Google callback is a full-page GET from Google — raising a JSON
    HTTPException lands users on a bare FastAPI error page. Redirecting back
    to the frontend's login/error page keeps the flow coherent.
    """
    return RedirectResponse(url=f"{_resolve_frontend_url()}/login?oauth_error={reason}")


@router.get("/login")
async def google_login(request: Request):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")
    redirect_uri = settings.GOOGLE_REDIRECT_URI
    if not redirect_uri:
        raise HTTPException(status_code=501, detail="Google OAuth redirect URI not configured")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:
        logger.exception("Google OAuth token exchange failed")
        return _oauth_error_redirect("auth_failed")

    userinfo = token.get("userinfo")
    if not userinfo:
        return _oauth_error_redirect("no_userinfo")

    google_id = userinfo["sub"]
    email = userinfo["email"]
    email_verified = userinfo.get("email_verified", False)
    full_name = userinfo.get("name")

    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            # Only link Google identity to an existing account when Google has
            # verified the email. Otherwise an attacker with a Google account
            # using an unverified victim email could claim the account.
            if not email_verified:
                logger.warning(
                    "Blocking Google OAuth account link: email not verified by Google (email=%s)",
                    email,
                )
                return _oauth_error_redirect("unverified_email")
            user = existing
            user.google_id = google_id
            if not user.full_name and full_name:
                user.full_name = full_name
            db.commit()
        else:
            if not email_verified:
                logger.warning(
                    "Blocking Google OAuth signup: email not verified by Google (email=%s)",
                    email,
                )
                return _oauth_error_redirect("unverified_email")
            user = User(
                email=email,
                google_id=google_id,
                full_name=full_name,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id, user.token_version)

    response = RedirectResponse(url=f"{_resolve_frontend_url()}/dashboard")
    set_auth_cookies(response, access, refresh)
    return response
