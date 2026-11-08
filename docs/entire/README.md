# Entire screenshots

Evidence of how we used Entire (Sessions, Graph and Brain), for the "Best Use of Entire" track and the Devpost write-up (#33). Upload the same images to the Devpost gallery.

## How to add yours

1. **Only screenshot output that has no session content.** Good: `entire checkpoint list`, `entire status`, `entire plugin list`, a Graph result, a Brain brief. Don't screenshot `entire checkpoint explain` or anything that shows the conversation itself.
2. **Check every screenshot for secrets before committing.** This repo is public. Look for passwords, API keys, tokens and database connection strings. If you see one, retake or crop the screenshot.
3. **Never run `entire checkpoint push`** or upload sessions until the team has changed the database password and Gemini keys: some sessions contain them.
4. **Name it** `<issue>-<what>-<step>-<your name>.png`, for example `33-brain-brief-1-keith.png`, and put it straight in this folder.
5. **Add a caption line below** under your name, saying what the screenshot shows.

## Sessions

- `33-checkpoint-list-1-lawrence.png`: `entire checkpoint list` on `main` showing 25 checkpoints from Lawrence's Claude Code session, each linked to the commit it produced (for example "README: add the inspiration story" and "Rep insights panel … (#26)"). Every one of those commits also carries an `Entire-Checkpoint:` line in its message, e.g. [28ed841](https://github.com/manandrew-dev/Stress-Forecast/commit/28ed841).

- `33-checkpoint-links-1-keith.png`: 26 distinct `Entire-Checkpoint` links in `main`'s history, with two examples ("README: add the inspiration story", "Sample data: match the backend's new collision rule and heads-up message").
- `33-status-1-keith.png`: `entire status` summary: Entire enabled, checkpoint push disabled (sessions stay private).

## Graph and Brain (Keith)

- `33-graph-query-1-keith.png`: an Entire **Graph** query over the committed code ("How are cross-course rep collisions implemented, including shared courses and the own-course filter?"). It points straight to `cross_course_rep_collisions` in `backend/app/services/collisions.py`, `find_collisions` in the same file, and `cohort_course_sets` in `backend/app/services/cohort.py`.
- `33-brain-docs-query-1-keith.png`: an Entire **Brain** docs-only query about cohort privacy, returning 6 hits across `docs/api.md`, `docs/architecture.md` and `docs/requirements.md`, the decisions behind the 5-student rule.
