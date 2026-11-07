import datetime as dt
import itertools

from app.services.collisions import find_collisions, heads_up, heads_up_message, rep_collisions
from app.models import Deadline

_ids = itertools.count(1)


def d(day: str, weight: float | None = 10, title: str | None = None, course_id: int = 1) -> Deadline:
    i = next(_ids)
    return Deadline(
        id=i,
        course_id=course_id,
        title=title or f"Item {i}",
        due_date=dt.date.fromisoformat(day),
        weight_pct=weight,
        type="assignment",
    )


def test_no_deadlines():
    assert find_collisions([]) == []


def test_two_light_deadlines_are_not_a_collision():
    assert find_collisions([d("2026-11-10", 10), d("2026-11-11", 10)]) == []


def test_three_deadlines_in_five_days():
    [c] = find_collisions([d("2026-11-10"), d("2026-11-12"), d("2026-11-14")])
    assert (c.start, c.end) == (dt.date(2026, 11, 10), dt.date(2026, 11, 14))
    assert c.deadline_count == 3
    assert c.total_weight_pct == 30


def test_three_deadlines_spread_over_six_days_is_not_a_collision():
    assert find_collisions([d("2026-11-10"), d("2026-11-12"), d("2026-11-15")]) == []


def test_heavy_weight_alone_triggers_collision():
    [c] = find_collisions([d("2026-11-10", 25), d("2026-11-13", 15)])
    assert c.deadline_count == 2
    assert c.total_weight_pct == 40


def test_weight_just_below_threshold():
    assert find_collisions([d("2026-11-10", 25), d("2026-11-13", 14.5)]) == []


def test_null_weight_counts_toward_count_but_not_weight():
    [c] = find_collisions([d("2026-11-10", None), d("2026-11-11", None), d("2026-11-12", 20)])
    assert c.deadline_count == 3
    assert c.total_weight_pct == 20


def test_null_weights_never_trigger_weight_rule():
    assert find_collisions([d("2026-11-10", None), d("2026-11-11", 39)]) == []


def test_overlapping_windows_merge():
    deadlines = [d("2026-11-10"), d("2026-11-11"), d("2026-11-12"), d("2026-11-15"), d("2026-11-16")]
    [c] = find_collisions(deadlines)
    # Windows starting 11-10, 11-11 and 11-12 are flagged; 11-15 (2 items, 20%) is not.
    assert (c.start, c.end) == (dt.date(2026, 11, 10), dt.date(2026, 11, 16))
    assert c.deadline_count == 5
    assert [x.id for x in c.deadlines] == sorted(x.id for x in deadlines)


def test_separate_collisions_stay_separate():
    week5 = [d("2026-10-05"), d("2026-10-06"), d("2026-10-07")]
    week9 = [d("2026-11-09", 20), d("2026-11-10", 25), d("2026-11-12", 10)]
    cs = find_collisions(week9 + week5)
    assert [c.start for c in cs] == [dt.date(2026, 10, 5), dt.date(2026, 11, 9)]
    assert cs[1].total_weight_pct == 55


def test_same_day_deadlines():
    [c] = find_collisions([d("2026-11-10"), d("2026-11-10"), d("2026-11-10")])
    assert c.deadline_count == 3


def test_rep_collision_peak_includes_lookback_and_ignores_outside_days():
    deadlines = [d("2026-11-09", 20), d("2026-11-10", 25), d("2026-11-12", 10)]
    daily = [
        (dt.date(2026, 11, 5), 9.9),   # 4 days before start: outside lookback
        (dt.date(2026, 11, 6), 6.0),   # 3 days before start: inside
        (dt.date(2026, 11, 8), 8.1),
        (dt.date(2026, 11, 11), 7.5),
        (dt.date(2026, 11, 14), 9.5),  # after window end: outside
    ]
    [c] = rep_collisions(deadlines, daily)
    assert c.peak_avg_stress == 8.1
    assert c.peak_date == dt.date(2026, 11, 8)


def test_rep_collision_peak_tie_goes_to_earliest_day():
    deadlines = [d("2026-11-09"), d("2026-11-10"), d("2026-11-11")]
    daily = [(dt.date(2026, 11, 10), 7.0), (dt.date(2026, 11, 8), 7.0)]
    [c] = rep_collisions(deadlines, daily)
    assert c.peak_date == dt.date(2026, 11, 8)


def test_rep_collision_without_stress_data():
    [c] = rep_collisions([d("2026-11-09"), d("2026-11-10"), d("2026-11-11")], [])
    assert c.peak_avg_stress is None and c.peak_date is None


def test_heads_up_only_returns_upcoming_windows():
    past = [d("2026-10-01"), d("2026-10-02"), d("2026-10-03")]
    soon = [d("2026-11-16"), d("2026-11-17"), d("2026-11-18")]
    later = [d("2026-12-10"), d("2026-12-11"), d("2026-12-12")]
    cs = heads_up(past + soon + later, today=dt.date(2026, 11, 7))
    assert [c.start for c in cs] == [dt.date(2026, 11, 16)]


def test_heads_up_includes_window_already_in_progress():
    deadlines = [d("2026-11-05"), d("2026-11-07"), d("2026-11-08")]
    [c] = heads_up(deadlines, today=dt.date(2026, 11, 7))
    assert c.start == dt.date(2026, 11, 5)


def test_heads_up_horizon_is_fourteen_days():
    edge = [d("2026-11-20"), d("2026-11-21"), d("2026-11-22")]
    assert len(heads_up(edge, today=dt.date(2026, 11, 7))) == 1   # starts on day 14
    beyond = [d("2026-11-21"), d("2026-11-22"), d("2026-11-23")]
    assert heads_up(beyond, today=dt.date(2026, 11, 7)) == []     # starts on day 15


def test_heads_up_message_known_weights():
    deadlines = [
        d("2026-11-09", 20, "Midterm 2"),
        d("2026-11-10", 25, "Project Phase 3"),
        d("2026-11-12", 10, "Quiz 4"),
    ]
    [c] = find_collisions(deadlines)
    assert heads_up_message(c) == "3 assessments worth 55% in 5 days. Start Project Phase 3 early."


def test_heads_up_message_with_unknown_weight_says_at_least():
    [c] = find_collisions([d("2026-11-09", 30, "Lab"), d("2026-11-10", None), d("2026-11-11", 15)])
    assert heads_up_message(c).startswith("3 assessments worth at least 45% in 5 days.")


def test_heads_up_message_with_no_known_weights():
    [c] = find_collisions([d("2026-11-09", None, "A"), d("2026-11-10", None), d("2026-11-11", None)])
    assert heads_up_message(c) == "3 assessments in 5 days. Start A early."


def test_mixed_courses_for_student_combination():
    deadlines = [d("2026-11-09", course_id=1), d("2026-11-10", course_id=2), d("2026-11-11", course_id=3)]
    [c] = find_collisions(deadlines)
    assert {x.course_id for x in c.deadlines} == {1, 2, 3}
