# Stress Forecast — Requirements

> Source of truth for **what** we're building. For **how**, see `architecture.md`. For the exact endpoint contract, see `api.md`.
> Coding agents: do not add features outside this file without the team agreeing first.

## 1. Summary

Stress Forecast finds out why a whole cohort burns out at the same time, then helps fix the schedule instead of the student.

- Students do a 30-second daily check-in (voice or text) and upload their course syllabi.
- Gemini extracts deadlines from syllabi and turns check-ins into structured data.
- We line up **anonymized, aggregated** stress against every deadline and flag "deadline collisions."
- Student reps and instructors see the cohort view and get a weekly report with a suggested fix (e.g. move one due date).

**Hackathon theme:** "Identify a problem facing a community and build a solution that makes a meaningful difference."
**Community:** students in a course or program, plus the reps and instructors who set their deadlines.

## 2. Users and roles

| Role | Who | Can see |
| --- | --- | --- |
| `student` | Any student | Only their own check-ins, trends, deadlines, and heads-up |
| `rep` | Student reps, TAs, instructors | Only **aggregated** cohort data for courses they are assigned to. Never an individual's data. |

A user has exactly one role. Roles come from Auth0 (see `architecture.md`).

## 3. Functional requirements

Priority: **P0** = must work in the demo. **P1** = should have. **P2** = only if time allows (cut these first).

### Student

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| S1 | P0 | Log in with Auth0 | Unauthenticated users see only the landing page |
| S2 | P0 | Pick enrolled courses | Student can add/remove courses from a list; saved to `enrollments` |
| S3 | P0 | Upload a syllabus (PDF or pasted text) | Gemini returns a list of deadlines (title, due date, weight %, type) within ~15 s |
| S4 | P0 | Review extracted deadlines | Student can edit or delete any extracted deadline before saving |
| S5 | P0 | Daily check-in by text | Free-text input → Gemini returns stress 1–10, sleep hours (nullable), causes list; saved to DB |
| S6 | P1 | Daily check-in by voice | Browser speech-to-text fills the text box; same flow as S5 |
| S7 | P0 | Personal trend | Line chart of own stress over time with own deadlines marked |
| S8 | P1 | Two-week heads-up | Shows upcoming collision weeks for the student's course combination |
| S9 | P1 | One check-in per day | A second check-in on the same day **replaces** the first |

### Rep

| ID | Priority | Requirement | Acceptance criteria |
| --- | --- | --- | --- |
| R1 | P0 | Log in with rep role | Rep lands on the cohort view, not the student app |
| R2 | P0 | Cohort view for a course | Daily average stress over the term with all course deadlines marked on the same timeline |
| R3 | P0 | Privacy threshold | Any day with fewer than **5** students is returned as suppressed and shown as "Not enough responses" |
| R4 | P0 | Collision flags | List of windows where deadlines pile up **across the courses this class shares**, each with its deadlines, each course's share and the average weight per course (see `docs/rep-collision-cards.md`), how many students it affects, and the stress peak nearby |
| R5 | P1 | Weekly Gemini report | Plain-language summary of the week + one concrete suggested fix |
| R6 | P2 | Databricks insights | Shows findings written by the Databricks notebook (e.g. "assessments worth 40%+ within 5 days precede spikes") |
| R7 | P2 | MFA for reps | Auth0 requires MFA when a rep logs in |

## 4. Definitions

- **Stress score:** integer 1–10 from Gemini (1 = calm, 10 = overwhelmed).
- **Collision:** any 5-day window containing **3 or more** assessments, **or** **2 or more** assessments with combined weight **≥ 40%**. A single heavy assessment (e.g. a 50% final) on its own is not a collision; it takes a pile-up. The numbers are constants in the backend config, not hard-coded in multiple places. Which deadlines count depends on who is looking:
  - **Student heads-up:** the deadlines of the student's own courses.
  - **Rep view:** the course's deadlines plus its shared courses' deadlines, keeping only windows that include at least one of the course's own deadlines (see `docs/api.md`, collisions).
- **Shared course:** for a given course, any other course that at least 5 of its students are also enrolled in.
- **Students affected:** for a rep collision, how many of the course's students would see that window as a collision counting only their own courses. A collision affecting fewer than 5 students is not shown.
- **Cohort:** all students enrolled in a given course.
- **Suppressed:** an aggregate based on fewer than 5 distinct students. Suppressed values are never sent to the client, not even hidden.

## 5. Privacy and safety requirements (non-negotiable)

1. The 5-student minimum is enforced **in the API / database query**, never only in the UI.
2. Rep endpoints never return `user_id`, `raw_text`, or any per-student row.
3. Raw check-in text is only ever returned to the student who wrote it.
4. Gemini is never sent a student's name or email — only the check-in text or syllabus text.
5. The app is not a crisis service. If a check-in suggests the student may be in crisis, the student sees a short message pointing to campus counselling / crisis resources. (Gemini parser returns a `concerning` boolean; see `api.md`.)

## 6. Demo requirements

- Seeded data: one demo term, ~40 fake students, 3–4 courses, realistic stress spikes 1–3 days before heavy deadlines, and at least one obvious collision week (e.g. week 9: 3 assessments worth 55% combined in 5 days).
- Two demo accounts: one `student`, one `rep`.
- The full demo path (student check-in → rep cohort view → weekly report) must work without manual DB edits.
- Devpost must state that cohort data is seeded for the demo.

## 7. Sponsor track requirements

| Track | What must be true in the final project |
| --- | --- |
| Freebuff | Most code written with Freebuff; screenshots of sessions saved in `/docs/freebuff/` for the write-up |
| Auth0 | Login, `student` / `rep` roles enforced on the API, (P2) MFA for reps |
| Gemini API | Syllabus extraction, check-in parsing, weekly report |
| Tiger Data | `checkin_course` hypertable + `daily_course_stress` continuous aggregate |
| Entire | Entire enabled on the repo from the start; Brain set up; some sessions via Gemini CLI or Claude Code (Freebuff sessions are not captured by Entire) |
| Databricks | One notebook reading from Tiger and writing to `insights` |
| Lovable | Initial frontend scaffold generated in Lovable |
| Community Impact | Impact statement in Devpost |

## 8. Out of scope

- Real university integrations (Canvas, LMS, SSO with a school).
- Notifications, email, push.
- Mobile apps (responsive web is enough).
- Any per-student view for reps.
- Solana.
