# Roam backend

PR #3, Milestone 1 provides the Python environment and a minimal FastAPI app.
The health endpoint is planned for Milestone 2; endpoint tests are planned for
Milestone 3. No database, credentials, environment variables, or other services
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
schemas in Milestone 2), and Uvicorn (application server). The development
group provides Ruff (format/lint), mypy (type checking), pytest, and HTTPX
(FastAPI test-client support in Milestone 3).

## Start the development server

Run from the backend directory:

```text
uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000/docs> for FastAPI's interactive documentation or
<http://127.0.0.1:8000/openapi.json> for the generated API schema. No custom
routes exist yet; `/` and `/health` return 404 at this milestone. Stop the
server with Ctrl+C. Reload mode is for local development.

## Checks

Run from the backend directory:

```text
uv lock --check
uv run --locked ruff format --check .
uv run --locked ruff check .
uv run --locked mypy app
```

Automated endpoint tests will be added in Milestone 3. Once they exist, run:

```text
uv run --locked pytest
```

At Milestone 1 there are no tests; pytest reporting no tests collected is not
a passing test suite. Format changes with `uv run --locked ruff format .`.

## Structure

- `app/main.py` creates the single FastAPI application object that Uvicorn imports.
- `app/__init__.py` marks the application as a Python package.
- `pyproject.toml` declares dependencies and development-tool settings.
- `uv.lock` records exact dependency versions for reproducible installs.

HTTP routers and response schemas will go in `app/api/` and `app/schemas/`
when the health endpoint is added. Add other architecture layers only when
a feature needs them. Run commands from this directory so `app.main` imports
consistently; a build system or `PYTHONPATH` shell changes are unnecessary.

## Troubleshooting

- **`uv` not found:** restart the terminal after installation and check the
  PATH instructions printed by the installer.
- **Missing Python 3.12:** run `uv python install 3.12` before syncing.
- **Port 8000 already in use:** stop the other process or use `--port 8001`.
- **Cannot import `app`:** check that the current directory is `backend`.
- **Lockfile mismatch:** review the dependency change, run `uv lock`, then
  `uv sync --frozen --all-groups`, and commit both dependency files together.
  Routine startup/check commands use `--locked` to prevent silent lock changes.
