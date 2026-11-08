<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- All network access goes through `src/api/client.ts` (the only place `fetch()` is called); while `VITE_USE_MOCKS` isn't `"false"` it answers from `src/mocks/`. Why: the real API is connected later by flipping one switch.
- API types in `src/api/types.ts` mirror the backend contract field-for-field; never rename fields. Why: mocks and the real API must be interchangeable.
- Auth is a stub (`src/auth/`): `useAuth()` returns a fake user and role; role guards live in `RequireRole`. No backend or Lovable Cloud. Why: real auth will replace the stub without touching pages.
- Page components live in `src/pages/{student,rep}/`; files in `src/routes/` stay thin (head + component). Why: requested folder structure.
- Cohort charts must break the line on suppressed days (`toCohortSeries` nulls them); covered by `src/test/rules.test.ts`. Why: privacy — too few responses must never be shown or interpolated.
