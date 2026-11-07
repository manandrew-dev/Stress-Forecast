# Stress Forecast — API Contract

> The single source of truth for request and response shapes. Backend models (`backend/app/models.py`) and frontend types (`frontend/src/api/`) must match this file exactly.
> To change an endpoint: edit this file first, tell the team, then change the code.

## Basics

- **Base URL:** `${VITE_API_URL}` → `http://localhost:8000/api` in development.
- **Auth:** every endpoint requires `Authorization: Bearer <Auth0 access token>`.
- **Format:** JSON in and out, except `POST /syllabus`, which also accepts `multipart/form-data`.
- **Dates:** `YYYY-MM-DD`. **Timestamps:** ISO 8601 with offset, e.g. `2026-11-07T21:04:00-08:00`.
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
| 403 | `forbidden` | Wrong role, or rep not assigned to this course |
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
Response: `204 No Content`

### `POST /syllabus`
**Role:** student. Extracts deadlines with Gemini. **Does not save them** — the student reviews first.

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
**Role:** student. Saves reviewed deadlines for a course. Replaces any deadlines this student previously saved for that course.

Request:
```json
{ "course_id": 1, "deadlines": [ { "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" } ] }
```
Response:
```json
{ "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 1", "due_date": "2026-10-14", "weight_pct": 20, "type": "midterm" } ] }
```

### `PUT /deadlines/{id}` · `DELETE /deadlines/{id}`
**Role:** student (creator only). `PUT` body is a `Deadline` without `id`/`course_id`; returns the updated `Deadline`. `DELETE` returns `204`.

### `POST /checkins`
**Role:** student. Parses with Gemini and saves. A second check-in on the same local day **replaces** the first.

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
**Role:** student. Own data only. Defaults to the current term.

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
Daily cohort stress with deadlines. Days with fewer than 5 students are **suppressed**: `avg_stress` and `n_students` are `null` (the real values are never sent).

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
Collision windows for the whole term, with the nearby stress peak (non-suppressed days only; `null` if none).

```json
{
  "collisions": [
    {
      "start": "2026-11-09",
      "end": "2026-11-13",
      "deadline_count": 3,
      "total_weight_pct": 55,
      "deadlines": [ { "id": 12, "course_id": 1, "title": "Midterm 2", "due_date": "2026-11-10", "weight_pct": 25, "type": "midterm" } ],
      "peak_avg_stress": 8.1,
      "peak_date": "2026-11-08"
    }
  ]
}
```

### `GET /courses/{course_id}/report?week_start=YYYY-MM-DD`
Weekly Gemini report built **only** from non-suppressed aggregates, deadlines, and collisions. Defaults to the current week.

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
