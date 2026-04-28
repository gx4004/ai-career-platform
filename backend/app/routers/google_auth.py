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
            # New-user path. The email registration flow now requires an
            # explicit ToS checkbox (RegisterRequest.tos_accepted). If we
            # silently created a User here, OAuth signups would bypass that
            # consent gate. Until we ship a ToS-acceptance flow on the
            # OAuth side (e.g. signed state carrying the consent or a
            # post-callback /terms-acceptance interstitial), redirect new
            # OAuth users to the email signup form instead. Existing Google
            # accounts (already-linked users) are unaffected — the lookup
            # by google_id above succeeds and we never reach this branch.
            logger.info(
                "Blocking Google OAuth signup: no existing account, ToS gate not yet "
                "wired for OAuth (email=%s)",
                email,
            )
            return _oauth_error_redirect("signup_via_email_required")

    access = create_access_token(user.id)
    refresh = create_refresh_token(user.id, user.token_version)

    response = RedirectResponse(url=f"{_resolve_frontend_url()}/dashboard")
    set_auth_cookies(response, access, refresh)
    return response
