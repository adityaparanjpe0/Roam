# Trip creation integration: local setup and verification

PR #11 connects the existing review form to authenticated POST `/api/v1/trips`.
There is no dashboard or generated itinerary. See [the API contract](../trip-api.md),
[form behavior](../trip-creation-form.md) and [ADR 0010](../adr/0010-trip-creation-integration.md).

## What has actually been verified

On 2026-11-22, the committed frontend/backend passed a real browser → Vite proxy
→ FastAPI → PostgreSQL check using an independent PostgreSQL 18.7 container,
scratch database, loopback ports and isolated Chrome contexts. No fetch mocks or
authentication dependency overrides were used in that check. Only the initial
Google identity was substituted: a temporary, external verification wrapper used
the existing session service/cookie setter to issue synthetic Alice/Bob sessions.
That wrapper, fixture login route, temporary config, servers and database were
removed. No test-login endpoint was added to the application or committed.

Observed: create 201 and saved UI, identical detail data after refresh, one owned
list item, other-owner 404/empty list, guest 401, missing-CSRF 403, owner-ID input
422, logout 204 followed by 401, and access to the saved trip after a new session.
This verifies real persistence/session authorization, not Google's current consent
screen or production HTTPS. Complete the live-Google checklist below before
merging; agent verification did not use a real Google account. Full evidence and
test counts are in [memory](../memory.md).

## Prerequisites

- Docker Desktop running; Python 3.12/uv and Node 24.22.3 available.
- Your ignored root environment file configured using the existing
  [example](../../.env.example) and [Google setup](../AUTH.md). Do not copy a
  teammate's password or print environment values.
- Runtime DATABASE_URL points to your intended local development database.
  TEST_DATABASE_ADMIN_URL is separate and must name the local `postgres`
  maintenance database for disposable integration tests.
- Keep browser origin `http://127.0.0.1:5173` and the existing callback
  `http://127.0.0.1:5173/auth/google/callback`. Do not mix localhost/127.0.0.1,
  change cookie policy or loosen CORS to fix a local configuration error.

No new environment variable, API key, dependency or migration is required by PR #11.

## Start locally

From the repository root:

```sh
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90 db
cd backend
uv sync --frozen --all-groups
uv run --env-file ../.env --locked alembic upgrade head
uv run --env-file ../.env --locked alembic current
uv run --env-file ../.env --locked alembic check
uv run --env-file ../.env --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Confirm the database is your local development database before applying existing
migrations. Expected revision: `0002 (head)` and no new upgrade operations.
Never downgrade or clear tables to diagnose sign-in. Uvicorn intentionally stays
running: leave that terminal open. It is not a stalled check.

In another terminal, from the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Vite also intentionally stays running. If global Node is below 24.22.3, use the
[documented pinned-runtime alternative](../../frontend/README.md#without-nvm),
for example `npm exec --yes --package=node@24.22.3 -- npm run dev`.
No frontend secret/API URL variable is needed: Vite already forwards relative
`/api`, `/auth`, and `/health` requests, preserving Origin and cookies.

## Final live-Google smoke check (human action)

These steps intentionally create one synthetic trip in your development account.
They do not delete existing data. Record pass/fail, not credentials or real-user
payloads. They are not already claimed passed by the agent.

1. Open `http://127.0.0.1:5173/` and sign in with Google **before** entering data.
   Full-page sign-in clears unsaved in-memory details. Confirm the account UI.
2. Enter Lisbon, Portugal; destination timezone Europe/Lisbon; March 27–30 2027;
   two travelers; USD 750.50 per person; Food; optional synthetic preferences.
   Do not use the browser's timezone as an inferred destination timezone.
3. Review first: there must be no create request yet. Choose **Save trip** once.
   In Network, expect POST `/api/v1/trips` → 201 and a relative Location header.
   Do not copy Cookie/X-CSRF-Token headers or export an authenticated HAR.
4. Confirm **Trip saved**, the server title/dates/budget/timezone and trip UUID.
   Save/Edit must be disabled while the request is pending. No success may appear
   before the validated response. Do not repeatedly retry an uncertain outcome.
5. Refresh. The local form/confirmation resets; the saved record must remain.
   From the console on that same Roam origin, check only nonprivate status facts:

   ```js
   const tripId = 'replace-with-your-synthetic-trip-uuid'
   const response = await fetch(`/api/v1/trips/${tripId}`, {
     credentials: 'same-origin', cache: 'no-store',
   })
   const trip = await response.json()
   console.log({ status: response.status, sameTrip: trip.id === tripId,
     expectedBudget: trip.budget_per_person_minor === 75050 })
   ```

   Expect 200, sameTrip true and expectedBudget true. Do not print the full body.
   GET `/api/v1/trips` should also include the trip; the dashboard is future work.
6. Sign out and verify the detail request returns 401. Sign in again and verify
   it returns 200: logout revokes the session, not the saved trip.
7. With a second permitted Google test account, the first account's UUID must
   return 404 and must not appear in its list. Missing and other-owner trips
   deliberately use the same public error. Do not publish real account identities.

If you cannot use a second Google account, report that manual step as unverified;
the isolated two-session PostgreSQL check covers the backend boundary separately.
Report which steps you observed so evidence can be updated accurately.

## Failure recovery and limits

- `DATABASE_UNAVAILABLE`: check `docker compose ps`, database health, explicit
  environment loading and revision 0002. `/health` is liveness only; 200 does not
  prove PostgreSQL is reachable. Do not erase a volume or change Google settings
  to repair a stopped local database.
- Save disabled: finish account checking/sign-in, or use the existing account
  retry control. UI authentication is a snapshot; the backend still checks every
  session and owns authorization.
- CSRF failure: sign in again using the offered recovery, after noting the
  unsaved-data warning. Do not bypass the CSRF header/origin checks.
- Server 422: the form preserves raw entries, labels server validation, and
  focuses the rejected field. Editing a different field must not erase that error.
- Network/timeout/invalid success: inputs remain available, but the server may
  already have committed. The client never automatically retries POST. A manual
  retry can create a duplicate; cancellation is not a rollback guarantee.
- To inspect an unavailable-backend state, stop only your Uvicorn process, then
  attempt Save with synthetic details. Expect safe error feedback and preserved
  data, not a saved confirmation. Restart the backend before deliberately retrying.

Use Ctrl+C in the Vite/Uvicorn terminals when finished. Optionally run
`docker compose stop db` from the root; the existing named volume is retained.
PR #11 adds no schema change, so application rollback needs no migration downgrade
and must not delete already saved trips.

## Repeatable automated checks

From `frontend/`, with pinned Node:

```sh
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

From `backend/`:

```sh
uv sync --frozen --all-groups
uv lock --check
uv run --locked ruff format --check .
uv run --locked ruff check .
uv run --locked mypy app
uv run --locked pytest
uv run --env-file ../.env --locked pytest --run-db-tests
```

The default backend command skips opt-in database tests. The explicit database
command creates/drops registered scratch databases through TEST_DATABASE_ADMIN_URL;
it must never fall back to DATABASE_URL or point at production. Frontend tests
mock HTTP and ordinary backend tests fake Google/provider traffic. Hosted CI,
teammate review, real Google smoke checks and deployed HTTPS remain distinct from
local automated results.
