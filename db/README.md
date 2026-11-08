# Seed the Stress Forecast demo

Use a dedicated demo PostgreSQL database with TimescaleDB. Apply `db/schema.sql` to the fresh database and install `backend/requirements.txt` in your Python environment.

Set these variables in your environment or local `backend/.env` using [the example](../backend/.env.example) as a reference.

- `DATABASE_URL` is the PostgreSQL URL for the dedicated demo database, including the host and database name.
- `DEMO_STUDENT_SUB` and `DEMO_REP_SUB` are the two demo accounts' exact Auth0 User IDs, which appear as `sub` in their verified access tokens. Follow [the Auth0 guide](../docs/auth0.md) to create the accounts and assign one matching role to each. The seed can create their database rows or reuse existing rows with the matching roles and no application data.

Run the seed from the repository root.

```bash
python -m db.seed --confirm-demo --refresh
```

The command reports the student, course, and check-in counts. It creates four `DEMO` courses in `2026W1`, 39 fictional cohort members plus the mapped demo student, and course assignments for the mapped rep. Use the Auth0 accounts for sign-in. Historical check-ins stop on November 6, 2026, leaving November 7 open for the demo check-in.

## Week 9 cross-course fixture

Use `DEMO CPSC 210` as the representative's course and November 2, 2026 as the report week.

| Due | Course | Assessment | Weight |
| --- | --- | --- | --- |
| Nov 3 | DEMO CPSC 210 | Midterm 2 | 20% |
| Nov 5 | DEMO MATH 200 | Midterm 2 | 25% |
| Nov 7 | DEMO CPSC 210 | Quiz 4 | 10% |

The five-day window contains three assessments totaling 55%. CPSC contributes 30% and MATH contributes 25%, so the rep card's average per course rounds to 28%. Of the 25 CPSC students, 10 also take MATH, 15 take PHYS, and 10 take ENGL. All three courses meet the shared-course threshold. The 10 students who take MATH meet the collision rule with their own courses, so the expected rep card affects **10 of 25 students**. CPSC's two assessments alone total 30%.

The student heads-up can use these deadlines today. The current live rep endpoints still use single-course deadlines. Shared deadlines in the cohort and report, and the rep collision's `students_affected` and `cohort_size`, depend on the cross-course backend follow-up to Issue #17. Frontend mocks use their own bundled fixture. See [the rep collision guide](../docs/rep-collision-cards.md).

`--refresh` materializes only complete Vancouver days from September 8 through November 6. It requires a database role that can refresh `daily_course_stress`. The seed transaction commits first, so a rerun with `--refresh` can retry a failed materialization. The refresh window applies across courses in that database. Fresh check-ins beyond that window are available through the real-time aggregate. [TimescaleDB refresh reference](https://www.tigerdata.com/docs/reference/timescaledb/continuous-aggregates/refresh_continuous_aggregate)

Count eligible aggregate days for each demo course.

```sql
SELECT c.code, count(*) AS eligible_days
FROM daily_course_stress AS daily
JOIN courses AS c ON c.id = daily.course_id
WHERE c.term = '2026W1' AND c.code LIKE 'DEMO %' AND daily.n_students >= 5
GROUP BY c.code
ORDER BY c.code;
```

Expect a row with eligible days for each demo course. One sparse day is included to exercise privacy suppression. The student check-in, rep cohort, and weekly report screens require the corresponding API endpoints and service configuration.

Check the three official week-9 assessments with this query. The automated seed test also checks shared enrollments and the expected affected count against the collision rule.

```sql
SELECT c.code, d.title, d.due_date, d.weight_pct
FROM deadlines AS d JOIN courses AS c ON c.id = d.course_id
WHERE c.term = '2026W1' AND c.code LIKE 'DEMO %' AND d.created_by IS NULL
  AND d.due_date BETWEEN DATE '2026-11-02' AND DATE '2026-11-08'
ORDER BY d.due_date;
```

## Upgrade an existing demo database

Use the original `DEMO_STUDENT_SUB` and `DEMO_REP_SUB`. Take a backup of the dedicated demo database and pause application writes during the upgrade. Run from the repository root.

```bash
python -m db.seed --confirm-demo --upgrade-cross-course --refresh
```

The upgrade recognizes v1 by its original official deadlines. It moves CPSC Project Phase 3 from November 5 to November 19 and MATH Midterm 2 from November 19 to November 5, preserving both weights and deadline IDs. It updates 77 matching synthetic check-ins and their corresponding course stress rows from November 2–5 so the history reflects the new schedule. The existing enrollments, rep assignments, November 7 check-ins, and student-authored deadlines are preserved. Student-authored assessments in the week-9 window can change the effective collision totals.

The upgrade runs in one transaction and stops if the reserved courses, official deadlines, demo mappings, enrollments, rep assignments, or targeted history differ from the expected fixture. An already-upgraded fixture keeps its stored rows. If refresh fails after the upgrade commits, rerun the same command to retry the bounded refresh. An ordinary seed rerun preserves whichever fixture version already exists. Use a fresh dedicated database if the mappings need to change or if a customized fixture cannot be upgraded safely.

## Run tests

Install `backend/requirements-dev.txt`. From the repository root, run `PYTHONPATH=backend python -m pytest backend/tests db/tests`. To include the database integration test, set `SEED_TEST_DATABASE_URL` to a disposable, empty local database whose name ends with `_test` and whose schema has already been applied. That test populates the disposable database with synthetic records.
