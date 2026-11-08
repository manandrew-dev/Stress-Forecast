import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.getenv("DATABASE_URL") or None
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN") or None
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE") or None
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or None
GEMINI_MODEL = os.getenv("GEMINI_MODEL") or None

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

COHORT_MIN = 5
COLLISION_MIN_COUNT = 3
COLLISION_MIN_WEIGHT = 40
COLLISION_WEIGHT_MIN_COUNT = 2  # the weight rule needs at least this many assessments
COLLISION_WINDOW_DAYS = 5
COLLISION_PEAK_LOOKBACK_DAYS = 3
HEADS_UP_DAYS = 14

# Local day boundaries for check-in replacement, trends and cohort dates.
LOCAL_TIMEZONE = "America/Vancouver"

# Input limits for student uploads.
MAX_CHECKIN_CHARS = 2000
MAX_SYLLABUS_CHARS = 100_000
MAX_SYLLABUS_BYTES = 10 * 1024 * 1024

# Weekly Gemini reports are cached in memory per (course_id, week_start).
REPORT_CACHE_SECONDS = 30 * 60
