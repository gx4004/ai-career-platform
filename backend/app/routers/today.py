from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.today import TodayPlan
from app.services.today import todays_plan

router = APIRouter()


@router.get("", response_model=TodayPlan)
def get_today(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Today's best matches to add and the applications that need action."""
    return todays_plan(db, current_user.id)
