# Seed the Stress Forecast demo

Use a dedicated demo PostgreSQL database with TimescaleDB. Apply `db/schema.sql` to the fresh database and install `backend/requirements.txt` in your Python environment.

Set these variables in your environment or local `backend/.env` using [the example](../backend/.env.example) as a reference.

- `DATABASE_URL` is the PostgreSQL URL for the dedicated demo database, including the host and database name.
- `DEMO_STUDENT_SUB` and `DEMO_REP_SUB` are the two demo accounts' exact Auth0 User IDs, which appear as `sub` in their verified access tokens. Follow [the Auth0 guide](../docs/auth0.md) to create the accounts and assign one matching role to each. The seed can create their database rows or reuse existing rows with the matching roles and no application data.

Run the seed from the repository root.

```bash
python -m db.seed --confirm-demo --refresh
```

The command reports the student, course, and check-in counts. It creates four `DEMO` courses in `2026W1`, 39 fictional cohort members plus the mapped demo student, and course assignments for the mapped rep. The fictional members are database fixtures. Use the Auth0 accounts for sign-in. Historical check-ins stop on November 6, 2026, leaving November 7 open for the demo check-in. In the rep view, choose `DEMO CPSC 210` and the week of November 2 to see the November 3–7 collision.

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

Reruns preserve the existing fixture and account mappings when the four reserved course rows already exist. Partial or conflicting reserved rows stop the seed. Use a fresh dedicated database for a clean fixture or different account mappings.

## Run tests

Install `backend/requirements-dev.txt`. From the repository root, run `PYTHONPATH=backend python -m pytest backend/tests db/tests`. To include the database integration test, set `SEED_TEST_DATABASE_URL` to a disposable, empty local database whose name ends with `_test` and whose schema has already been applied. That test populates the disposable database with synthetic records.
