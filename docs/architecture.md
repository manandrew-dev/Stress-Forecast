# Stress Forecast — Architecture

> How the project is structured. Read `requirements.md` for what to build and `api.md` for the endpoint contract.
> Coding agents: follow the folder layout and conventions here. If you need to break one, say so in your summary.

## 1. Stack

> **Team decision:** the backend language below is a default. If the team picks Node/TypeScript instead, update this section before writing backend code.

| Layer | Choice | Owner |
| --- | --- | --- |
| Frontend | React + Vite + TypeScript + Tailwind (scaffolded in Lovable) | You (student side), Lawrence (rep side) |
| Auth | Auth0 (`@auth0/auth0-spa-js` on the frontend, JWT verification on the API) | Keith |
| API | Python 3.11+, FastAPI | Keith |
| Database | Tiger Data (managed Postgres + TimescaleDB) | Keith |
| AI | Gemini API via the `google-genai` Python SDK, structured JSON output | Khan |
| Analytics | Databricks notebook (Python), reads from and writes to Tiger | Khan |
| Dev tooling | Freebuff (main coding agent), Entire (sessions, Graph, Brain), Gemini CLI | Everyone |

## 2. System overview

```
 Student app ──┐                 ┌──> Gemini API (syllabi, check-ins, reports)
               ├──> API server ──┤
 Rep dashboard ┘     │           └──> Tiger Data  <──> Databricks notebook
        │            │
        └──> Auth0 <─┘  (frontend logs in; API verifies tokens + roles)
```

Rules:

1. **The frontend only talks to our API** (and Auth0 for login). It never calls Gemini or the database directly.
2. **The API is the only thing that calls Gemini or Tiger.** Privacy rules live in one place.
3. Databricks runs on the side: it reads aggregates, writes to `insights`, and is never on the request path.

## 3. Repo layout

```
/
├── AGENTS.md              # short pointer to these docs (Entire setup also manages a block here)
├── docs/
│   ├── requirements.md
│   ├── architecture.md
│   ├── api.md
│   └── freebuff/          # screenshots of Freebuff sessions for Devpost
├── frontend/              # Lovable-generated React app
│   ├── src/
│   │   ├── api/           # typed client for every endpoint in api.md — the ONLY place fetch() is called
│   │   ├── auth/          # Auth0 provider + role helpers
│   │   ├── pages/
│   │   │   ├── student/   # owner: you
│   │   │   └── rep/       # owner: Lawrence
│   │   ├── components/    # shared UI
│   │   └── mocks/         # mock responses matching api.md, used until the backend is live
│   └── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI app, CORS, router registration
│   │   ├── config.py      # env vars + constants (COHORT_MIN = 5, collision thresholds)
│   │   ├── auth.py        # Auth0 JWT verification, require_role()
│   │   ├── db.py          # connection pool
│   │   ├── routers/
│   │   │   ├── student.py # /api/me/*, /api/syllabus, /api/checkins, /api/deadlines
│   │   │   ├── courses.py # /api/courses (shared)
│   │   │   └── rep.py     # /api/courses/{id}/cohort|collisions|report|insights
│   │   ├── services/
│   │   │   ├── gemini.py      # all Gemini calls + response schemas
│   │   │   ├── collisions.py  # collision detection (pure functions, unit-testable)
│   │   │   └── cohort.py      # aggregate queries with the 5-student rule
│   │   └── models.py      # Pydantic request/response models matching api.md
│   ├── requirements.txt
│   └── .env.example
├── db/
│   ├── schema.sql         # tables, hypertable, continuous aggregate
│   └── seed.py            # demo term: ~40 fake students, collision in week 9
└── databricks/
    └── deadline_patterns.ipynb
```

## 4. Data model (Tiger Data)

```sql
-- db/schema.sql (sketch — Keith owns the final version)

CREATE TABLE users (
  id          TEXT PRIMARY KEY,          -- Auth0 `sub`
  role        TEXT NOT NULL CHECK (role IN ('student', 'rep')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id     SERIAL PRIMARY KEY,
  code   TEXT NOT NULL,                  -- e.g. 'CPSC 210'
  name   TEXT NOT NULL,
  term   TEXT NOT NULL                   -- e.g. '2026W1'
);

CREATE TABLE enrollments (              -- students in courses
  user_id    TEXT REFERENCES users(id),
  course_id  INT  REFERENCES courses(id),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE rep_assignments (          -- which courses a rep can see
  user_id    TEXT REFERENCES users(id),
  course_id  INT  REFERENCES courses(id),
  PRIMARY KEY (user_id, course_id)
);

CREATE TABLE deadlines (
  id          SERIAL PRIMARY KEY,
  course_id   INT  NOT NULL REFERENCES courses(id),
  title       TEXT NOT NULL,
  due_date    DATE NOT NULL,
  weight_pct  NUMERIC,                   -- nullable if the syllabus doesn't say
  type        TEXT NOT NULL CHECK (type IN ('exam', 'midterm', 'quiz', 'assignment', 'project', 'other')),
  created_by  TEXT REFERENCES users(id)
);

-- One row per student check-in (private to that student)
CREATE TABLE checkins (
  time         TIMESTAMPTZ NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id),
  stress       SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
  sleep_hours  NUMERIC,
  causes       TEXT[] NOT NULL DEFAULT '{}',
  raw_text     TEXT NOT NULL,
  PRIMARY KEY (user_id, time)
);
SELECT create_hypertable('checkins', by_range('time'));

-- Fan-out: one row per (check-in, enrolled course). Written by the API in the same
-- transaction as the check-in. Lets the continuous aggregate group by course without joins.
CREATE TABLE checkin_course (
  time       TIMESTAMPTZ NOT NULL,
  course_id  INT  NOT NULL REFERENCES courses(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  stress     SMALLINT NOT NULL CHECK (stress BETWEEN 1 AND 10),
  PRIMARY KEY (user_id, time, course_id)
);
SELECT create_hypertable('checkin_course', by_range('time'));

-- Daily cohort stress per course. Count distinct students for the privacy threshold.
CREATE MATERIALIZED VIEW daily_course_stress
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT time_bucket(INTERVAL '1 day', time, timezone => 'America/Vancouver') AS day,
       course_id,
       avg(stress)::NUMERIC(4,2)  AS avg_stress,
       count(DISTINCT user_id)    AS n_students
FROM checkin_course
GROUP BY day, course_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_course_stress',
  start_offset => INTERVAL '120 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '15 minutes');

-- Written by the Databricks notebook
CREATE TABLE insights (
  id          SERIAL PRIMARY KEY,
  course_id   INT REFERENCES courses(id),
  week_start  DATE NOT NULL,
  finding     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notes:

- Apply `db/schema.sql` once to a fresh database with TimescaleDB support. The executable schema includes indexes for course and creator deadline lookups, course time ranges, and weekly insights.
- The real-time aggregate includes recent check-ins beyond the materialized range. Changes to older, materialized days appear after refresh.
- Use `America/Vancouver` for check-in replacement and cohort dates. Compute the range from local midnight to the next local midnight so daylight saving transitions are handled correctly. Convert `day` to the same timezone before returning an API date.
- The hypertable keys reject duplicate timestamps for a user or user/course. For same-day replacement, Issue #16 should lock the student’s `users` row first, then replace the check-in and course rows for that local day in one transaction. TimescaleDB supports foreign keys from each hypertable to ordinary tables. The transaction also maintains the relationship between the two hypertables.
- Only `cohort.py` may query `daily_course_stress`, and every query there filters `n_students >= COHORT_MIN`.

## 5. Auth (Auth0)

- **Frontend:** `@auth0/auth0-spa-js` (`frontend/src/auth/auth0.ts`), loaded in the browser only. `@auth0/auth0-react` was the plan, but it throws during TanStack Start's server render as soon as it's imported. Request an access token for our API's **audience** and send it as `Authorization: Bearer <token>` on every request. Sessions survive reloads with refresh tokens, which need **Allow Offline Access** on the API and **Refresh Token Rotation** on the SPA (see [auth0.md](auth0.md)).
- **Roles:** create `student` and `rep` roles in Auth0. A **Post-Login Action** adds them to the access token as a custom claim:
  `https://stressforecast.app/roles` → `["student"]` or `["rep"]`.
- **API:** `auth.py` verifies RS256 access tokens against the tenant JWKS and validates issuer, audience, subject, and time claims. It synchronizes the verified subject and application role with `users`.
- **Route protection:** the shared router accepts either role through `get_current_user`. The student router uses `require_role("student")`. The rep router uses `require_rep_course`, which requires `rep` and a `rep_assignments` row matching the `{course_id}` in the URL.
- **MFA (P2):** in the same Post-Login Action, require MFA when the user has the `rep` role.
- **Tenant setup:** see [Auth0 dashboard and demo account setup](auth0.md).

## 6. AI (Gemini)

All calls live in `backend/app/services/gemini.py`. Each function uses **structured output** (a JSON response schema), validates the result with Pydantic, and retries once on invalid JSON. The model name comes from the `GEMINI_MODEL` env var.

| Function | Input | Output (validated) |
| --- | --- | --- |
| `extract_deadlines(syllabus_text, today=None)` | Syllabus text (PDF text extracted server-side first); `today` only helps infer missing years | `[{title, due_date (YYYY-MM-DD), weight_pct \| null, type}]` |
| `parse_checkin(text)` | Check-in text | `{stress 1–10, sleep_hours \| null, causes: string[], concerning: bool}` |
| `weekly_report(course, aggregates, deadlines, collisions, week_start, course_codes=None)` | **Aggregates only**, never raw text: the report week and the week before as `(date, avg_stress)`, this course's and shared courses' deadlines, cross-course collisions | `{summary, top_cause, suggested_fix}` |

All three are `async` and raise `AIParseError` after the retry; the API maps it to `422 ai_parse_failed`.

Rules: never send names, emails, or user ids to Gemini. The weekly report gets only suppressed-safe aggregates. Each deadline in its payload carries its course code and an `own_course` flag, and `suggested_fix` must move one of the course's **own** deadlines (the rep can only ask their own instructor). No student or enrollment data is sent; `students_affected` stays out of the payload.

## 7. Collision detection

`services/collisions.py` — pure functions, no DB access, so they can be tested with plain lists.

The rule (both views):

1. Slide a 5-day window across the term.
2. Flag the window if it holds `>= COLLISION_MIN_COUNT` (3) assessments, **or** at least `COLLISION_WEIGHT_MIN_COUNT` (2) assessments with combined weight `>= COLLISION_MIN_WEIGHT` (40%). One heavy assessment alone never counts.
3. Merge overlapping flagged windows.

Which deadlines go in:

- **Student heads-up:** the deadlines of the student's own courses.
- **Rep view** (changed Nov 7): this course's deadlines plus those of its shared courses (other courses at least `COHORT_MIN` of its students also take). `services/cohort.py` looks up the shared courses and the enrollments; `collisions.py` stays pure.

Then, for the rep view only:

4. Keep windows that contain at least one of this course's own deadlines.
5. `students_affected`: for each student in the course, run the rule on that window using only their own courses' deadlines; count the students it flags. Drop the window if the count is below `COHORT_MIN`.
6. Attach the peak `avg_stress` of this course from 3 days before the window to its end (only non-suppressed days).

Enrollments are read inside the API only; no per-student data leaves it, only the count.

## 8. Databricks

`databricks/deadline_patterns.ipynb`:

1. Connect to Tiger with the read/write connection string (Postgres JDBC or `psycopg`).
2. Read `daily_course_stress` (only rows with `n_students >= 5`) and `deadlines`.
3. Compute, per course and week: deadline count, total weight, and stress change vs the previous week.
4. Find which patterns precede spikes (a simple correlation or threshold table is enough).
5. Write plain-language findings to `insights`.

## 9. Environment variables

```
# backend/.env
DATABASE_URL=postgres://...            # Tiger Data service
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.stressforecast.app
GEMINI_API_KEY=...
GEMINI_MODEL=...                       # current Gemini Flash model
CORS_ORIGINS=http://localhost:5173

# frontend/.env
VITE_API_URL=http://localhost:8000/api
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=...
VITE_AUTH0_AUDIENCE=https://api.stressforecast.app
```

Never commit real `.env` files. Keep `.env.example` up to date.

## 10. Conventions

- **API shapes come from `api.md`.** Backend Pydantic models and the frontend `src/api/` types must match it. Change `api.md` first, then the code.
- **Frontend builds against mocks** in `src/mocks/` until each endpoint is live; switch with `VITE_USE_MOCKS=true|false`.
- Dates in JSON: `YYYY-MM-DD` for dates, ISO 8601 with timezone for timestamps.
- Small commits with clear messages; Entire attaches agent sessions to them.
- Don't add new dependencies, tables, or endpoints without telling the team.

## 11. Entire setup (do this first)

1. Install the [Entire CLI](https://github.com/entireio/cli#install) and put `entire` on your `PATH`.
2. Enable capture with `entire enable --agent codex --skip-push-sessions --telemetry=false`, then run `entire agent add claude-code`. In Codex, review and approve the project hooks with `/hooks`.
3. Run `entire plugin install graph` and `entire plugin install brain`. Activate them with `entire graph setup --repo .` and `entire brain setup --no-backfill --no-daemon --agent-hooks`. Setup maintains `.entire/agent-guide.md` and managed references in `AGENTS.md` and `CLAUDE.md`. Keep the project doc links outside those blocks.
4. Complete a short Claude Code or Codex session and run `entire checkpoint list --pending` to verify capture. Use Claude Code for sponsor-track recordings. Entire CLI 0.13.1 supports capture for Claude Code and Codex. Gemini CLI and Freebuff sessions are outside its capture support.

If Brain setup reports an uncommitted worktree, run `entire brain refresh --worktree` to index the current project context and docs. The persisted Graph index follows committed `HEAD`.
