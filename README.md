# Stress Forecast

**Wellbeing apps tell you to meditate. We find out why a whole cohort is burning out and fix the schedule.**

Built at HackCamp 2026. Students do a 30-second daily check-in and upload their syllabi. We line up anonymized, class-wide stress against every deadline in their courses, flag the weeks where deadlines pile up, and give class reps the evidence to ask for a date to move.

**Live app:** https://stress-forecast.vercel.app (log in with a demo student or rep account; the first load can take up to a minute while the free backend wakes up)

**Figma:** https://www.figma.com/design/RnZfnSDgXSIwCTBCtCm2DH/Stress-Forecast?node-id=2-4&t=tqvBF1zWmvZsywUi-1

## Inspiration

Every term has that week. Group chats go quiet, the library fills up at midnight, and everyone you ask is running on four hours of sleep. As students, we noticed it was never just one of us: the same people hit the wall in the same week, because their midterms, projects and quizzes had all landed in the same five days.

What struck us was that nobody was doing anything wrong. Each instructor set reasonable dates for their own course; they just couldn't see what every other course was asking of the same students that week. And the advice we got was always about coping on our own: plan better, sleep more, try meditating. That treats a scheduling problem as a personal one.

So we flipped the question. Instead of helping one student cope, what if we could see the stress of a whole class, line it up against every deadline, and show the people who set those dates exactly where the pile-ups are? A rep could walk into a meeting with evidence, not anecdotes: "3 assessments worth 55% in five days, and stress peaked right before." Moving one date by a week costs an instructor almost nothing and spares a whole class its worst week.

That's Stress Forecast: fix the schedule, not the student.

## The problem

Stress is shared and predictable. When three midterms and a project land in the same five days, a whole class suffers together, yet the instructors who set those dates each see only their own course. Most wellbeing apps help one student cope. Stress Forecast finds the cause across a group and shows it to the people who can change the schedule.

## What it does

**Students**

- Log in and pick their courses.
- Upload a syllabus (PDF or text). Gemini pulls out every due date, weight and type, and the student can fix mistakes.
- Check in by text or voice, e.g. "barely slept, two assignments due Thursday". Gemini turns it into a 1–10 stress score, sleep hours and causes.
- See their own stress next to their deadlines, plus a heads-up about pile-ups in the next two weeks.

**Class reps** (only ever see class-wide numbers)

- **Cohort:** the class's average stress per day, with every deadline on the same timeline.
- **Pile-ups:** weeks where deadlines collide, across the courses the class shares. Each card shows each course's share, how many students it affects (e.g. "Affects 10 of 25 students") and the nearby stress peak. See [the collision cards guide](docs/rep-collision-cards.md).
- **Report:** a weekly Gemini summary with one concrete fix, such as moving one of the course's deadlines by a week.
- **Insights:** patterns the Databricks notebook finds across the term.

## Privacy

- A class's numbers only show for days when **at least 5 students** checked in. This is enforced in the API, not just the UI.
- Rep endpoints never return user ids, check-in text or any single student's data.
- Names, emails and user ids are never sent to Gemini.
- The browser only talks to our API (and Auth0 to log in), never to Gemini or the database directly.

## Tech and sponsor tracks

| Part | Tech | Owner |
| --- | --- | --- |
| Frontend | React + TypeScript (Vite, TanStack), first version generated with **Lovable** | Andrew (student side), Lawrence (rep side) |
| Login and roles | **Auth0** (Student and Rep roles, checked on every API request; MFA for reps planned) | Keith |
| API | FastAPI (Python) | Keith, Khan |
| Database | **Tiger Data** (Postgres + TimescaleDB: check-ins hypertable, daily stress continuous aggregate) | Keith |
| AI | **Gemini API** (syllabus extraction, check-in parsing, weekly reports) | Khan |
| Analytics | **Databricks** notebook: which deadline patterns come before stress spikes | Khan |
| Hosting | Vercel (frontend), Render (backend) | Lawrence |
| Dev tools | **Freebuff** (main coding agent), **Entire** (Sessions, Graph, Brain), Claude Code, Codex | Everyone |

Screenshots of how we used each tool are in [`docs/freebuff/`](docs/freebuff/), [`docs/entire/`](docs/entire/), [`docs/lovable/`](docs/lovable/) and [`docs/databricks/`](docs/databricks/).

## Repo layout

```
frontend/    React app (student and rep pages, sample data in src/mocks/)
backend/     FastAPI server (routers, Auth0, Gemini, collision detection)
db/          schema.sql and the demo seed script
databricks/  deadline_patterns.ipynb
docs/        requirements, architecture, API contract, guides
```

## Run it locally

### Frontend only (sample data, no setup needed)

Needs Node.js.

```bash
cd frontend
cp .env.example .env      # VITE_USE_MOCKS=true by default
npm install
npm run dev               # http://localhost:5173
```

Click **Log in** for the student side or **Try it as a class rep** for the rep side (demo login, no real accounts). All data comes from `frontend/src/mocks/`, which mirrors the demo seed, so nothing calls the backend or Gemini.

### Full stack

1. **Database:** create a Tiger Data (TimescaleDB) service, apply `db/schema.sql`, and seed it. See [`db/README.md`](db/README.md).
2. **Auth0:** set up the tenant, roles and demo accounts. See [`docs/auth0.md`](docs/auth0.md).
3. **Backend:**
   ```bash
   cd backend
   cp .env.example .env   # DATABASE_URL, AUTH0_*, GEMINI_API_KEY, GEMINI_MODEL
   pip install -r requirements.txt
   uvicorn app.main:app --reload   # http://localhost:8000/api
   ```
4. **Frontend:** in `frontend/.env`, set `VITE_USE_MOCKS=false` and the `VITE_AUTH0_*` values, then `npm run dev`.

Never commit `.env` files. The Gemini free quota is small, so practise with sample data and save real calls for the demo.

**Tips:**
- To skip running the backend, point `VITE_API_URL` at the live one: `https://stress-forecast.onrender.com/api`.
- No trailing slash on `AUTH0_AUDIENCE` or `CORS_ORIGINS`, or login fails.
- On a Mac with Python from python.org, if login returns "Internal Server Error" and the backend log says "Auth0 signing keys are unavailable", add `SSL_CERT_FILE=<path>` to `backend/.env`, where `<path>` is the output of `.venv/bin/python -c "import certifi; print(certifi.where())"`.
- If Gemini returns 503 "high demand", wait a minute and try again.

## Deployment

The live app runs on free tiers, so nothing here costs money.

- **Backend on Render:** a Web Service from this repo with root directory `backend`, build command `pip install -r requirements.txt` and start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set the `backend/.env` variables in Render's environment settings (plus `PYTHON_VERSION=3.13`), and list every frontend origin in `CORS_ORIGINS`, comma-separated. The free tier sleeps after about 15 minutes idle.
- **Frontend on Vercel:** root directory `frontend`, framework preset **Other**, build command `npm run build`, and environment variables `NITRO_PRESET=vercel`, `VITE_API_URL=<Render URL>/api`, `VITE_USE_MOCKS=false` and the three `VITE_AUTH0_*` values. `VITE_*` values are baked in at build time, so redeploy after changing them.
- **Auth0:** add the Vercel URL to the application's Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins, next to `http://localhost:5173`.

## Tests

```bash
cd frontend && npm test                                   # frontend
PYTHONPATH=backend python -m pytest backend/tests db/tests # backend and seed (from the repo root,
                                                           # with backend/requirements-dev.txt installed)
```

## Demo data

All cohort data is **seeded for the demo**: 40 fictional students across four `DEMO` courses in term 2026W1. The main story is week 9 in DEMO CPSC 210: CPSC Midterm 2, MATH 200 Midterm 2 and CPSC Quiz 4 land within five days (55% combined), hitting the 10 students who take both courses. Details in [`db/README.md`](db/README.md).

## Docs

- [Requirements](docs/requirements.md): what we build, priorities and privacy rules
- [Architecture](docs/architecture.md): stack, schema, auth, Gemini, collision rules, Databricks
- [API](docs/api.md): every endpoint's request and response shape
- [Auth0 setup](docs/auth0.md)
- [Rep collision cards](docs/rep-collision-cards.md): how pile-ups and the average per course work
- [Freebuff screenshots](docs/freebuff/README.md): how to add yours
- [Entire screenshots](docs/entire/README.md): session history and how to add yours
- [Lovable screenshots](docs/lovable/README.md) and [Databricks screenshots](docs/databricks/README.md)

## Team

- **Andrew:** student frontend, Lovable scaffold, demo video, Devpost
- **Lawrence:** rep frontend, deployment, pitch slides and demo script, Community Impact statement
- **Keith:** backend data and auth, Tiger Data, Auth0, seed
- **Khan:** Gemini, collision detection, Databricks, student and rep API endpoints

## License

MIT. See [LICENSE](LICENSE).
