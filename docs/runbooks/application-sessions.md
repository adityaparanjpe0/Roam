# Roam application sessions — PR #9 Milestone 5

Backend application sessions now use PostgreSQL independently of transient
Google flow records. Milestone 6 adds React controls and Vite auth/API proxies;
see [frontend auth](../frontend-auth.md). No live Google login or HTTPS deployment is
claimed. See [ADR 0006](../adr/0006-application-sessions.md).

## Setup and migration

Keep the existing root ignored `.env`; do not overwrite it or paste credentials
into chat. Backend session validation needs APP_ENV, APP_BASE_URL, and
DATABASE_URL. Google initiation/callback additionally use the existing
GOOGLE_OIDC_* credentials. No session signing key or pepper is required.
Health-only startup remains independent of database/auth settings.

After verifying that DATABASE_URL names your intended local development database,
apply the additive migration explicitly from `backend/`:

```sh
uv run --env-file ../.env --locked alembic upgrade head
uv run --env-file ../.env --locked alembic current
uv run --env-file ../.env --locked alembic check
```

Expect revision `0002`. Do not run downgrades on regular data to test them.
The scratch migration tests rehearse 0001 → 0002 → 0001 → 0002 while preserving
an existing user. Downgrading 0002 drops sessions only, requiring re-login.

## HTTP contracts

| Endpoint | Contract |
|---|---|
| `GET /auth/google/callback` | Existing Google validation; atomic profile/session creation and prior-token revocation; cookies after commit; fixed 303 to APP_BASE_URL + `/` |
| `GET /api/auth/me` | Safe user profile JSON, or generic 401; never returns bearer, CSRF token, session UUID, or Google tokens |
| `POST /api/auth/logout` | Valid session plus session-bound CSRF cookie/header and trusted origin; server revocation, then 204/cleared cookies |

The `/api/auth` paths follow the explicit current human request; the earlier
planned `/api/v1/me` and `/api/v1/auth/logout` are absent, not aliases. Future trip
APIs remain under `/api/v1`. OpenAPI describes the typed profile/error contracts;
frontend API client generation/integration remains for the frontend milestone.

Example successful `/me` body (all synthetic):

```json
{"user":{"id":"00000000-0000-0000-0000-000000000001","email":"student@example.com","display_name":"Student"}}
```

Use `get_current_user` on future protected routes. Authentication identifies the
user; authorization must still filter owned resources by that user's UUID.
There are no roles or trip endpoints in this milestone.

## Cookies, lifetime, and CSRF

Local HTTP on `127.0.0.1` uses `roam_session` (HttpOnly) and `roam_csrf`
(JavaScript-readable). HTTPS uses their `__Host-` names and Secure. Both are
host-only, Path=/, SameSite=Lax and expire absolutely after seven days. No broad
Domain setting is used. The server also rejects 24-hour idle expiry; even a
retained cookie cannot bypass database expiration/revocation. Successful requests
refresh idle activity, never absolute expiry. Expired/revoked rows remain stored
until future retention cleanup, but cannot authenticate.

Future frontend unsafe requests must read only the CSRF delivery cookie and
send `X-CSRF-Token`, using same-origin credentials. Do not copy the bearer cookie
into JavaScript, JSON, URLs, logs, screenshots, localStorage, or sessionStorage.
The header/cookie digests must match the current session's DB CSRF hash, and
Origin must exactly match APP_BASE_URL. Referer is a fallback only when Origin
is absent. No wildcard CORS exception is added. A matching arbitrary pair from
another session fails. No token is returned in `/me` JSON.

If the CSRF cookie is missing/invalid, authenticate again to get a fresh pair;
GET /me deliberately does not rotate it and disrupt other tabs. A 403 does not
log the user out or refresh idle activity. A database 503 does not clear a
potentially valid session. Logout revokes only the current session, and only a
successful commit results in 204 and cookie clearing. Reusing its copied bearer
then returns generic 401. A new successful Google login always replaces the
browser's bearer and revokes its presented prior one atomically.

Do not treat HttpOnly or CSRF controls as a replacement for XSS prevention or
server ownership checks. Future unsafe handlers must use the authentication
dependency (which enforces CSRF automatically) and their own authorization.

## Verification

Use installed locked dependencies and synthetic fixtures; do not load real Google
credentials for tests:

```sh
uv run --locked pytest tests/test_session_security.py tests/test_session_api.py tests/test_oauth_callback.py
uv run --locked pytest
```

For PostgreSQL integration, use the existing explicit isolated-test maintenance
URL and scratch database safeguards in the [backend guide](../../backend/README.md):

```sh
uv run --env-file ../.env --locked pytest --run-db-tests -m database
```

Tests include session rotation, expiry boundaries, revocation replay, rollback,
cross-session CSRF, concurrent validation/logout, DST duration constraints,
callback → /me → logout, and migration data preservation. Test-only provider
substitutes never become production login shortcuts. No Google/paid calls run.

Keep the agreed browser origin `http://127.0.0.1:5173`, FastAPI upstream
`http://127.0.0.1:8000`, and Google redirect
`http://127.0.0.1:5173/auth/google/callback`. Shared OAuth flow storage, throttling,
cleanup policy, and production verification remain future work. React controls
and the proxy have synthetic verification; current live results and manual steps
are maintained in [AUTH](../AUTH.md) and the [checklist](../auth-manual-checklist.md).
