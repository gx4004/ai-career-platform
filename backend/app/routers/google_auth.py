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
        raise HTTPException(status_code=400, detail="OAuth authentication failed")

    userinfo = token.get("userinfo")
    if not userinfo:
        raise HTTPException(status_code=400, detail="Could not retrieve user info from Google")

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
                raise HTTPException(
                    status_code=400,
                    detail="Google account email is not verified. Please verify your email with Google or sign in with password.",
                )
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
                raise HTTPException(
                    status_code=400,
                    detail="Google account email is not verified.",
                )
            user = User(
                email=email,
                google_id=google_id,
                full_name=full_name,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id)

    # OAuth callback is a GET redirect from Google — no Origin header is present.
    # Use the first configured CORS origin as the frontend URL.
    allowed_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
    frontend_url = settings.FRONTEND_URL or (allowed_origins[0] if allowed_origins else "http://localhost:3000")
    response = RedirectResponse(url=f"{frontend_url}/dashboard")
    set_auth_cookies(response, access, refresh)
    return response
