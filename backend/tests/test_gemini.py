"""Offline tests for services/gemini.py using a fake client (no API calls)."""

import asyncio
import datetime as dt
import json
from types import SimpleNamespace

import pytest

from app.models import Course, Deadline, RepCollision
from app.services import gemini


class FakeModels:
    def __init__(self, replies: list[str]):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return SimpleNamespace(text=self.replies.pop(0))


@pytest.fixture
def fake(monkeypatch):
    def install(*replies: str) -> FakeModels:
        models = FakeModels(list(replies))
        client = SimpleNamespace(aio=SimpleNamespace(models=models))
        monkeypatch.setattr(gemini, "_get_client", lambda: client)
        return models

    return install


GOOD_CHECKIN = json.dumps(
    {"stress": 8, "sleep_hours": 4, "causes": ["Sleep", " assignment deadlines "], "concerning": False}
)


def test_parse_checkin_valid(fake):
    models = fake(GOOD_CHECKIN)
    result = asyncio.run(gemini.parse_checkin("barely slept, two assignments due thursday"))
    assert result.stress == 8
    assert result.sleep_hours == 4
    assert result.causes == ["sleep", "assignment deadlines"]
    assert result.concerning is False
    assert len(models.calls) == 1
    assert models.calls[0]["config"].response_mime_type == "application/json"
    assert models.calls[0]["contents"] == "barely slept, two assignments due thursday"


def test_retries_once_then_succeeds(fake):
    models = fake("not json", GOOD_CHECKIN)
    result = asyncio.run(gemini.parse_checkin("tired"))
    assert result.stress == 8
    assert len(models.calls) == 2


def test_out_of_range_stress_counts_as_invalid(fake):
    bad = json.dumps({"stress": 11, "sleep_hours": None, "causes": [], "concerning": False})
    models = fake(bad, bad)
    with pytest.raises(gemini.AIParseError):
        asyncio.run(gemini.parse_checkin("ok"))
    assert len(models.calls) == 2


def test_empty_response_counts_as_invalid(fake):
    fake("", "")
    with pytest.raises(gemini.AIParseError):
        asyncio.run(gemini.parse_checkin("ok"))


def test_extract_deadlines(fake):
    reply = json.dumps(
        {
            "deadlines": [
                {"title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm"},
                {"title": "Lab 3", "due_date": "2026-10-20", "weight_pct": None, "type": "assignment"},
            ]
        }
    )
    models = fake(reply)
    result = asyncio.run(gemini.extract_deadlines("Midterm 1: Oct 14 (20%)", today=dt.date(2026, 9, 1)))
    assert [d.title for d in result] == ["Midterm 1", "Lab 3"]
    assert result[0].due_date == dt.date(2026, 10, 14)
    assert result[1].weight_pct is None
    assert "Today's date: 2026-09-01" in models.calls[0]["contents"]


def test_extract_deadlines_rejects_unknown_type(fake):
    bad = json.dumps({"deadlines": [{"title": "X", "due_date": "2026-10-14", "weight_pct": 5, "type": "essay"}]})
    fake(bad, bad)
    with pytest.raises(gemini.AIParseError):
        asyncio.run(gemini.extract_deadlines("..."))


def test_weekly_report_sends_only_aggregates(fake):
    reply = json.dumps({"summary": "s", "top_cause": "overlapping deadlines", "suggested_fix": "f"})
    models = fake(reply)
    course = Course(id=1, code="CPSC 210", name="Software Construction", term="2026W1")
    deadline = Deadline(
        id=12, course_id=1, title="Midterm 2", due_date=dt.date(2026, 11, 10), weight_pct=25, type="midterm"
    )
    collision = RepCollision(
        start=dt.date(2026, 11, 9),
        end=dt.date(2026, 11, 13),
        deadline_count=1,
        total_weight_pct=25,
        deadlines=[deadline],
        peak_avg_stress=8.1,
        peak_date=dt.date(2026, 11, 8),
    )
    report = asyncio.run(
        gemini.weekly_report(
            course,
            [(dt.date(2026, 11, 3), 5.123), (dt.date(2026, 11, 2), 5.0)],
            [deadline],
            [collision],
            week_start=dt.date(2026, 11, 2),
        )
    )
    assert report.top_cause == "overlapping deadlines"

    sent = json.loads(models.calls[0]["contents"])
    assert sent["report_week"] == {"start": "2026-11-02", "end": "2026-11-08"}
    assert sent["daily_avg_stress"][0] == {"date": "2026-11-02", "avg_stress": 5.0}
    assert sent["daily_avg_stress"][1]["avg_stress"] == 5.12
    # No ids of any kind leave the server.
    assert "id" not in sent["course"]
    assert all("id" not in d and "course_id" not in d for d in sent["deadlines"])
