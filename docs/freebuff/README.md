# Freebuff screenshots

Screenshots of Freebuff sessions, for the "Best Project Built with Freebuff" write-up. One line per screenshot.

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
