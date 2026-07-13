from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.discovery_recommendations import DiscoveryRecommendationList
from app.services.discovery_recommendations import rank_discovery_recommendations

router = APIRouter()


@router.get("/recommendations", response_model=DiscoveryRecommendationList)
def list_recommendations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return rank_discovery_recommendations(db, current_user.id)
