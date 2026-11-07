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
