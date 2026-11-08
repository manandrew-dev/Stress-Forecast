# Rep collision cards

How the rep's **Pile-ups** page (`frontend/src/pages/rep/CollisionsPage.tsx`) shows each collision. Which windows count as a collision is decided by the backend (`docs/requirements.md` §4); this page only covers how they're displayed.

> **Sample data vs the real backend:** the backend flags a 5-day window with 3+ assessments or 40%+ combined weight (`backend/app/config.py`). The sample data in `frontend/src/mocks/collisions.ts` uses a looser rule (2+ assessments and 30%+), so some demo cards, like Oct 6–8 (2 assessments, 35%), only appear with sample data. It also searches one extra day past the window for the stress peak.

## What a card shows

```
Nov 3 – Nov 6          3 assessments   18% avg per course
[CPSC 210 25%] [PHYS 118 10%] [MATH 200 20%]
  CPSC 210  Midterm 2         Nov 3   25%
  PHYS 118  Circuits project  Nov 4   10%
  MATH 200  Midterm 2         Nov 6   20%
Nearby stress peak: 8.8 on Nov 3
```

- **Date window and count:** when the pile-up happens and how many assessments land in it.
- **Avg per course:** see below.
- **Course chips:** each course's share of its own grade in this window.
- **Deadline list:** every assessment in the window.
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

The average makes a pile-up spread across several courses look smaller (the demo's week 9 is 18% avg per course, versus 55% combined). The assessment count and the stress peak show how bad it is; the average shows how heavy each course's part is.

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

The card is shared with the student heads-up card. The per-course view is turned on with the `byCourse` prop, which only the rep page passes, so the student card still shows the combined total.
