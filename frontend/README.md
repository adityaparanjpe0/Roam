# Roam frontend

React + TypeScript + Vite frontend for Roam. The current page introduces the planned travel planner; its itinerary preview is a static concept, not a generated or interactive itinerary.

The development build includes a backend connection check using the existing FastAPI `/health` endpoint. Authentication, AI planning, maps, persistence, and PDF export are not implemented. No database, Docker, environment file, or provider keys are needed for this connection check.

## Prerequisites

- Node **24.22.3**, pinned in [`.nvmrc`](../.nvmrc).
- npm (verification used **11.5.1**).

Use one of the setup paths below. Commands start from the repository root.

### With the pinned Node version already installed

```bash
node --version
cd frontend
npm ci
npm run dev
```

Check that the first command reports `v24.22.3`.

### With nvm already installed

```bash
nvm install
nvm use
cd frontend
npm ci
npm run dev
```

If `nvm` reports `command not found`, use the alternative below. nvm is optional and is not installed by this repository.

### Without nvm

If `node` and `npm` are already available, npm can download and run the pinned Node version from its cache without replacing the global installation:

```bash
cd frontend
npm exec --yes --package=node@24.22.3 -- node --version
npm exec --yes --package=node@24.22.3 -- npm ci
npm exec --yes --package=node@24.22.3 -- npm run dev
```

This path requires registry access on the first download. Use the same `npm exec --yes --package=node@24.22.3 --` prefix for the checks below if your global Node version differs.

## Development and verification

Open **http://127.0.0.1:5173/**. Vite binds to this loopback address and uses `strictPort`: it exits if 5173 is occupied rather than silently choosing another port. Save a source file to update the running page. Stop the server with **Control+C**.

### Run the frontend and backend together

Complete the [backend prerequisites and locked dependency setup](../backend/README.md) once. Then use two terminals:

Terminal 1, from the repository root:

```sh
cd backend
uv run --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2, from the repository root, using the pinned Node version:

```sh
cd frontend
npm run dev
```

Without nvm, replace the last command with:

```sh
npm exec --yes --package=node@24.22.3 -- npm run dev
```

**Development servers intentionally keep running.** Once each prints its local
URL/startup message, open the browser; do not wait for the terminal command to
finish. Tests and builds exit on completion. Stop each development server with
Control+C when finished. PostgreSQL does not need to be started for this workflow.

Near the footer, the development-only **Backend connection** panel checks on
mount. It shows loading, connected, or a recoverable error. A request has a
five-second frontend deadline; **Check again** / **Retry connection** starts a
new check. The button is disabled while checking. There is no polling.

### HTTP flow and manual verification

```text
Browser at 127.0.0.1:5173
  GET /health → Vite proxy → FastAPI at 127.0.0.1:8000/health
  ← HTTP 200, application/json, {"status":"ok"}
```

The client uses native `fetch('/health')` with no cached response, checks HTTP
status and JSON content type, and validates the parsed shape at runtime. The
proxy preserves `/health`; it does not prepend `/api/v1` or invent a new route.
The browser makes a same-origin request, so no FastAPI CORS middleware or browser
API-base environment variable is needed. The root `.env` is for local PostgreSQL
and must not be copied into browser configuration.

Verify the complete flow:

1. Start both servers and open the frontend. Expect **Backend connected.**
2. In browser Network tools, find `GET http://127.0.0.1:5173/health`; verify
   HTTP 200 and `{"status":"ok"}`. Opening the UI alone does not prove proxying.
3. Stop FastAPI only. Click **Check again** and expect an error with an enabled
   retry button, not a stale success. A proxy-generated HTTP error (for example
   502) is expected when the backend is unavailable; it is not necessarily a CORS problem.
4. Restart FastAPI and click **Retry connection**. Expect connected again without
   reloading the page.

Strict Mode may start and cancel an extra initial check in development. Cleanup
aborts obsolete requests and ignores late results; leave Strict Mode enabled.
Malformed JSON, wrong response shapes, network/stream errors, HTTP errors,
timeout, and cancellation behavior are covered by mocked frontend tests.

**Scope:** connected means FastAPI liveness only, not database/provider readiness
or application security. The diagnostic is excluded from production rendering
and issues no production health requests. `npm run preview` serves the production
build, so the diagnostic is absent there. Vite proxying is development plumbing,
not an implementation of the planned production FastAPI/static-assets deployment.

If port 5173 is occupied, stop only the known server using it or explicitly choose
another Vite port. If FastAPI uses a different port, update the development proxy
target in [vite.config.ts](vite.config.ts) to match. This target is currently
`http://127.0.0.1:8000`; changing an unrelated `.env` setting will not change it.

Run these commands from this directory using the pinned Node version:

| Command | Purpose |
|---|---|
| `npm ci` | Install exactly the dependency tree recorded in the lockfile. |
| `npm run dev` | Start the development server with live updates. |
| `npm run lint` | Check TypeScript/React code with ESLint. |
| `npm run typecheck` | Check both TypeScript projects in strict mode without emitting JavaScript. |
| `npm run test` | Run Vitest in watch mode for local development. |
| `npm run test -- --run` | Run the test suite once and exit. |
| `npm run build` | Typecheck and build production assets into `dist/`. |
| `npm run preview` | Serve the existing production build locally; run the build first. |

The preview command prints its own URL, normally `http://localhost:4173/`. It is a local build check, not the planned production hosting setup.

For example, without nvm:

```bash
npm exec --yes --package=node@24.22.3 -- npm run lint
npm exec --yes --package=node@24.22.3 -- npm run typecheck
npm exec --yes --package=node@24.22.3 -- npm run test -- --run
npm exec --yes --package=node@24.22.3 -- npm run build
```

## Source structure

| Location | Responsibility |
|---|---|
| [`src/main.tsx`](src/main.tsx) | Mount React and import shared styles. |
| [`src/App.tsx`](src/App.tsx) | Compose the skip link, header, landing page, and footer. |
| [`src/components/`](src/components/) | Reusable header/footer components. |
| [`src/api/health.ts`](src/api/health.ts) | Relative health request, runtime validation, typed safe errors, and cancellation support. |
| [`src/features/connection/`](src/features/connection/) | Development-only status UI, bounded requests, retry, cleanup, and UI tests. |
| [`src/routes/`](src/routes/) | Landing-page content and its responsive CSS. |
| [`src/styles/tokens.css`](src/styles/tokens.css) | Shared colors, typography, spacing, and radii. |
| [`src/styles/global.css`](src/styles/global.css) | Base styles, site framing, and keyboard focus indicators. |
| [`src/App.test.tsx`](src/App.test.tsx) | Tests for landmarks, navigation targets, and truthful feature-status messaging. |
| [`src/test/setup.ts`](src/test/setup.ts) | DOM matchers and cleanup between tests. |
| [`vitest.config.ts`](vitest.config.ts) | Reuse Vite configuration and select jsdom as the test environment. |

Tests use Vitest, Testing Library, jest-dom, and jsdom. Health-client tests stub
`fetch`; UI tests mock the client and use fake timers for deadlines. They require
no live backend or database. jsdom does not verify actual layout or proxy routing;
check those in a browser as well.

Verification on 2026-11-15: lint, strict typecheck, **32 tests**, and production
build passed with Node 24.22.3. A real Chrome run (no request mocks) verified
connected → backend stopped/error → restarted/retry/connected through Vite.
See [project memory](../docs/memory.md) for exact results and limitations.

## UI review checklist

### Core trip form — PR #8 Milestone 3

Run `npm run dev` from `frontend/` with the pinned Node version, then open
`http://127.0.0.1:5173/#create-trip`, or follow **Enter trip details** on the
landing page. FastAPI is not required for the form; the independent development
health diagnostic may report an error if it is stopped.

The [form](src/features/trip/TripCreationForm.tsx) receives editable values and
an update callback from [local React state](src/features/trip/TripCreation.tsx).
Destination, start/end dates, travelers, and total per-person USD budget are
controlled and start blank. Numeric editing values stay strings. The
[draft type](src/features/trip/tripCreationModels.ts) is a future normalization
target; this milestone does not produce or submit one.

Manual checks:

1. Enter and clear all five fields; editing one must preserve the others.
2. Enter zero and a decimal budget. The budget is for the entire trip per person,
   not per day or for the group. Placeholder examples must not be initial values.
3. Use labels and Tab/Shift+Tab to reach inputs; native date controls can contain
   multiple internal tab stops. Verify focus indicators remain visible.
4. Check widths of 320, 375, 768, 1024, and 1440 pixels, plus zoom/enlarged text.
   Inputs should stack on mobile, pair on desktop, and stay within the page.
5. Refresh: values reset. Confirm existing navigation, preview, and footer work.

There is no submit/review action yet. Native input hints are provided, but
automatic submit validation is disabled. Full validation is reserved for Milestone
5; interests, optional constraints, review, and backend integration remain planned.
No routing dependency, API call, or persistence was added for the form.

### Existing landing page

- Check widths of 320, 375, 768, 1024, and 1440 pixels for clipping or horizontal overflow.
- Use Tab from page load: the skip link should become visible. Enter should focus the main content; the next Tab should reach the primary CTA.
- Verify the CTA reaches planned features and the footer link returns to the top.
- Verify the CTA darkens on hover and keyboard focus stays visible.
- Check reflow with enlarged text and review the single-column mobile layout.
- Preserve the development notice and the illustrative-preview caption.
- Use shared tokens, clear headings, spacing, and purposeful feedback. Avoid decorative badges, redundant labels, arbitrary italics, or controls for unavailable features.

No browser automation package is installed in the project. Earlier Chrome layout/keyboard checks used temporary Playwright tooling; screen-reader and cross-browser testing remain unverified.

## Known limitations

The dependency audit on 2026-11-12 reported **10 moderate findings** associated with `minimatch` in the development lint toolchain. `npm audit --omit=dev` reported **0 vulnerabilities**. These results are dated observations, not guarantees; rerun the audit when dependencies change. No forced major override or lint-stack downgrade was applied.

React Router and TanStack Query are deferred until there are multiple routes and
server-state features to support. Native fetch is intentionally sufficient for
this one diagnostic GET. Only `/health` is currently proxied; `/api` and `/auth`
are not configured yet. Production backend serving configuration remains planned
in the [technical design](../docs/DESIGN.md).

See [project memory](../docs/memory.md) for branch evidence, verification limits, and merge/review status.
