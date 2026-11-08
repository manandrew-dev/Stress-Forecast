"""Deadline collision detection (docs/architecture.md §7).

Pure functions with no database access, so they can be tested with plain lists.

A collision is a COLLISION_WINDOW_DAYS-day window holding at least
COLLISION_MIN_COUNT assessments, or assessments whose known weights add up to at
least COLLISION_MIN_WEIGHT percent. Deadlines with ``weight_pct = None`` count
toward the assessment count but contribute 0 to the total weight, so
``total_weight_pct`` is a lower bound whenever a weight is unknown.
"""

import datetime as dt
from collections.abc import Iterable, Sequence

from ..config import (
    COLLISION_MIN_COUNT,
    COLLISION_MIN_WEIGHT,
    COLLISION_PEAK_LOOKBACK_DAYS,
    COLLISION_WINDOW_DAYS,
    HEADS_UP_DAYS,
)
from ..models import CollisionWindow, Deadline, HeadsUpCollision, RepCollision

# One non-suppressed day of cohort stress: (date, avg_stress).
DailyStress = tuple[dt.date, float]


def _known_weight(deadlines: Iterable[Deadline]) -> float:
    return float(sum(d.weight_pct or 0 for d in deadlines))


def _is_collision(deadlines: Sequence[Deadline]) -> bool:
    return (
        len(deadlines) >= COLLISION_MIN_COUNT
        or _known_weight(deadlines) >= COLLISION_MIN_WEIGHT
    )


def find_collisions(deadlines: Sequence[Deadline]) -> list[CollisionWindow]:
    """Return merged collision windows, ordered by start date.

    Pass one course's deadlines for the rep view, or every deadline across a
    student's courses for the heads-up.
    """
    ordered = sorted(deadlines, key=lambda d: (d.due_date, d.id))
    span = dt.timedelta(days=COLLISION_WINDOW_DAYS - 1)

    # A window's contents only change when it starts on a deadline, so checking
    # one window per distinct due date covers every possible 5-day window.
    flagged: list[tuple[dt.date, dt.date]] = []
    for start in sorted({d.due_date for d in ordered}):
        end = start + span
        inside = [d for d in ordered if start <= d.due_date <= end]
        if _is_collision(inside):
            flagged.append((start, end))

    merged: list[tuple[dt.date, dt.date]] = []
    for start, end in flagged:
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))

    collisions = []
    for start, end in merged:
        inside = [d for d in ordered if start <= d.due_date <= end]
        collisions.append(
            CollisionWindow(
                start=start,
                end=end,
                deadline_count=len(inside),
                total_weight_pct=_known_weight(inside),
                deadlines=inside,
            )
        )
    return collisions


def rep_collisions(
    deadlines: Sequence[Deadline],
    daily_stress: Sequence[DailyStress],
) -> list[RepCollision]:
    """Collisions for one course, each with the nearby cohort stress peak.

    ``daily_stress`` must contain only non-suppressed days (n_students >=
    COHORT_MIN). The peak is searched from COLLISION_PEAK_LOOKBACK_DAYS before
    the window to its end; ties go to the earliest day. Both peak fields are
    ``None`` when no day in that range has data.
    """
    lookback = dt.timedelta(days=COLLISION_PEAK_LOOKBACK_DAYS)
    result = []
    for window in find_collisions(deadlines):
        nearby = [
            (day, stress)
            for day, stress in daily_stress
            if window.start - lookback <= day <= window.end
        ]
        peak = max(nearby, key=lambda p: (p[1], -p[0].toordinal()), default=None)
        result.append(
            RepCollision(
                **window.model_dump(),
                peak_avg_stress=peak[1] if peak else None,
                peak_date=peak[0] if peak else None,
            )
        )
    return result


def heads_up(deadlines: Sequence[Deadline], today: dt.date) -> list[HeadsUpCollision]:
    """Collisions overlapping the next HEADS_UP_DAYS days, with a short message.

    Pass every deadline across the student's courses and the student's local date.
    """
    horizon_end = today + dt.timedelta(days=HEADS_UP_DAYS - 1)
    return [
        HeadsUpCollision(**window.model_dump(), message=heads_up_message(window))
        for window in find_collisions(deadlines)
        if window.end >= today and window.start <= horizon_end
    ]


def heads_up_message(window: CollisionWindow) -> str:
    """Deterministic one-line summary plus a nudge to start the heaviest item."""
    days = (window.end - window.start).days + 1
    count = window.deadline_count
    noun = "assessment" if count == 1 else "assessments"
    weight = f"{window.total_weight_pct:g}%"
    unknown = any(d.weight_pct is None for d in window.deadlines)

    if window.total_weight_pct == 0:
        summary = f"{count} {noun} in {days} days."
    elif unknown:
        summary = f"{count} {noun} worth at least {weight} in {days} days."
    else:
        summary = f"{count} {noun} worth {weight} in {days} days."

    heaviest = max(
        window.deadlines,
        key=lambda d: (d.weight_pct or 0, -d.due_date.toordinal()),
    )
    return f"{summary} Start {heaviest.title} early."
