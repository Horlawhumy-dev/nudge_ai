from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import OnboardingProfile
from app.engine import composer
from app.models.client import ModelError, get_client
from app.schemas.models import AnalyticsOverview
from app.services import nudge_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def overview(
    user: CurrentUser, session: SessionDep, phrase: bool = Query(default=False)
) -> AnalyticsOverview:
    """Deterministic productivity numbers, with optional model phrasing.

    The numbers are computed, never generated. ``phrase`` asks the fast tier
    to word one insight sentence from them; if the model fails, the numbers
    still return and ``insight`` stays null.
    """
    report = await nudge_service.analytics_overview(session, user.id)
    if not phrase:
        return report
    try:
        profile = await session.scalar(
            select(OnboardingProfile).where(OnboardingProfile.user_id == user.id)
        )
        style = profile.tone or profile.nudge_style if profile is not None else None
        composed = await composer.phrase_insight(
            get_client(),
            tone=style,
            numbers={
                "active_streaks": report.active_streaks,
                "completions_last_7d": report.completions_last_7d,
                "nudges_sent_7d": report.nudges_sent_7d,
                "nudges_suppressed_7d": report.nudges_suppressed_7d,
                "suppressions_by_rule": report.suppressions_by_rule,
            },
        )
        report.insight = composed.text
    except ModelError as exc:
        log.warning("insight phrasing failed, returning numbers only: %s", exc)
    return report
