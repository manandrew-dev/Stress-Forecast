"""Local-day helpers. Check-in replacement, trends and cohort dates all use LOCAL_TIMEZONE."""

import datetime as dt
from zoneinfo import ZoneInfo

from .config import LOCAL_TIMEZONE

TZ = ZoneInfo(LOCAL_TIMEZONE)


def now() -> dt.datetime:
    """Current local time, to the second, with its UTC offset."""
    return dt.datetime.now(TZ).replace(microsecond=0)


def today() -> dt.date:
    return now().date()


def day_bounds(day: dt.date) -> tuple[dt.datetime, dt.datetime]:
    """[local midnight, next local midnight), correct across daylight-saving changes."""
    start = dt.datetime.combine(day, dt.time(), TZ)
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(), TZ)
    return start, end


def week_start(day: dt.date) -> dt.date:
    """Monday of the week containing ``day``."""
    return day - dt.timedelta(days=day.weekday())
