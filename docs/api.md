# Stress Forecast — API Contract

> The single source of truth for request and response shapes. Backend models (`backend/app/models.py`) and frontend types (`frontend/src/api/`) must match this file exactly.
> To change an endpoint: edit this file first, tell the team, then change the code.

## Basics

- **Base URL:** `${VITE_API_URL}` → `http://localhost:8000/api` in development.
- **Auth:** every endpoint requires `Authorization: Bearer <Auth0 access token>`.
- **Format:** JSON in and out, except `POST /syllabus`, which also accepts `multipart/form-data`.
- **Dates:** `YYYY-MM-DD`. **Timestamps:** ISO 8601 with offset, e.g. `2026-11-07T21:04:00-08:00`.
- **Local days:** "today", same-day check-in replacement, trend points and cohort days all use `America/Vancouver` (`LOCAL_TIMEZONE` in `backend/app/config.py`).
- **Roles:** each endpoint lists the role it requires. Wrong role → `403`.

### Errors

All errors use one shape:

```json
{ "error": { "code": "forbidden", "message": "Rep role required" } }
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `bad_request` | Invalid body or params |
| 401 | `unauthorized` | Missing or invalid token |
| 403 | `forbidden` | Wrong role, rep not assigned to this course, student not enrolled in this course, or student changing a deadline they didn't save |
| 404 | `not_found` | Resource doesn't exist |
| 422 | `ai_parse_failed` | Gemini returned unusable output after one retry |
| 500 | `internal` | Anything else |

### Shared types

```ts
type Role = "student" | "rep";
type DeadlineType = "exam" | "midterm" | "quiz" | "assignment" | "project" | "other";

interface Course   { id: number; code: string; name: string; term: string }
interface Deadline { id: number; course_id: number; title: string; due_date: string; weight_pct: number | null; type: DeadlineType }
```

### Which deadlines are returned

Seeded (official) deadlines have no creator, and `POST /deadlines` saves a copy per student, so the same assessment can be stored many times. Every endpoint that returns deadlines de-duplicates them by course, case-insensitive trimmed title, and due date:

- **Course level** (`/me/heads-up`, `/courses/{id}/cohort`, `/collisions`, `/report`): every stored copy counts; the official row is preferred.
- **A student's own view** (`/me/trend`): official deadlines for the student's courses plus the student's own copies; the student's copy is preferred.

---

## Shared

### `GET /me`
**Role:** any. Creates the user row on first call.

```json
{ "id": "auth0|abc123", "role": "student", "courses": [ { "id": 1, "code": "CPSC 210", "name": "Software Construction", "term": "2026W1" } ] }
```

For a rep, `courses` is the list of courses they're assigned to.

### `GET /courses`
**Role:** any. All courses available to pick from.

```json
{ "courses": [ { "id": 1, "code": "CPSC 210", "name": "Software Construction", "term": "2026W1" } ] }
```

---

## Student

### `PUT /me/courses`
**Role:** student. Replaces the student's enrollments.

Request:
```json
{ "course_ids": [1, 2, 3] }
```
Response: `204 No Content`. An unknown course id → `400` (nothing is changed). Duplicates are ignored; `[]` removes every enrollment.

### `POST /syllabus`
**Role:** student, enrolled in `course_id` (`403` otherwise; unknown course → `404`). Extracts deadlines with Gemini. **Does not save them** — the student reviews first.

PDF text is extracted on the server; only the text goes to Gemini. A PDF with no extractable text (e.g. a scan), an encrypted PDF, or a file over 10 MB → `400`, so the student can paste the text instead. Text over 100,000 characters → `400`.

Request (either form):
```
multipart/form-data: course_id=<number>, file=<PDF>
```
```json
{ "course_id": 1, "text": "Midterm 1: Oct 14 (20%) ..." }
```

Response:
```json
{
  "course_id": 1,
  "deadlines": [
    { "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" },
    { "title": "Project Phase 2", "due_date": "2026-11-03", "weight_pct": 15, "type": "project" }
  ]
}
```

### `POST /deadlines`
**Role:** student, enrolled in `course_id`. Saves reviewed deadlines for a course. Replaces any deadlines this student previously saved for that course (official deadlines are never touched). Each title must be non-empty and `weight_pct` must be `null` or 0–100, else `400`.

Request:
```json
{ "course_id": 1, "deadlines": [ { "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" } ] }
```
Response:
```json
{ "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" } ] }
```

### `PUT /deadlines/{id}` · `DELETE /deadlines/{id}`
**Role:** student (creator only). `PUT` body is a `Deadline` without `id`/`course_id`; returns the updated `Deadline`. `DELETE` returns `204`. Official deadlines and other students' copies → `403`; unknown id → `404`.

### `POST /checkins`
**Role:** student. Parses with Gemini and saves. A second check-in on the same local day **replaces** the first. `text` must be 1–2,000 characters after trimming, else `400`. Only the text is sent to Gemini.

Request:
```json
{ "text": "barely slept, two assignments due thursday, kind of panicking" }
```

Response:
```json
{
  "time": "2026-11-07T21:04:00-08:00",
  "stress": 8,
  "sleep_hours": 4,
  "causes": ["sleep", "assignment deadlines"],
  "concerning": false,
  "replaced_earlier": false
}
```

If `concerning` is `true`, the frontend must show the support-resources message (see `requirements.md` §5).

### `GET /me/trend?from=YYYY-MM-DD&to=YYYY-MM-DD`
**Role:** student. Own data only. Both parameters are optional: without `from`, points start at the student's first check-in; without `to`, they end today. Deadlines are filtered only by the bounds that are given (no range → all of them, including upcoming ones). `from` after `to` → `400`.

```json
{
  "points":    [ { "date": "2026-11-01", "stress": 5, "sleep_hours": 7 }, { "date": "2026-11-02", "stress": 7, "sleep_hours": 5 } ],
  "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" } ]
}
```

### `GET /me/heads-up`
**Role:** student. Collisions in the next 14 days for the student's own course combination.

```json
{
  "collisions": [
    {
      "start": "2026-11-09",
      "end": "2026-11-13",
      "deadline_count": 3,
      "total_weight_pct": 55,
      "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 2", "due_date": "2026-11-10", "weight_pct": 25, "type": "midterm" } ],
      "message": "3 assessments worth 55% in 5 days. Start Project Phase 3 this weekend."
    }
  ]
}
```

---

## Rep

All rep endpoints: role `rep` **and** the rep must be assigned to `{course_id}`, else `403`.
**No rep endpoint ever returns a user id, raw text, or a single student's data.**

### `GET /courses/{course_id}/cohort?from=YYYY-MM-DD&to=YYYY-MM-DD`
Daily cohort stress with deadlines. `deadlines` holds this course's deadlines plus those of its **shared courses** (see Collisions below), so the chart shows everything the class is juggling. Days with fewer than 5 students are **suppressed**: `avg_stress` and `n_students` are `null` (the real values are never sent). There is one entry per day in the range; a day with no check-ins at all is also suppressed.

Both parameters are optional: without `from`, days start at the first day with enough responses; without `to`, they end today. Deadlines are filtered only by the bounds that are given. `from` after `to`, or a range of 366 days or more → `400`.

```json
{
  "course": { "id": 1, "code": "CPSC 210", "name": "Software Construction", "term": "2026W1" },
  "min_students": 5,
  "days": [
    { "date": "2026-11-01", "avg_stress": 4.8, "n_students": 31, "suppressed": false },
    { "date": "2026-11-02", "avg_stress": null, "n_students": null, "suppressed": true }
  ],
  "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 2", "due_date": "2026-11-10", "weight_pct": 25, "type": "midterm" } ]
}
```

### `GET /courses/{course_id}/collisions`
Collision windows for the whole term, **across the courses this class shares** (changed Nov 7; see `docs/requirements.md` §4).

How a rep collision is found:

1. **Shared courses:** any other course that at least `COHORT_MIN` (5) students of this course are also enrolled in.
2. Run the collision rule (`docs/architecture.md` §7) over this course's deadlines plus the shared courses' deadlines.
3. Keep only windows that contain **at least one deadline of this course**, since that's what the rep can act on.
4. `students_affected`: how many of this course's students would see this window as a collision counting only **their own** courses. Windows with fewer than `COHORT_MIN` affected students are dropped, so no small group can be singled out.
5. Nearby stress peak: this course's daily average, non-suppressed days only, from 3 days before the window to its end (`null` if none).

`deadlines` includes the shared courses' deadlines; `course_id` tells them apart. `cohort_size` is the number of students enrolled in this course.

```json
{
  "cohort_size": 42,
  "collisions": [
    {
      "start": "2026-11-03",
      "end": "2026-11-06",
      "deadline_count": 3,
      "total_weight_pct": 55,
      "deadlines": [
        { "id": 12, "course_id": 1, "title": "Midterm 2", "due_date": "2026-11-03", "weight_pct": 25, "type": "midterm" },
        { "id": 31, "course_id": 3, "title": "Circuits project", "due_date": "2026-11-04", "weight_pct": 10, "type": "project" },
        { "id": 22, "course_id": 2, "title": "Midterm 2", "due_date": "2026-11-06", "weight_pct": 20, "type": "midterm" }
      ],
      "students_affected": 28,
      "peak_avg_stress": 8.8,
      "peak_date": "2026-11-03"
    }
  ]
}
```

### `GET /courses/{course_id}/report?week_start=YYYY-MM-DD`
Weekly Gemini report built **only** from non-suppressed aggregates, deadlines, and collisions (including cross-course collisions). The suggested fix moves one of **this course's own** deadlines, since that's the date the rep can ask about. Defaults to the current week. Any `week_start` is moved back to that week's Monday, and the response's `week_start` is that Monday.

Reports are cached on the server for 30 minutes per course and week (`REPORT_CACHE_SECONDS`), so repeated page loads don't call Gemini again. If the week has no day with enough responses, Gemini isn't called and the response says so (`top_cause: "not enough data"`).

```json
{
  "week_start": "2026-11-02",
  "summary": "Stress rose from 5.1 to 7.4 this week, peaking two days before Midterm 2.",
  "top_cause": "overlapping deadlines",
  "suggested_fix": "Moving Project Phase 3 from Nov 12 to Nov 19 would break up the week 9 collision."
}
```

### `GET /courses/{course_id}/insights`
Findings written by the Databricks notebook. Empty list if none yet.

```json
{
  "insights": [
    { "week_start": "2026-11-09", "finding": "Weeks with assessments worth 40%+ inside 5 days preceded the 3 highest stress spikes this term." }
  ]
}
```

---

## Endpoint summary

| Method | Path | Role | Priority |
| --- | --- | --- | --- |
| GET | `/me` | any | P0 |
| GET | `/courses` | any | P0 |
| PUT | `/me/courses` | student | P0 |
| POST | `/syllabus` | student | P0 |
| POST | `/deadlines` | student | P0 |
| PUT / DELETE | `/deadlines/{id}` | student | P1 |
| POST | `/checkins` | student | P0 |
| GET | `/me/trend` | student | P0 |
| GET | `/me/heads-up` | student | P1 |
| GET | `/courses/{id}/cohort` | rep | P0 |
| GET | `/courses/{id}/collisions` | rep | P0 |
| GET | `/courses/{id}/report` | rep | P1 |
| GET | `/courses/{id}/insights` | rep | P2 |
