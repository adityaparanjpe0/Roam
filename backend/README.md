# Roam backend

The backend includes FastAPI liveness, PostgreSQL/SQLAlchemy migrations and
Google OIDC with database-backed Roam sessions. Health-only startup needs no
credentials or database. Actual login/session APIs require configured backend
settings and a migrated local database. See [AUTH](../docs/AUTH.md) for actual
contracts, private local environment setup, startup and troubleshooting, and the
[manual checklist](../docs/auth-manual-checklist.md) for live verification.

## Prerequisites

- Use Python **3.12** for development, as selected by `.python-version`.
  The project declares a Python 3.12 minimum; newer minor versions have not
  been verified for this foundation.
- Install [uv](https://docs.astral.sh/uv/getting-started/installation/), the
  repository's Python environment and dependency manager. Verification uses
  uv 0.13.8.

Install uv once using the appropriate command, then restart your terminal so
`uv` is on PATH:

Windows PowerShell:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

macOS/Linux:

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Install dependencies

From the repository root, run these commands on either platform:

```text
cd backend
uv python install 3.12
uv sync --frozen --all-groups
```

uv creates a local `.venv` and installs the exact versions in `uv.lock`.
Each developer creates their own environment. Commit `pyproject.toml`,
`.python-version`, and `uv.lock`; do not commit `.venv` or tool caches, which
are already ignored by the repository. No manual activation is needed with
`uv run`. In VS Code, select `backend/.venv/Scripts/python.exe` on Windows or
`backend/.venv/bin/python` on macOS/Linux as the Python interpreter.

Runtime dependencies include FastAPI (HTTP framework), Pydantic (typed response
schemas/settings), Uvicorn (application server), SQLAlchemy 2.x (synchronous
database sessions), psycopg with its binary extra (PostgreSQL driver), and
Alembic (schema migrations). The development
group provides Ruff (format/lint), mypy (type checking), and pytest. Authlib,
joserfc, and synchronous HTTPX are runtime auth dependencies; HTTPX also supports
the FastAPI test client. Milestone 5 needs no additional dependencies.

## Start the development server

Run from the backend directory:

```text
uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/docs> for FastAPI's interactive documentation or
<http://127.0.0.1:8000/openapi.json> for the generated API schema. The root
path `/` has no route and returns 404. Stop the
server with Ctrl+C. Reload mode is for local development.

## Google authentication

If auth returns 503 AUTH_NOT_CONFIGURED while /health works, privately check the
actual environment file and restart with the documented --env-file command.
Creating .env from the example does not supply database or Google credentials;
do not overwrite an existing real file or paste values into chat. Named files
such as backend.env must be passed explicitly instead of assuming ../.env loads
them. The [AUTH guide](../docs/AUTH.md) documents the exact configuration contract.

Google OAuth development preparation is documented in the
[local OAuth runbook](../docs/runbooks/google-oauth-local.md).
PR #9 Milestone 2 added configuration placeholders and setup instructions.
Milestone 3 implements synchronous `GET /auth/google/start` using Authlib 1.9.9
and bounded Google discovery through runtime HTTPX. It returns an authorization
redirect with state, nonce, and PKCE S256 after storing a pending attempt in
server memory. Missing/invalid auth settings return a safe 503; health remains
independent. Milestone 4 implements `GET /auth/google/callback`: single-use
browser/state validation, bounded code exchange, trusted-key ID-token verification,
verified-email policy, and atomic PostgreSQL user upsert. Milestone 5 extends the
transaction with session issuance and prior-browser-session revocation, then
sets cookies after commit and redirects to the configured frontend origin root.
Use the [session runbook](../docs/runbooks/application-sessions.md) for revision
`0002`, current-user lookup, expiration, CSRF, logout, and security limits.
The callback is `/auth/google/callback`, browser-facing at
`http://127.0.0.1:5173/auth/google/callback` through Vite's Milestone 6 auth proxy to
FastAPI at `http://127.0.0.1:8000`. Keep that exact registered callback.
Existing health-only
startup still needs no Google credentials. With auth settings loaded, direct
requests to `http://127.0.0.1:8000/auth/google/start` can initiate authorization,
and return through the configured Vite origin. React confirms the session using
`/api/auth/me`. The human subsequently reported successful local Google sign-in
and logout on 2026-11-19; remaining detailed checks are in the manual record.
Pending OAuth attempts expire after ten minutes, are limited to 256 per process,
and are lost on restart. Application sessions are persisted independently in
PostgreSQL, with seven-day absolute and 24-hour idle expiry. Login throttling
and shared OAuth flow storage remain later work. Revision `0001` already has
the user identity constraint; new revision `0002` adds application sessions.
Apply migrations before callback persistence. Never look up
or merge users by email. No Google access/refresh token is retained.
Tests use synthetic credentials and mocked HTTP, never your `.env`:

```text
uv run --locked pytest tests/test_oauth_config.py tests/test_oauth_login.py tests/test_oauth_flow.py
uv run --locked pytest tests/test_google_identity.py tests/test_oauth_callback.py
uv run --locked pytest tests/test_session_security.py tests/test_session_api.py
```

The existing opt-in PostgreSQL suite also includes
`tests/integration/test_google_users.py`, covering independent committed reads,
profile updates, equal-email/different-subject separation, concurrent first
logins, and rollback. Follow the isolated test configuration below; ordinary
CI uses fakes for all Google calls. Callback queries are stripped from the ASGI
scope used by Uvicorn access logging; any future proxy must redact them too.

## Trip metadata API — CRUD Milestones 1–2

The `feat/trip-crud-api` branch implements authenticated `POST /api/v1/trips`,
`GET /api/v1/trips`, `GET /api/v1/trips/{trip_id}`, and version-checked PATCH.
Creation uses the verified
session user as owner and enforces existing CSRF/origin checks; reads are
owner-filtered. Missing and other-owner records return the same 404. List uses
bounded cursor pagination. PATCH reuses CSRF, requires `base_version`, merges
explicit fields and validates the result under an owned-row lock; stale writes
return 409. Trips with day records allow title-only updates. DELETE and frontend
save integration are not implemented yet. No schema migration or new environment
variable is introduced.

See the [trip contract and safe manual/test workflow](../docs/trip-api.md) and
[ADR 0009](../docs/adr/0009-trip-crud-api.md). The API requires destination
timezone, although the current frontend draft does not supply one yet. It stores
metadata only and makes no Google/provider calls. Existing schema revision 0002
and a valid Roam session are required. Successful writes return only after commit.

## Health endpoint

Open <http://127.0.0.1:8000/health> or request it from another terminal:

```text
curl.exe -i http://127.0.0.1:8000/health
```

On macOS/Linux, use `curl -i` instead of `curl.exe -i`.
Expect HTTP **200**, content type `application/json`, and this response body:

```json
{"status":"ok"}
```

This unauthenticated liveness check only confirms that the application can
handle a request. It performs no database or provider calls and makes no
readiness claim. Separate `/health/live` and `/health/ready` routes remain
future design options; neither is implemented in this PR.

## Checks

### Database foundation — PR #7, Milestone 1

The connection/session foundation and Milestone 2's four ORM models and initial
Alembic migration exist. Authentication/session APIs now use PostgreSQL;
trip business endpoints remain planned. Revision `0002` adds login sessions.
`/health` stays independent of database configuration and availability.

Start the existing database using the [PostgreSQL runbook](../docs/runbooks/local-postgres.md).
In your ignored root `.env`, add `DATABASE_URL` using the format documented in
[`.env.example`](../.env.example). Use `127.0.0.1` and the published host port
(5432 by default, 55432 on the verified workstation). The name `db` is for
clients sharing the Compose network, not a backend running on the host.
URL-encode reserved characters in credentials. Do not print or commit the URL.
Restart the backend after changing the URL: its engine is cached per process.

Load the file explicitly when a database command needs it:

```sh
uv run --env-file ../.env --locked <command>
```

The settings model reads environment variables, not `.env` automatically.
It rejects invalid/unsupported URLs, missing credentials, and query parameters
that override the URL's connection identity. Non-local hosts require
`sslmode=verify-full`; certificate options such as `sslrootcert` remain available.
This validation supports a future verified-TLS deployment but is not evidence
of a tested cloud connection. Production still needs restricted application
roles, appropriate certificates, secret storage, backups, and deployment verification.

[`get_db_session`](app/db/session.py) is a synchronous FastAPI dependency. It
yields one session and always closes it, rolling back uncommitted work. A future
service must commit deliberately or use `with session.begin():`; dependency
cleanup never commits. The engine is created lazily once per process, with
thread-safe initialization and a maximum of five pooled connections/no overflow.
Initial limits are five seconds for connection/pool waits, ten seconds for SQL
statements, and three seconds for lock waits. Tune these from measurements before
production workloads or long migrations; do not add more pools speculatively.
Shutdown disposes an existing pool in a threadpool without forcing a connection
on startup or blocking the application event loop. SQL echo is off, parameters
are hidden in SQLAlchemy errors, and configuration errors omit input values.

Ordinary `uv run --locked pytest` runs the database-free tests and explicitly
skips PostgreSQL tests. To opt in, set a separate `TEST_DATABASE_ADMIN_URL` in
your local `.env`. It must target the local **postgres maintenance database**,
not `roam_dev`, and the role must be able to create databases. Do not use
production credentials. Then run:

```sh
uv run --env-file ../.env --locked pytest --run-db-tests
```

The fixture creates a UUID-named `roam_test_...` database, runs tests there, and
drops only that registered database afterward. It never falls back to
`DATABASE_URL`, truncates development tables, or removes a Docker volume.
Missing/unsafe admin configuration fails explicitly when the flag is supplied.
Unit tests verify these guards. Transaction tests use a disposable SQL probe
table; application schema tests run the real Alembic migrations. No application
schema is created with `Base.metadata.create_all()`.

Observed on macOS, 2026-11-17: **35 passed / 47 intentionally skipped** without
the flag; **82 passed** with PostgreSQL enabled. One existing Starlette/HTTPX
deprecation warning remains. Windows database testing and hosted database CI
are not yet verified. Milestone 3 configures the existing backend CI job to run
these tests using its own disposable PostgreSQL service; a hosted run still
needs to pass before merge. See the [CI guide](../docs/CI.md).

### Models and migrations — PR #7, Milestone 2

`app/db/models/` maps users → owned trips → trip days → activities. Database
constraints enforce foreign keys, unique identities/days, bounded dates/party
sizes, nonnegative money, and valid intervals. Read [ADR 0001](../docs/adr/0001-database-foundation.md)
for exact fields, JSON limits, and deferred application validation. Trip CRUD
Milestones 1–2 now add metadata create/read/PATCH and version enforcement as
described above. Provider records and activity mutation/lock endpoints remain
planned. Google verification and application sessions are implemented.

From `backend/`, with PostgreSQL running and your ignored `.env` configured:

```sh
uv run --env-file ../.env --locked alembic upgrade head
uv run --env-file ../.env --locked alembic current
uv run --env-file ../.env --locked alembic check
```

These commands target `DATABASE_URL`. Confirm its database name locally before
applying them; do not print its password. `upgrade head` applies pending schema
revisions; `current` reports the applied revision (`0001` initially); `check`
reports model/schema drift supported by Alembic. It does not detect every CHECK
constraint change, so review migrations and retain behavior tests. Migrations
are never run on application startup. The milestone verification migrates only
scratch databases; it does not apply revision 0001 to your development database.

For future schema changes: update the model, generate a new revision against an
up-to-date local development schema, inspect the SQL/constraints and downgrade,
then test it on a fresh disposable database before review:

```sh
uv run --env-file ../.env --locked alembic revision --autogenerate -m "Describe schema change"
```

Format/lint the generated file. Never edit a revision already applied outside
your branch. Add `upgrade` and `downgrade` together, documenting data-loss limits.
The initial downgrade **deletes all application tables and data**. Do not run it
on your regular database to test migrations. The safe rehearsal is:

```sh
uv run --env-file ../.env --locked pytest --run-db-tests tests/integration/test_migrations.py
```

That test creates a separate empty UUID-named database, checks upgrade → downgrade
→ upgrade plus metadata agreement, closes connections, and drops only its own
database. Model tests use migrations and an outer rollback-only transaction;
even a test's session commit stays isolated inside a savepoint.

Changing JSON preferences/interests requires assigning a new dict/list rather
than mutating one in place. Audit `updated_at` updates automatically through
SQLAlchemy; direct SQL must set it explicitly. Money uses integer minor units
per person in the trip currency (`NULL` unknown; zero known free).

Troubleshooting: missing `DATABASE_URL` fails before a connection; use explicit
`--env-file`. Connection refused usually means a stopped database or incorrect
host port. Missing tables usually means migrations have not been applied.
An unknown revision means code and schema history disagree: sync the branch and
inspect `alembic current`/`history`; do not delete revisions or use `stamp` to
hide the mismatch. A migration lock/statement timeout requires investigating
the lock/workload, not repeated retries or deleting the database.

### Existing quality gates

Run from the backend directory:

```text
uv lock --check
uv run --locked ruff format --check .
uv run --locked ruff check .
uv run --locked mypy app
```

Run database-free tests (no Uvicorn server is needed; PostgreSQL tests are skipped
unless explicitly enabled as described above):

```text
uv run --locked pytest
```

For a focused, verbose run:

```text
uv run --locked pytest tests/test_health.py -v
```

The three tests use FastAPI's in-process `TestClient` to request the registered
`/health` route and assert HTTP 200, the exact `{"status":"ok"}` body, and the
JSON content type. They require no database, credentials, or external network.
pytest configuration finds tests under `tests/` and adds this directory to its
import path so both `pytest` and `python -m pytest` can import `app`.

Local verification: **3 passed** on Windows with Python 3.12.16. The current
Starlette test client emits one deprecation warning about HTTPX usage. It is
not suppressed; review a compatible test-client dependency update separately.

Format changes with `uv run --locked ruff format .`.

## Complete local database workflow — PR #7, Milestone 3

Each developer keeps their own ignored root `.env`. `DATABASE_URL` targets the
regular development database; `TEST_DATABASE_ADMIN_URL` targets the local
`postgres` maintenance database using a role with CREATEDB. Both use the host's
published port. Tests never fall back from the latter to the former.
See [the example](../.env.example) for placeholder URL formats; URL-encode
reserved characters in credentials. No API key or cloud account is required.

From the repository root, start PostgreSQL and install the locked backend:

```sh
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90 db
cd backend
uv sync --frozen --all-groups
```

After confirming locally that `DATABASE_URL` names your intended development
database, apply the schema and verify its revision:

```sh
uv run --env-file ../.env --locked alembic upgrade head
uv run --env-file ../.env --locked alembic current
uv run --env-file ../.env --locked alembic check
```

The current expected revision is `0002 (head)` and no new upgrade operations. These
commands finish and return to the prompt. The first upgrade creates application
tables; it does not insert users, trips, or activities. For a safe test of actual
database operations, run:

```sh
uv run --locked pytest
uv run --env-file ../.env --locked pytest --run-db-tests -m database
```

The first command intentionally skips database tests; the second selects them
and uses disposable databases. To run all tests together, omit `-m database`
from the second command. Missing/invalid test admin configuration is an error,
not a reason to use the development URL or remove safety checks.

To start FastAPI (a long-running command), use a separate terminal:

```sh
uv run --env-file ../.env --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

`GET /health` remains liveness only; use the database tests to verify connectivity
and storage. Stop Uvicorn with Ctrl+C. From the repository root, stop PostgreSQL
with `docker compose stop db`; the named volume retains data. See the
[PostgreSQL runbook](../docs/runbooks/local-postgres.md) for port conflicts,
authentication, persistence verification, and volume precautions.

CI runs the same database tests against an independent disposable service;
see [CI details and local reproduction](../docs/CI.md#postgresql-and-migrations).
Before merging, require the hosted `Backend checks` run to pass and walk through
the schema with your teammate. Deployment still requires verified TLS, separate
runtime/migration privileges, backups/restores, and a controlled release process.

## Source layout

- `app/main.py` creates the single FastAPI application object that Uvicorn imports.
- `app/__init__.py` marks the application as a Python package.
- `app/api/health.py` defines the health router, registered in `app/main.py`.
- `app/schemas/health.py` defines the Pydantic response with status restricted to `ok`.
- `pyproject.toml` declares dependencies and development-tool settings.
- `uv.lock` records exact dependency versions for reproducible installs.
- `tests/test_health.py` checks the health endpoint's HTTP response contract.

HTTP routers and response schemas live in `app/api/` and `app/schemas/`.
Add other architecture layers only when
a feature needs them. Run commands from this directory so `app.main` imports
consistently; a build system or `PYTHONPATH` shell changes are unnecessary.

## Troubleshooting

- **`uv` not found:** restart the terminal after installation and check the
  PATH instructions printed by the installer. If uv is already installed on
  Windows, close all VS Code windows and reopen VS Code to refresh its PATH.
  You can also use the executable directly, for example:

  ```powershell
  & "$env:USERPROFILE\.local\bin\uv.exe" run --locked pytest
  ```

  Run that command from `backend`. If the executable is missing, install uv first.
- **Missing Python 3.12:** run `uv python install 3.12` before syncing.
- **Port 8000 already in use:** stop the other process or use `--port 8001`.
- **Cannot import `app`:** check that the current directory is `backend`.
- **Lockfile mismatch:** review the dependency change, run `uv lock`, then
  `uv sync --frozen --all-groups`, and commit both dependency files together.
  Routine startup/check commands use `--locked` to prevent silent lock changes.
