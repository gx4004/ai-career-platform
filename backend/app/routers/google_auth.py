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
    full_name = userinfo.get("name")

    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.google_id = google_id
            if not user.full_name and full_name:
                user.full_name = full_name
            db.commit()
        else:
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

    allowed_origins = {o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()}
    origin = request.headers.get("origin", "")
    if origin not in allowed_origins:
        origin = next(iter(allowed_origins), "http://localhost:5173")
    response = RedirectResponse(url=f"{origin}/dashboard")
    set_auth_cookies(response, access, refresh)
    return response
