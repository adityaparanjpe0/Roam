# Local Google OAuth configuration — PR #9, Milestone 2

This milestone prepares Google credentials and documents the configuration
contract. It does not implement login, load auth settings, install Authlib, or
change Vite routing. The human approved Milestone 1 and requested Milestone 2
only. Stop before backend implementation (Milestone 3).

## Architecture and exact URLs

React will navigate to FastAPI's Google login flow. FastAPI will use a maintained
OIDC library, validate Google's response, identify users by `(issuer, sub)`, and
issue an opaque Roam session backed by PostgreSQL. Google tokens and session
bearer secrets must never enter localStorage. See [DESIGN](../DESIGN.md#10-authentication-and-authorization)
and [ADR 0003](../adr/0003-local-oauth-configuration.md).

| Purpose | Local value | Current status |
|---|---|---|
| React / browser origin | `http://127.0.0.1:5173` | Configured in Vite |
| FastAPI upstream | `http://127.0.0.1:8000` | Documented development server |
| Login path | `/auth/google/start` | Planned FastAPI route |
| Callback path | `/auth/google/callback` | Planned FastAPI route |
| Authorized redirect URI | `http://127.0.0.1:5173/auth/google/callback` | Agreed registration target; not a working endpoint yet |

The backend currently registers only `/health`. Vite proxies only `/health`.
A later milestone must add `/auth` forwarding to port 8000, preserving the path,
and the FastAPI callback. Port 5173 is intentional: it is the browser origin,
even though FastAPI handles the callback behind the future proxy. Do not
substitute port 8000 or add a trailing slash. Use `127.0.0.1` consistently;
`localhost` is a different host. Do not add the frontend `#create-trip` fragment
to the redirect URI. Registration, authorization, and code exchange must use
the same exact URI. A callback request today cannot complete login.

## Manual Google Auth Platform checklist

Perform these steps yourself in [Google Cloud Console](https://console.cloud.google.com/).
Never paste credentials into chat or include them in screenshots/issues.

1. Create or select a dedicated development project, for example **Roam Local
   Development**. Confirm the selected project before editing. This is a Google
   Auth Platform setup, not Firebase/Identity Platform or a Maps integration.
   Do not enable billing or paid APIs, and do not create a service account.
2. Open **Google Auth Platform**. If prompted, choose **Get started**. Under
   **Branding**, use a clear development app name, a support email you monitor,
   and developer contact information. The consent screen explains which app is
   requesting identity data. Enter truthful required information; do not invent
   a public domain or upload a logo just to complete local setup. Branding and
   public-launch verification are separate from this milestone.
3. Under **Audience**, choose **External** for personal accounts or developers
   outside one Workspace organization. **Internal** applies only to an eligible
   Workspace organization and excludes outside accounts. Keep publishing status
   **Testing**; do not publish the development app.
4. Add both developers' intended Google accounts under **Test users** where
   available. Google documents an exception for identity-only scopes: with only
   `openid`, `email`, and `profile`, Testing can allow users outside that list.
   Therefore the list is not a reliable private-app access control for Roam.
   Workspace administrators can also block access independently. Do not claim
   an enforced two-user allowlist unless Roam later implements one explicitly.
5. Under **Data Access**, configure only basic identity scopes. The application
   request will use `openid email profile`. The console may display the email
   and profile scopes as `https://www.googleapis.com/auth/userinfo.email` and
   `https://www.googleapis.com/auth/userinfo.profile`. Do not select Gmail,
   Calendar, Drive, Contacts, Maps, or other data access. No Google+ API is needed.
6. Under **Clients**, choose **Create client**, type **Web application**, and a
   clear name such as **Roam local web**. The backend can protect a client secret;
   do not choose Desktop, Android, or a service account.
7. Add exactly this **Authorized redirect URI**:

   ```text
   http://127.0.0.1:5173/auth/google/callback
   ```

   **Authorized JavaScript origins** may stay empty: the approved flow uses
   backend redirects, not a Google browser SDK/popup. Do not add JavaScript SDK
   code or expose credentials just to populate that optional field.
8. Save the client. Copy its client ID and secret directly into your ignored
   root `.env`, locally. Preserve existing database values; do not overwrite
   an existing `.env` with the example. A fresh file can be copied from
   [the example](../../.env.example) only if no local `.env` exists.
9. Confirm the selected project, External/Testing status, scopes, redirect URI,
   and intended test accounts. Do not try a live callback until its route and
   proxy exist. Record completion without recording credentials.

Google can change console labels. Use these official references rather than
following prompts to enable unrelated products:
[OIDC setup and server flow](https://developers.google.com/identity/openid-connect/openid-connect),
[web-server redirect rules](https://developers.google.com/identity/protocols/oauth2/web-server),
and [audience/testing behavior](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
Reviewed 2026-11-17. No project creation, credential issuance, or successful
Google login has been verified by this documentation change.

## Scopes and credentials explained

| Scope | Why Roam requests it |
|---|---|
| `openid` | OIDC identity token and stable subject identifier |
| `email` | Email and verification claim for local profile policy; email is not the identity key |
| `profile` | Basic display profile, such as name; request does not require storing every returned field |

The **client ID** identifies the registered application; it is not a password.
The **client secret** authenticates the backend application during code exchange
and must remain server-only. Neither is a user's Google password, a Maps API
key, or a Roam session secret. Do not request offline access or store Google
tokens for later API access. This slice needs no additional Google API enabled.

## Reserved environment contract

These names are prepared for future implementation, not currently consumed by
auth code. Existing health-only startup remains independent of credentials.

| Variable | Local value / purpose | Secret? |
|---|---|---|
| `APP_ENV` | `development`; future explicit environment policy | No |
| `APP_BASE_URL` | `http://127.0.0.1:5173`; browser origin | No |
| `GOOGLE_OIDC_REDIRECT_URI` | `http://127.0.0.1:5173/auth/google/callback` | No |
| `GOOGLE_OIDC_CLIENT_ID` | Value from your development Web application client | No, but keep backend configuration here |
| `GOOGLE_OIDC_CLIENT_SECRET` | Secret from that same client | Yes |
| `DATABASE_URL` | Existing PostgreSQL URL, needed for future users/sessions | Yes |

`TEST_DATABASE_ADMIN_URL` is only for opt-in isolated database tests, never a
runtime auth URL. `OAUTH_STATE_SECRET` and `SESSION_TOKEN_PEPPER` in the broader
design are future flow/session configuration, not Google-issued credentials;
do not generate them for this milestone before the library/storage choices
establish which are required. No `VITE_GOOGLE_*` OAuth variables are needed.
Do not add the client secret to frontend environment files or browser storage.

The root `.env` is not automatically loaded by current backend settings.
When later auth code exists, the existing backend environment-file convention is:

```sh
cd backend
uv run --env-file ../.env --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Run the frontend separately using its [existing guide](../../frontend/README.md).
Do not run dependency installation or start servers just to register credentials.

## Secret protection and future security gates

The root ignore rules protect `.env`, `.env.*` (except `.env.example`),
`credentials.json`, `service-account.json`, `client_secret*.json`, and
`client_secrets*.json`, including those names in subdirectories. Prefer copying
values directly rather than downloading a credential file. If you download one,
keep it outside the repository; an arbitrarily renamed JSON file is not
automatically protected. Ignore rules do not protect files already tracked.

Safe checks from the repository root (they print paths/rules, not contents):

```sh
git check-ignore -v --no-index .env .env.local backend/.env frontend/.env.local client_secret_example.apps.googleusercontent.com.json credentials.json
git ls-files -- .env .env.local 'client_secret*.json' 'client_secrets*.json' credentials.json
```

The second command should print nothing. Never print `.env`, use a bare command
that dumps all environment variables, or paste downloaded JSON into a PR.
If a real secret is exposed, rotate it in Google; merely deleting it from Git
does not revoke it. Anyone with the secret must be treated as a trusted backend
operator. Use a separate production client with HTTPS redirect registration.

The loopback HTTP exception is for local development only. Registration is not
token validation: later implementation must still verify state, nonce, PKCE
support, signature/issuer/audience/expiry, and the verified-email policy, then
provide hashed sessions, secure cookies, expiration, logout revocation, CSRF,
and redacted callback logging. Google consent does not authorize access to
another Roam user's trips. CI must use fakes without real Google credentials.

Completion here means preparation and documented values. Manual console setup
is pending until the human performs it; login and security behavior remain
unverified. Stop before Milestone 3.
