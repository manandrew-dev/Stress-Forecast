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


# --- cross-course rep collisions (mirrors frontend/src/test/cross-course-collisions.test.ts) ---

from app.config import COHORT_MIN  # noqa: E402
from app.services.collisions import cross_course_rep_collisions, shared_course_ids  # noqa: E402

# Course 1 is the rep's course. Five students per combination (four take 1 + 4).
STUDENTS = [[1, 2]] * 5 + [[1, 3]] * 5 + [[1, 4]] * 4 + [[2, 3]] * 5


def test_shared_courses_use_the_threshold():
    # Course 4 has only 4 of course 1's students, so it isn't shared; [2, 3] students aren't in course 1.
    assert shared_course_ids(1, STUDENTS, 5) == [2, 3]


def test_shared_courses_ignore_duplicate_ids_and_other_students():
    assert shared_course_ids(1, [[1, 2, 2]] * 5 + [[2, 3]] * 9, 5) == [2]


def test_cross_course_pile_up_counts_who_it_affects():
    deadlines = [d("2026-11-03", 20, course_id=1), d("2026-11-05", 25, course_id=2)]
    [c] = cross_course_rep_collisions(1, deadlines, STUDENTS, [], 5)
    assert (c.deadline_count, c.total_weight_pct, c.students_affected) == (2, 45, 5)


def test_pile_ups_without_an_own_deadline_are_dropped():
    deadlines = [d("2026-10-01", 10, course_id=1), d("2026-11-05", 25, course_id=2), d("2026-11-06", 25, course_id=3)]
    assert cross_course_rep_collisions(1, deadlines, STUDENTS, [], 5) == []


def test_non_shared_courses_are_left_out():
    deadlines = [d("2026-11-03", 20, course_id=1), d("2026-11-04", 30, course_id=4)]
    assert cross_course_rep_collisions(1, deadlines, STUDENTS, [], 5) == []


def test_pile_ups_affecting_fewer_than_the_minimum_are_hidden():
    deadlines = [d("2026-11-03", 20, course_id=1), d("2026-11-05", 25, course_id=2)]
    assert cross_course_rep_collisions(1, deadlines, STUDENTS, [], 6) == []


def test_single_course_pile_up_counts_the_whole_class():
    deadlines = [d("2026-11-03", 20, course_id=1), d("2026-11-05", 25, course_id=1)]
    [c] = cross_course_rep_collisions(1, deadlines, STUDENTS, [], 5)
    assert c.students_affected == 14


def test_affected_counts_overlapping_own_collisions_only():
    # Students in 1+3 see their own 3-item pile-up overlapping; 1+2 students only have two 10% items.
    deadlines = [d("2026-11-03", 10, course_id=1), d("2026-11-04", 10, course_id=2),
                 d("2026-11-05", 10, course_id=3), d("2026-11-06", 10, course_id=3)]
    [c] = cross_course_rep_collisions(1, deadlines, STUDENTS, [], 5)
    assert c.deadline_count == 4 and c.students_affected == 5


def test_cross_course_peak_matches_rep_collisions():
    deadlines = [d("2026-11-03", 20, course_id=1), d("2026-11-05", 25, course_id=2)]
    daily = [(dt.date(2026, 10, 30), 9.9), (dt.date(2026, 10, 31), 7.0), (dt.date(2026, 11, 4), 7.5)]
    [c] = cross_course_rep_collisions(1, deadlines, STUDENTS, daily, 5)
    assert (c.peak_avg_stress, c.peak_date) == (7.5, dt.date(2026, 11, 4))


def test_cross_course_uses_cohort_min_from_config():
    assert COHORT_MIN == 5  # the router passes config.COHORT_MIN; never a literal


# --- heads-up nudge: only upcoming deadlines, named with the course code ---

DEMO_WEEK9 = [
    d("2026-11-03", 20, "Midterm 2", course_id=1),
    d("2026-11-05", 25, "Midterm 2", course_id=2),
    d("2026-11-07", 10, "Quiz 4", course_id=1),
]
CODES = {1: "CPSC 210", 2: "MATH 200"}


def test_nudge_skips_deadlines_already_past():
    [c] = find_collisions(DEMO_WEEK9)
    assert heads_up_message(c, dt.date(2026, 11, 7), CODES) == "3 assessments worth 55% in 5 days. Start CPSC 210 Quiz 4 early."


def test_nudge_includes_deadlines_due_today():
    [c] = find_collisions(DEMO_WEEK9)
    assert heads_up_message(c, dt.date(2026, 11, 5), CODES).endswith("Start MATH 200 Midterm 2 early.")


def test_nudge_left_out_when_everything_is_past():
    [c] = find_collisions(DEMO_WEEK9)
    assert heads_up_message(c, dt.date(2026, 11, 8), CODES) == "3 assessments worth 55% in 5 days."


def test_nudge_without_codes_falls_back_to_title():
    [c] = find_collisions(DEMO_WEEK9)
    assert heads_up_message(c, dt.date(2026, 11, 7)).endswith("Start Quiz 4 early.")


def test_heads_up_passes_today_and_codes():
    [c] = heads_up(DEMO_WEEK9, dt.date(2026, 11, 7), CODES)
    assert c.message.endswith("Start CPSC 210 Quiz 4 early.")


# --- weight rule needs a pile-up (>= COLLISION_WEIGHT_MIN_COUNT assessments) ---


def test_single_heavy_final_is_not_a_collision():
    assert find_collisions([d("2026-12-14", 50, "Final Exam")]) == []
    assert find_collisions([d("2026-12-14", 100, "Final Exam")]) == []


def test_two_assessments_reaching_the_weight_threshold_still_collide():
    [c] = find_collisions([d("2026-12-10", 20), d("2026-12-12", 20)])
    assert (c.deadline_count, c.total_weight_pct) == (2, 40)


def test_lone_heavy_final_no_longer_stretches_a_window():
    # Finals week in the seed: CPSC 20% (Dec 10), PHYS 35% (Dec 12), MATH 40% (Dec 14).
    finals = [d("2026-12-10", 20, course_id=1), d("2026-12-12", 35, course_id=3), d("2026-12-14", 40, course_id=2)]
    [c] = find_collisions(finals)
    assert (c.start, c.end) == (dt.date(2026, 12, 10), dt.date(2026, 12, 16))  # was Dec 18


def test_lone_heavy_assessment_gives_no_heads_up():
    assert heads_up([d("2026-11-10", 45, "Research Essay")], dt.date(2026, 11, 7)) == []


def test_lone_heavy_assessment_is_not_a_rep_pile_up():
    students = [[1]] * 20
    assert cross_course_rep_collisions(1, [d("2026-12-04", 40, "Research Essay", course_id=1)], students, [], 5) == []
