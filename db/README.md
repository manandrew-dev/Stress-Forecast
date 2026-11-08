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

The rep endpoints return this window from `GET /api/courses/{id}/collisions` for `DEMO CPSC 210` (`cohort_size` 25, `students_affected` 10), and the cohort and report include the shared courses' deadlines. The student heads-up uses the same deadlines for each student's own courses. Frontend mocks use their own bundled fixture. See [the rep collision guide](../docs/rep-collision-cards.md).

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

## Reset between presentations

Use this command only on a **disposable, dedicated demo database** already populated by the seed. Use the original `DEMO_STUDENT_SUB` and `DEMO_REP_SUB`, the direct PostgreSQL `DATABASE_URL`, and a role with write access to the demo tables and ownership of `daily_course_stress`. Pause the backend and any Databricks jobs that write to the demo database, and keep them paused through refresh. The reset does not access Auth0.

### Back up and designate the database

Before the first live reset, make a private backup and verify it by restoring it into a separate disposable database. Use PostgreSQL connection service aliases or equivalent secure connection settings. The `stress_forecast_demo` service must point to the same dedicated database as `DATABASE_URL`.

```bash
umask 077
backup="stress-forecast-demo-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --dbname=service=stress_forecast_demo --format=custom --file="$backup"
pg_restore --list "$backup" >/dev/null
```

After verifying the backup using the recovery steps below, connect as the **database owner** and designate this database. The comment is a durable attestation that the database is disposable and the backup was verified. PostgreSQL cannot check whether the external backup file still exists. Never set this comment on a shared or production database.

```bash
psql -X --dbname=service=stress_forecast_demo --set=ON_ERROR_STOP=1 <<'SQL'
SELECT format('COMMENT ON DATABASE %I IS %L', current_database(),
    'stress-forecast:disposable-demo:backup-verified:v1:' || current_database())
\gexec
SQL
```

### Dry run and reset

From the repository root, with the same environment used by the seed:

```bash
python -m db.reset_demo --dry-run
python -m db.reset_demo --confirm-demo
```

Review the dry-run counts before confirming. The dry run uses a read-only snapshot, and the real reset repeats validation while holding write-blocking locks. The command requires the database designation, the exact seeded user roles and courses, and recognizable demo records. It accepts normal changes made by the mapped demo student, edits to known official assessment dates, weights, and types, and generated insights tied to demo courses. An unrecognized official assessment title, an unexpected account or course, or an unscoped record stops the reset. Keep writers paused if reset fails so you can inspect the target before retrying.

On success, expect `Restored the 2026W1 demo and refreshed daily_course_stress` followed by the before and restored counts. The restored counts are **41 users** (40 students and one rep), **4 courses**, **90 enrollments**, **3 rep assignments**, **18 deadlines**, **1,992 check-ins**, **4,479 course check-ins**, and **0 insights**. The seed does not populate insights. Run the [Databricks notebook](../docs/databricks/README.md) against the dedicated demo database after reset if your presentation needs generated findings.

The reset preserves Auth0 mappings, user and course IDs, and the IDs of known official deadlines. It restores the November 3–7 CPSC/MATH pile-up affecting 10 of 25 CPSC students. November 7 has no seeded check-ins. The deletion and reseed commit together. TimescaleDB refreshes affected buckets after commit, including buckets for removed live check-ins. If refresh fails, the command reports that the rows were restored. Keep writers paused and rerun the reset to retry refresh. Restart the backend before presenting to clear its cached weekly reports.

### Recover from a backup

Restore into a **new, empty** database with a compatible PostgreSQL version and the same TimescaleDB version. For a self-hosted restore, configure a `stress_forecast_restore` service alias for that database. Run the steps in order and stop if any fails.

```bash
psql -X --dbname=service=stress_forecast_restore --set=ON_ERROR_STOP=1 \
    -c 'CREATE EXTENSION IF NOT EXISTS timescaledb' \
    -c 'SELECT timescaledb_pre_restore()'
pg_restore --exit-on-error --dbname=service=stress_forecast_restore "$backup"
psql -X --dbname=service=stress_forecast_restore --set=ON_ERROR_STOP=1 \
    -c 'SELECT timescaledb_post_restore()'
```

Verify the restored tables, demo mappings, and cohort queries before pointing the app at the restored database. Keep the dump private because it can contain submitted check-ins and Auth0 IDs. On Tiger Cloud, a service fork or point-in-time restore can also serve as the recovery target. [TimescaleDB logical backup and restore](https://www.tigerdata.com/docs/deploy/self-hosted/backup-and-restore/logical-backup)

## Run tests

Install `backend/requirements-dev.txt`. From the repository root, run `PYTHONPATH=backend python -m pytest backend/tests db/tests`. To include the database integration tests, apply `db/schema.sql` to separate, empty local databases whose names end with `_test`. Set `SEED_TEST_DATABASE_URL` for the seed test and `RESET_TEST_DATABASE_URL` for the reset test. Both tests populate their database with synthetic records.

For example, on a local TimescaleDB server with TCP enabled:

```bash
createdb -h 127.0.0.1 stress_forecast_reset_test
psql -X -h 127.0.0.1 -d stress_forecast_reset_test -v ON_ERROR_STOP=1 -f db/schema.sql
RESET_TEST_DATABASE_URL=postgresql://127.0.0.1/stress_forecast_reset_test \
    PYTHONPATH=backend python -m pytest db/tests/test_reset_demo.py
```
