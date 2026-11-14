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

Runtime dependencies are FastAPI (HTTP framework), Pydantic (typed response
schemas), and Uvicorn (application server). The development
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

Run from the backend directory:

```text
uv lock --check
uv run --locked ruff format --check .
uv run --locked ruff check .
uv run --locked mypy app
```

Run all automated tests (no Uvicorn server needs to be running):

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
