# Freebuff screenshots

Everyone's Freebuff screenshots go in this folder. Khan builds the "Best Project Built with Freebuff" write-up from them, so the more good sessions we capture, the stronger it is.

## How to add yours

1. **Take screenshots while Freebuff works** (Mac: Cmd + Shift + 4, then drag). Good moments: it reading the code, its plan, its edits, and the passing tests. Expand collapsed output ("Show more lines") first so the results are visible.
2. **Name them** `<issue>-<short-name>-<step>-<what>.png`, for example `16-checkin-endpoint-2-plans-route.png`. Numbering the steps keeps them in order.
3. **Put them in this folder** (`docs/freebuff/`), not in a subfolder.
4. **Add a section below** with a heading `## #<issue> <title> (<your name>, <date>)` and one line per screenshot saying what Freebuff did in it.
5. **Commit them with the feature** in the same PR.

Keep captions honest: only describe what Freebuff did. If you or another tool changed the code afterwards, don't credit Freebuff for it.

## #24 Rep collision flags (Lawrence, Nov 7)

- `24-collision-cards-1-reads-docs.png`: Freebuff takes the issue #24 prompt, reads the API docs, the rep pages and the existing tests, and works out that the collision card is already mostly built.
- `24-collision-cards-2-plans-fix.png`: Freebuff checks the git history and the shared components, then narrows the gap down to how a card with no nearby stress peak is labelled.
- `24-collision-cards-3-edit-and-tests.png`: Freebuff changes the card to say "Not enough responses", writes `rep-collisions.test.tsx`, and runs `npm test` with all tests passing.
- `24-collision-cards-4-summary.png`: Freebuff's final summary of the session: the card change, the new page tests, and `npm test` passing (6 files, 33 tests).

## #25 Rep weekly report (Lawrence, Nov 7)

- `25-weekly-report-1-reads-docs.png`: Freebuff takes the #25 prompt (report states plus fewer Gemini calls) and reads the API docs, requirement R5, the report page, the error types and the existing rep tests.
- `25-weekly-report-2-plans-and-edits.png`: Freebuff finds the page already shows the summary, top cause and fix, plans the missing loading and "no report yet" states, and adds a retry rule that skips errors a retry can't fix.
- `25-weekly-report-3-query-and-states.png`: Freebuff caches each week's report (`staleTime: Infinity`, no refetch on tab focus), adds the loading and "No report yet" states, and creates `rep-report.test.tsx`.
- `25-weekly-report-4-runs-tests.png`: Freebuff runs `npm test` and starts its summary of the changes.
- `25-weekly-report-5-summary.png`: Freebuff's final summary: the tests it added and `npm test` passing (10 files, 82 tests).
