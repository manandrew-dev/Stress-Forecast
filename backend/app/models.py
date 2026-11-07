import datetime as dt
from typing import Annotated, Literal

from fastapi import UploadFile
from pydantic import AwareDatetime, BaseModel, Field

from .config import COHORT_MIN

Role = Literal["student", "rep"]
DeadlineType = Literal["exam", "midterm", "quiz", "assignment", "project", "other"]
StressScore = Annotated[int, Field(ge=1, le=10)]
ErrorCode = Literal[
    "bad_request", "unauthorized", "forbidden", "not_found", "ai_parse_failed", "internal"
]


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class Course(BaseModel):
    id: int
    code: str
    name: str
    term: str


class DeadlineInput(BaseModel):
    title: str
    due_date: dt.date
    weight_pct: float | None
    type: DeadlineType


class Deadline(DeadlineInput):
    id: int
    course_id: int


class CoursesResponse(BaseModel):
    courses: list[Course]


class MeResponse(CoursesResponse):
    id: str
    role: Role


class EnrollmentsRequest(BaseModel):
    course_ids: list[int]


class SyllabusRequest(BaseModel):
    course_id: int
    text: str


class SyllabusUpload(BaseModel):
    course_id: int
    file: UploadFile


class SyllabusResponse(BaseModel):
    course_id: int
    deadlines: list[DeadlineInput]


class SaveDeadlinesRequest(BaseModel):
    course_id: int
    deadlines: list[DeadlineInput]


class DeadlinesResponse(BaseModel):
    deadlines: list[Deadline]


class CheckinRequest(BaseModel):
    text: str


class CheckinResponse(BaseModel):
    time: AwareDatetime
    stress: StressScore
    sleep_hours: float | None
    causes: list[str]
    concerning: bool
    replaced_earlier: bool


class DateRange(BaseModel):
    from_date: dt.date | None = Field(default=None, alias="from")
    to_date: dt.date | None = Field(default=None, alias="to")


class TrendPoint(BaseModel):
    date: dt.date
    stress: StressScore
    sleep_hours: float | None


class TrendResponse(DeadlinesResponse):
    points: list[TrendPoint]


class CollisionWindow(BaseModel):
    start: dt.date
    end: dt.date
    deadline_count: int
    total_weight_pct: float
    deadlines: list[Deadline]


class HeadsUpCollision(CollisionWindow):
    message: str


class HeadsUpResponse(BaseModel):
    collisions: list[HeadsUpCollision]


class VisibleCohortDay(BaseModel):
    date: dt.date
    avg_stress: float
    n_students: int = Field(ge=COHORT_MIN)
    suppressed: Literal[False]


class SuppressedCohortDay(BaseModel):
    date: dt.date
    avg_stress: None
    n_students: None
    suppressed: Literal[True]


CohortDay = Annotated[VisibleCohortDay | SuppressedCohortDay, Field(discriminator="suppressed")]


class CohortResponse(DeadlinesResponse):
    course: Course
    min_students: int
    days: list[CohortDay]


class RepCollision(CollisionWindow):
    peak_avg_stress: float | None
    peak_date: dt.date | None


class CollisionsResponse(BaseModel):
    collisions: list[RepCollision]


class ReportQuery(BaseModel):
    week_start: dt.date | None = None


class ReportResponse(BaseModel):
    week_start: dt.date
    summary: str
    top_cause: str
    suggested_fix: str


class Insight(BaseModel):
    week_start: dt.date
    finding: str


class InsightsResponse(BaseModel):
    insights: list[Insight]
