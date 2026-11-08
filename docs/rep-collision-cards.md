# Rep collision cards

How the rep's **Pile-ups** page (`frontend/src/pages/rep/CollisionsPage.tsx`) shows each collision.

**Pile-ups mix courses (changed Nov 7).** A rep's pile-ups include the deadlines of other courses that at least 5 of the class also take, as long as the window has at least one deadline of the rep's own course. Each card says how many of the class it actually affects. The rules are in `docs/requirements.md` §4 and `docs/api.md` (collisions); the backend and sample data are being updated to match.

## What a card shows

```
Nov 3 – Nov 6          3 assessments   18% avg per course
Affects 28 of 42 students
[CPSC 210 25%] [PHYS 118 10%] [MATH 200 20%]
  CPSC 210  Midterm 2         Nov 3   25%   ← this course
  PHYS 118  Circuits project  Nov 4   10%
  MATH 200  Midterm 2         Nov 6   20%
Nearby stress peak: 8.8 on Nov 3
```

- **Date window and count:** when the pile-up happens and how many assessments land in it.
- **Avg per course:** see below.
- **Students affected:** how many of this class would feel this pile-up given their own courses, out of everyone enrolled (`students_affected` of `cohort_size`). Pile-ups affecting fewer than 5 students aren't shown, for privacy.
- **Course chips:** each course's share of its own grade in this window.
- **Deadline list:** every assessment in the window. The rep's own course is highlighted, since those are the dates they can ask their instructor to move.
- **Nearby stress peak:** the highest daily class average from 3 days before the window to its last day (`COLLISION_PEAK_LOOKBACK_DAYS` in `backend/app/config.py`). Ties go to the earliest day.

## Avg per course

Weights from different courses are shares of different grades, so adding them together doesn't mean anything (three finals added up to "120% combined"). Instead:

1. Add up each course's assessments in the window.
2. Average those course totals.

Example: ENGL 110 has a 10% quiz and a 20% essay, and PHYS 118 has a 50% exam.

| Course | Assessments | Course total |
| --- | --- | --- |
| ENGL 110 | 10% + 20% | 30% |
| PHYS 118 | 50% | 50% |
| **Avg per course** | (30 + 50) ÷ 2 | **40%** |

Rules:

- Assessments with no weight (e.g. participation) are skipped. A course with no weights at all is left out of the average and its chip shows "—".
- The average is rounded to a whole number.
- Chips are listed in the order each course's first deadline is due.

The average makes a pile-up spread across several courses look smaller (the example above is 18% avg per course, versus 55% combined). The assessment count, the students affected and the stress peak show how bad it is; the average shows how heavy each course's part is.

## Stress peak messages

| Situation | Card says |
| --- | --- |
| Peak found | "Nearby stress peak: 8.8 on Nov 3" |
| Window started before today, but too few check-ins nearby | "Nearby stress peak: Not enough responses" |
| Window starts today or later, with no peak yet | "Still ahead — no check-ins for these days yet." |

"Too few check-ins" means fewer than 5 students on every nearby day, so those days are hidden for privacy.

## Where the code is

| What | File |
| --- | --- |
| Card layout and messages | `frontend/src/components/CollisionCard.tsx` |
| Per-course totals and average | `frontend/src/lib/weights.ts` (`weightByCourse`, `averageCourseWeight`) |
| Tests | `frontend/src/test/rep-collisions.test.tsx` |
| Which deadlines count, students affected | `backend/app/services/cohort.py` and `collisions.py` (`docs/architecture.md` §7) |

The card is shared with the student heads-up card. The per-course view is turned on with the `byCourse` prop, which only the rep page passes, so the student card still shows the combined total.

## Status

Done (frontend):

- **Card:** "Affects X of Y students" and a "This course" badge on the rep's own deadlines (`CollisionCard.tsx`, `DeadlineRow.tsx`).
- **Sample data:** `frontend/src/mocks/` follows the new rules (`crossCourseRepCollisions` and `sharedCourseIds` in `collisions.ts`), using the seed's courses, deadlines and student course combinations. Example: DEMO CPSC 210's finals week (CPSC 20%, PHYS 35%, MATH 40%) affects 20 of 25 students.

Still to do:

- **Backend (#17):** shared courses, the own-course rule, `students_affected` and `cohort_size`. Until then, switching off sample data shows single-course pile-ups and no "Affects" line.
- **Seed (`db/seed.py`):** optional; the finals week already gives the demo a cross-course pile-up.
