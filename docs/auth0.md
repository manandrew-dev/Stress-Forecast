# Auth0 setup for Stress Forecast

Use the team's Auth0 tenant and a development Tiger Data database. A tenant administrator can complete the following steps in the Auth0 Dashboard.

1. Under **Applications → APIs**, create the Stress Forecast API. Set the identifier to `https://api.stressforecast.app` and the signing algorithm to `RS256`. In the API settings, enable **RBAC**. Use signed JWT access tokens for the API.
2. Under **User Management → Roles**, create the tenant roles `student` and `rep`.
3. Under **Actions → Library**, create a custom **Login / Post Login** Action. Paste the code below, save it, and deploy it. Under **Actions → Triggers → post-login**, add the Action to the login flow and apply the change.
4. Under **User Management → Users**, create two demo users in the database connection used by the frontend application. On each user's **Roles** tab, assign exactly one application role. Assign `student` to the student demo user and `rep` to the representative demo user. Share their credentials privately.
5. Configure the frontend's Auth0 **Single Page Application** with the actual callback URL, logout URL, and web origin for the frontend. For local development the Vite origin is `http://localhost:5173`. Set `VITE_AUTH0_DOMAIN` to the login hostname, `VITE_AUTH0_CLIENT_ID` to the SPA's Client ID, and `VITE_AUTH0_AUDIENCE` to the API identifier. Request an access token with that audience.
6. Set `AUTH0_DOMAIN` in the backend environment to the same login hostname, and `AUTH0_AUDIENCE` to `https://api.stressforecast.app`. The issuer must match `https://<AUTH0_DOMAIN>/`. Set `DATABASE_URL` for the database with the Issue #14 schema applied. The existing [environment example](../backend/.env.example) lists the variables.

## Post-Login Action

```javascript
exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== "https://api.stressforecast.app") {
    return;
  }

  const roles = (event.authorization?.roles ?? []).filter(
    (role) => role === "student" || role === "rep",
  );
  api.accessToken.setCustomClaim("https://stressforecast.app/roles", roles);
};
```

The API requires the resulting claim to be exactly `["student"]` or `["rep"]`. A verified token with no application role or both roles receives `403`. Request a fresh access token after changing roles. The API authorizes from the roles in the verified token for its validity period.

From `backend/`, install `requirements-dev.txt` and run `python -m pytest` for the local checks with generated signing keys and mocked JWKS responses.

## Verify the demo accounts

After the shared and rep endpoints are available, sign in separately with both accounts and request fresh tokens. With each token, call `GET /api/me` and verify the response has the assigned role. For the rep, use the verified subject to confirm a `rep_assignments` row exists for the demo course. Verify that the rep can access that course and receives `403` for an unassigned course. Demo course assignments belong to the database setup.

[Register APIs](https://auth0.com/docs/get-started/apis/register-apis) · [Create roles](https://auth0.com/docs/manage-users/access-control/configure-core-rbac/roles/create-roles) · [Post-Login Action API](https://auth0.com/docs/actions/reference/post-login/post-login-api-object)
