# Roam backend

PR #3, Milestones 1 through 3 provide the Python environment, a minimal FastAPI
app, a health endpoint, and automated endpoint tests.
No database, credentials, environment variables, or other services
are required to start this backend.

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
group provides Ruff (format/lint), mypy (type checking), pytest, and HTTPX
(FastAPI test-client support).

## Start the development server

Run from the backend directory:

```text
uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/docs> for FastAPI's interactive documentation or
<http://127.0.0.1:8000/openapi.json> for the generated API schema. The root
path `/` has no route and returns 404. Stop the
server with Ctrl+C. Reload mode is for local development.

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
Alembic migration exist. No business endpoint queries PostgreSQL.
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
are not yet verified; the latter is planned for Milestone 3.

### Models and migrations — PR #7, Milestone 2

`app/db/models/` maps users → owned trips → trip days → activities. Database
constraints enforce foreign keys, unique identities/days, bounded dates/party
sizes, nonnegative money, and valid intervals. Read [ADR 0001](../docs/adr/0001-database-foundation.md)
for exact fields, JSON limits, and deferred application validation. There are no
trip endpoints, authentication, provider records, or lock/version enforcement yet.

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

## Structure

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
