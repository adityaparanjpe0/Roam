# Roam authentication

Status: PR #9 implementation through Milestone 8 is reported reviewed by the
human. On 2026-11-19 the human reported successful local Google sign-in and
logout after database setup and backend restart. **These are human-reported
results, not an agent-observed browser run.** Remaining manual checks, hosted CI
and production HTTPS are unverified. No released version is claimed.

## Architecture and data flow

React displays account controls; FastAPI is the confidential Google OIDC client;
PostgreSQL stores Roam users and opaque application-session hashes. There is no
frontend Google SDK, custom JWT authentication, or password database.

```mermaid
sequenceDiagram
    participant B as Browser / React
    participant V as Vite :5173
    participant F as FastAPI :8000
    participant G as Google
    participant P as PostgreSQL
    B->>V: Navigate /auth/google/start
    V->>F: Proxy same-origin request
    F->>G: Trusted discovery metadata (cached)
    F-->>B: Flow cookie and 302 authorization URL
    B->>G: Sign in / consent (state, nonce, PKCE challenge)
    G-->>B: Redirect to registered callback with code/state
    B->>V: /auth/google/callback
    V->>F: Proxy callback
    F->>F: Consume matching browser/state flow once
    F->>G: Code exchange with secret and PKCE verifier
    G-->>F: Tokens; trusted JWKS as needed
    F->>F: Verify signature, claims, nonce and email policy
    F->>P: Atomic user upsert, prior revocation, fresh session hashes
    P-->>F: Commit
    F-->>B: Session/CSRF cookies and fixed 303 to app root
    B->>V: GET /api/auth/me
    V->>F: Proxy request with browser cookies
    F->>P: Validate session and refresh last-seen
    F-->>B: Safe user profile
```

OIDC adds verified identity to OAuth's authorization-code protocol. The code is
temporary and exchanged by the backend; it is not a Roam session. Authlib builds
the OAuth requests and validates OIDC claims; joserfc verifies RS256 signatures
against Google's fixed trusted JWKS endpoint. No endpoint is taken from token
headers. Google identity must pass issuer, audience/authorized-party, signature,
expiration/issued-at/not-before, nonce, optional access-token hash and literal
boolean email_verified checks. Clock skew allowance is 30 seconds. Malformed
supplied azp/at_hash values are rejected before library comparisons.

State binds the callback to the browser's pending attempt and is consumed before
exchange. Nonce binds the signed identity to that attempt. PKCE S256 binds the
code exchange to the original server-held verifier. State/nonce/challenge are
visible in the authorization redirect; the verifier and client secret remain
on the server. Google tokens are used transiently and never persisted or sent
to React. Logout ends the Roam session, not the Google account session.

## Google project and local credentials

Use a dedicated development project in Google Auth Platform. Configure Branding
and contact information, External audience for personal/outside-organization
accounts, Testing status, and intended developer test users. Internal audience
is only for an eligible Workspace organization. Request only:

| Scope | Purpose |
|---|---|
| openid | Verified identity token and stable subject |
| email | Profile email and verified-email policy |
| profile | Basic display name |

Create a **Web application** OAuth client. Register exactly:

`http://127.0.0.1:5173/auth/google/callback`

Do not substitute port 8000, localhost, a trailing slash or a URL fragment.
Roam uses backend redirects, so a JavaScript-origin registration does not replace
the redirect URI. No browser credential or Google JS SDK is configured here.
Client ID identifies the application; client secret authenticates the backend
during exchange. They are not Google user passwords or Maps API keys.

Keep actual credentials only in your ignored root .env. Never paste them into
chat, screenshots, issues or frontend VITE_ variables. Do not enable paid Google
APIs, offline access, or broad Google data scopes for sign-in.

Google documents an identity-only exception: Testing with only these basic
scopes may permit accounts outside the test-user list. That list is not Roam
authorization. Workspace administrator restrictions can still apply. See
[Google OIDC setup](https://developers.google.com/identity/openid-connect/openid-connect),
[audience/testing rules](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview),
and the [detailed local runbook](runbooks/google-oauth-local.md).

## Environment contract — placeholders only

The root [.env.example](../.env.example) is committed documentation; .env and
downloaded client-secret JSON files are ignored. Preserve an existing .env;
never overwrite it with the template. Replace these illustrative placeholders
privately; they are not working credentials:

```dotenv
APP_ENV=development
APP_BASE_URL=http://127.0.0.1:5173
GOOGLE_OIDC_REDIRECT_URI=http://127.0.0.1:5173/auth/google/callback
GOOGLE_OIDC_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_OIDC_CLIENT_SECRET=YOUR_LOCAL_CLIENT_SECRET
POSTGRES_DB=roam_dev
POSTGRES_USER=roam_dev
POSTGRES_PORT=5432
POSTGRES_PASSWORD=YOUR_UNIQUE_LOCAL_DB_PASSWORD
DATABASE_URL=postgresql+psycopg://roam_dev:YOUR_URL_ENCODED_DB_PASSWORD@127.0.0.1:5432/roam_dev
# Optional isolated-test administrator, not application configuration:
TEST_DATABASE_ADMIN_URL=postgresql+psycopg://YOUR_TEST_ADMIN:YOUR_URL_ENCODED_TEST_PASSWORD@127.0.0.1:5432/postgres
```

APP_ENV accepts development/test/production. APP_BASE_URL is the browser-facing
canonical lowercase origin: no path, query, fragment, trailing slash or explicit
default port. Production requires HTTPS. HTTP is permitted only on explicit
loopback in development/test. Remote database URLs require sslmode=verify-full
with trusted certificates. URL-encode reserved password characters; this does
not change POSTGRES_PASSWORD itself.

POSTGRES_* initializes a fresh Compose volume; changing the file does not change
credentials in an existing volume. DATABASE_URL configures runtime persistence.
TEST_DATABASE_ADMIN_URL is optional, local-maintenance-only and used only with
--run-db-tests; never point tests at production. No session signing key, pepper,
OAUTH_STATE_SECRET, API-base frontend variable or VITE_GOOGLE_* value is required.
Settings load explicitly from the process environment, not automatically from
.env. Use uv --env-file for the backend and restart after configuration changes.
The configured auth client and origin settings are cached. Health remains
independent of database/Google configuration.

## Start local PostgreSQL, backend and frontend

Commands below are for you to run locally; they have not been executed with your
credentials by the agent. Start at the repository root. Install locked backend
dependencies with `cd backend` then `uv sync --frozen --all-groups`; install
frontend dependencies with `cd frontend` then `npm ci`. Use Python 3.12 and Node
24.22.3. Existing installed environments can be reused.

### 1. PostgreSQL — choose one server

The repository-supported Compose path requires Docker Desktop/Engine running:

```sh
docker --version
docker compose version
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90 db
docker compose ps
```

Use --quiet for config; a full rendered configuration can expose the database
password. Run these commands yourself after editing your ignored .env. Port 5432
must be available, or use POSTGRES_PORT and the matching DATABASE_URL port.
Never use down -v as a troubleshooting shortcut. Full setup and password-prompt
connection checks are in the [PostgreSQL runbook](runbooks/local-postgres.md).

If using an **existing native Windows PostgreSQL** instead, do not also start
Compose on the same port. On this machine the agent observed the
postgresql-x64-17 service stopped on 2026-11-18; Docker was not on the agent PATH.
Open Windows Services and start that service, or use an elevated PowerShell:

```powershell
Start-Service -Name postgresql-x64-17
Get-Service -Name postgresql-x64-17
```

This starts the existing cluster; it does not create roam_dev/user or change a
password. If they are missing or you do not know the local admin login, stop and
report that status rather than reinitializing the cluster. Configure DATABASE_URL
privately for your existing development database/role. Do not share it. Native
17.0 was used for disposable automated tests; Compose/CI target 18.7, so it is
not a claim of identical platform verification. No database service is started
or reconfigured by this documentation task.

### 2. Migrate and start FastAPI — separate terminal

Confirm DATABASE_URL names your intended local development database before
running migrations. These create/update application tables; do not target a
database containing unrelated data.

```sh
cd backend
uv run --env-file ../.env --locked alembic upgrade head
uv run --env-file ../.env --locked alembic current
uv run --env-file ../.env --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Current migration head is 0002. Startup does not auto-migrate. The Uvicorn command
keeps running; wait for startup completion, not process exit. Keep one worker;
reload/restarts during an OAuth attempt discard its process-local flow state.
Do not enable DEBUG or HTTP wire logging. /health returning 200 proves liveness,
not successful database access or Google login.

### 3. Start Vite — another terminal

```sh
cd frontend
npm run dev
```

Use npm.cmd on Windows if PowerShell blocks npm's script shim. Vite binds
127.0.0.1:5173 with strictPort; keep it running and open
`http://127.0.0.1:5173/`. If a server already occupies a required port, use or stop
that known server; do not move the OAuth origin to an arbitrary port.

Vite proxies /auth, /api and exact /health to 127.0.0.1:8000, preserving paths,
cookies and Origin. Browser requests use relative same-origin URLs; no wildcard
or credentialed cross-origin CORS grants are needed. Production asset serving
and the HTTPS deployment layer remain planned. Stop local dev servers with
Ctrl+C when done; stopping PostgreSQL preserves its data.

## API contracts

These are the actual paths; session routes are the approved exception to the
future /api/v1 convention. There is no /api/auth/google/login alias.

| Method/path | Success | Failure |
|---|---|---|
| GET /auth/google/start | 302 Google authorization URL; ten-minute flow cookie | 400 ambiguous cookies; 429 capacity; 503 configuration/discovery |
| GET /auth/google/callback | Consumes state; verifies identity; commits user/session; sets cookies; 303 configured app root | 400 invalid state/response/token or denied consent; 403 unverified email; 503 config/provider/database |
| GET /api/auth/me | 200 safe profile; validates and refreshes session idle activity | 401 missing/malformed/unknown/expired/revoked; 503 config/database |
| POST /api/auth/logout | Session-bound CSRF plus exact origin proof; revoke server row, then 204 empty body and cookie clearing | 401 absent/invalid session (cookies cleared); 403 CSRF; 503 config/database |
| GET /health | 200 {"status":"ok"}, no credentials/database required | Not a readiness or authentication check |

/me response example (synthetic data):

```json
{"user":{"id":"00000000-0000-0000-0000-000000000001","email":"traveler@example.com","display_name":"Traveler"}}
```

display_name may be null. No bearer, CSRF secret or Google token is returned in
JSON. Auth responses are no-store. Auth failures use:

```json
{"error":{"code":"AUTHENTICATION_REQUIRED","message":"Sign in to continue.","request_id":"SERVER_GENERATED_UUID","details":{}}}
```

The matching X-Request-ID identifies safe diagnostics. Do not send callback URLs,
request headers/cookies or private profile data when reporting errors. Callback
failure displays JSON; it does not redirect to a recovery page. Return to the
app root and restart sign-in. Successful redirects are fixed to APP_BASE_URL +
"/"; next/return_to/Host/forwarded-host/provider error URLs do not choose targets.

## Users, sessions, cookies and CSRF

[User](../backend/app/db/models/user.py) has UUID, issuer/subject, normalized
email, optional bounded name and audit timestamps. Unique (oidc_issuer,
oidc_subject) is the identity key; Google sub is stable while email can change.
Email is never an account-merge/authorization key. PostgreSQL upsert handles
concurrent first logins; returning users retain UUID/ownership and update allowed
profile fields. Missing name preserves an existing name.

[AppSession](../backend/app/db/models/app_session.py) stores UUID/user FK, unique
32-byte SHA-256 token hash, CSRF hash, created/absolute-expiry/last-seen/revoked
timestamps. Fresh CSPRNG 256-bit bearer and CSRF values are generated at login.
The same short transaction upserts user, revokes the presented prior session and
inserts the new hashes. Cookies are issued only after commit. No Google network
call occurs inside that transaction. Revision 0001 created users; additive 0002
created sessions. No raw bearer, Google tokens or refresh tokens are stored.

| Cookie | HTTP loopback name | HTTPS name | Attributes |
|---|---|---|---|
| Transient flow binding | roam_oauth | __Host-roam_oauth | HttpOnly, Lax, Path=/, ten minutes |
| Application bearer | roam_session | __Host-roam_session | HttpOnly, Lax, Path=/, seven-day browser maximum |
| CSRF delivery | roam_csrf | __Host-roam_csrf | JS-readable intentionally; Lax, Path=/, same browser maximum |

All are host-only with no Domain; HTTPS adds Secure and __Host- names. Production
HTTP is rejected. Lax permits the top-level GET callback from Google while unsafe
application requests independently require CSRF proof. Server sessions expire at
seven days absolute or 24 hours idle,
whichever comes first. Valid requests refresh last_seen, never absolute expiry.
Invalid/CSRF-rejected requests do not refresh it. Expiry can precede browser-cookie
expiry. Session validation locks its row to serialize activity with revocation;
logout/rotation cannot be undone by a stale last-seen update.

Unsafe requests using get_current_user/get_current_session require X-CSRF-Token
matching the delivery cookie and the stored session-bound CSRF hash, plus exact
configured Origin (same-origin Referer fallback only when Origin is absent).
Duplicate credential cookies/security headers fail closed. SameSite is additional
defense, not the only check. No token is put in localStorage/sessionStorage.
XSS remains dangerous because same-origin script can act as the user even with
an HttpOnly bearer; secure cookies do not replace browser/serving-layer defenses.

## React state and authentication versus authorization

[AuthProvider](../frontend/src/features/auth/AuthProvider.tsx) uses small built-in
React state/context, and the [auth service](../frontend/src/api/auth.ts) uses
same-origin fetch, response validation, no-store, a ten-second timeout and abort
handling. Only validated /me 200 establishes a profile; 401 ends it. Other failures
are unknown/recoverable, not invented sign-in or logout success. Focus, visible-tab
return and reconnect recheck the session without polling. A mounted tab may show
its last confirmed identity until a check; the backend remains authoritative.

Sign-in is full-page navigation. It clears the unsaved trip draft, disclosed by
the button description. Logout waits for 204/401; missing CSRF or 403 checks /me
once before inferring absence. Failed logout offers recovery, with accessible
status/alert text and focus management. Auth state changes preserve the mounted
local form. No trip is saved by signing in.

Authentication answers who the user is. Authorization decides whether that user
may access a resource. get_current_user supplies a server-validated identity;
frontend state, route visibility and email cannot grant backend access.

**PR #10 is planned** to add owner-only trip persistence/API access using that
identity: set owner_id from the session, filter resource queries by both resource
ID and owner UUID, reach child records through the owned trip, return a
non-enumerating 404 for another user's resource, apply CSRF to unsafe requests,
and add cross-user access tests. Exact contracts belong to PR #10 planning; these
trip routes, ownership enforcement and CRUD are not implemented by PR #9. No
role column/RBAC or collaboration feature is implied.

## Troubleshooting

| Symptom/code | Safe next step |
|---|---|
| redirect_uri_mismatch from Google | Compare registered URI, APP_BASE_URL and GOOGLE_OIDC_REDIRECT_URI exactly; use 5173 and 127.0.0.1. Restart backend after changes. |
| invalid_client from Google / OAUTH_IDENTITY_INVALID on exchange | Privately confirm ID and secret belong to the same Web client; never paste them into diagnostics. Restart sign-in with a fresh code. |
| AUTH_NOT_CONFIGURED (503) | Backend must explicitly load ignored .env; check required names, canonical origin and matching callback locally. Restart backend. |
| AUTH_UNAVAILABLE (503) | Google discovery/JWKS/exchange may be unavailable or timed out; use safe code/request ID, retry a new flow later. Do not bypass TLS/state/nonce. |
| OAUTH_CALLBACK_INVALID (400) | Missing/wrong/expired/consumed state, missing browser binding, malformed/duplicate response or backend restart. Return to root and start again in one browser. |
| OAUTH_CONSENT_DENIED (400) | Consent was not completed; return to root and retry only when ready. |
| EMAIL_NOT_VERIFIED (403) | Google signed identity must contain literal verified-email true; do not override the policy locally. |
| DATABASE_UNAVAILABLE (503) | Check server, intended local DATABASE_URL and migrations through 0002 privately. Profile/session is not claimed saved; retry from sign-in. |
| AUTHENTICATION_REQUIRED (401) | Missing, invalid, expired or revoked session; browser cookies clear, sign in again. No account-existence details are exposed. |
| CSRF_FAILED (403) | Check same browser origin, delivery cookie and Origin-preserving proxy; reload/check session or sign in again for a fresh pair. Do not disable CSRF. |
| Access blocked by Google | Check audience, Testing/test users and Workspace admin rules. Do not broaden scopes or publish just to bypass a block. |
| Vite fails on DEBUG / occupied port | Disable DEBUG for this terminal; use or stop the known dev server. Never enable raw callback URL logging. |
| Backend connection succeeds but auth fails | /health is liveness only; database/Google settings need separate checks. |

## Tradeoffs, verification and limits

Opaque PostgreSQL sessions support immediate server-side revocation and avoid
putting profile/session contents in a signed browser cookie. They cost a database
lookup/write and require DB availability. Signed-cookie sessions reduce that
lookup but signing does not encrypt contents; immediate per-session revocation
needs additional state. Random-token SHA-256 hashing is suitable here because
the input has high entropy, unlike a human password.

Pending OAuth state is bounded to 256 attempts in one process, expires after ten
minutes and is lost on restart. One store is constructed before requests are
served, avoiding concurrent lazy-initialization races. Shared durable flow state is required before
multi-worker deployment. This is not complete rate limiting. Session cleanup,
retention/account deletion, public-launch Google review, production TLS/static
serving/security headers/CSP and deployed proxy logging remain future work.
Provider reads have five-second HTTPX timeouts and cooperative elapsed checks,
64 KiB bodies, fixed endpoints, no retries/redirects/environment proxies; this is
not a hard whole-login cancellation deadline. HTTPX-decoded gzip/deflate bodies
are reconstructed without stale wire encoding/length headers, preserving the
decoded-body size limit. Roam logout does not revoke Google
consent, log out other browsers, or delete the user.

Uvicorn callback queries are removed from access-log scope. Vite sanitizes proxy
errors and rejects DEBUG serving. Auth diagnostics contain only stable code,
status and generated request ID (INFO expected rejections, WARNING outages).
Configure logger levels deliberately; never log wire traffic, codes/tokens,
headers/cookies, SQL parameters, exceptions with credentials, or private profiles.
Other reverse proxies need their own redaction.

Use the [manual checklist](auth-manual-checklist.md) for first/returning login,
refresh, /me, logout, invalidation, invalid callback, denial and frontend failures.
The checklist records human-reported local sign-in/logout success and keeps
unreported checks pending. The
[automated test guide](auth-testing.md) explains mocks and reproducible checks;
synthetic passing tests do not prove live Google interoperability. See also the
[security audit](auth-security-audit.md) and [session decisions](adr/0006-application-sessions.md).

Milestone 9 automated rerun on 2026-11-18: 357 backend tests passed including 91
PostgreSQL cases on a disposable native 17.0 UTC cluster; 200 frontend tests
passed. Ruff format/lint, mypy app, frontend lint/typecheck/build and relative
documentation-file link checks passed. Default pytest separately passed 266
with the 91 opt-in DB cases skipped. Existing TestClient deprecation warning
remains. Docker Compose validation/build and hosted CI were not run. These results
do not fill in any live manual checklist item.

Earlier 2026-11-19 troubleshooting: healthy /health endpoints do not guarantee auth
configuration. A safe local probe observed 503 AUTH_NOT_CONFIGURED at /api/auth/me
and /auth/google/start; the environment loaded from the current root file lacked
usable database/Google settings. No values were printed and the credential file
was not overwritten. Put the actual values only in your ignored local environment
file, then restart FastAPI with --env-file pointing to that exact file. Docker
does not create native Windows database roles or make the uv process load a
different file automatically. Follow-up synthetic verification passed 368 backend
tests (93 PostgreSQL cases), 275 database-free tests and 200 frontend tests, plus
format/lint/types/build. Those automated results use synthetic Google responses.

Later 2026-11-19 the human reported completing local PostgreSQL 19 database/role
creation and migration commands, entering the real configuration privately, and
restarting the backend. They confirmed live Google sign-in and logout work
locally, superseding the earlier reported configuration blocker. No credential,
private profile or token values were captured. Exact response statuses, cookie
inspection, UUID comparison, remaining failure-path manual tests and production
HTTPS/hosted CI were not independently observed. See the manual checklist for
the precise evidence boundary; the full PostgreSQL suite has not run on 19.
