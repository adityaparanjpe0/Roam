# Roam frontend

React + TypeScript + Vite frontend for Roam. The current page introduces the planned travel planner; its itinerary preview is a static concept, not a generated or interactive itinerary.

The development build includes a backend connection check using FastAPI `/health`.
PR #9 Milestone 6 adds cookie-based account controls, current-user checks,
backend-managed Google login navigation, and CSRF-protected logout. AI planning,
maps, trip persistence, and PDF export remain unimplemented. The health check
still needs no database/credentials; actual authentication requires the migrated
backend and locally configured Google credentials. An unavailable backend shows
a recoverable auth error while the local trip form remains usable.

## Prerequisites

- Node **24.22.3**, pinned in [`.nvmrc`](../.nvmrc).
- npm (current authentication verification used **11.19.1**).

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

Use [AUTH](../docs/AUTH.md) for the implemented OAuth/session architecture and
three-process local startup, plus the [manual end-to-end checklist](../docs/auth-manual-checklist.md)
for first/returning login, refresh, profile, logout, denial and recovery. Manual
results remain pending; passing synthetic tests are not proof of live Google login.

For Google OAuth preparation, follow the
[local OAuth runbook](../docs/runbooks/google-oauth-local.md).
Keep OAuth credentials in the ignored root `.env`, never in frontend variables.
The agreed browser-facing callback uses `http://127.0.0.1:5173/auth/google/callback`;
the callback is implemented and Vite now proxies `/auth` and `/api`. Read the
[frontend auth guide](../docs/frontend-auth.md) for states, CSRF, recovery, and
the remaining live-verification limits. Do not enable DEBUG while running this
auth proxy: startup rejects verbose callback-URL logging.

Open **http://127.0.0.1:5173/**. Vite binds to this loopback address and uses `strictPort`: it exits if 5173 is occupied rather than silently choosing another port. Save a source file to update the running page. Stop the server with **Control+C**.

### Run the frontend and backend together

Complete the [backend prerequisites and locked dependency setup](../backend/README.md) once. Then use two terminals:

Terminal 1, from the repository root:

```sh
cd backend
uv run --env-file ../.env --locked uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
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
Control+C when finished. Health-only diagnostics need no PostgreSQL; actual
account/session checks require PostgreSQL migrated through revision `0002`.
Preserve your ignored `.env`. For health-only startup without a local environment
file, omit `--env-file ../.env`.

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
and backend Google/session settings; it must not be copied into browser configuration.

Authentication uses full-page `/auth/google/start` navigation, `GET /api/auth/me`,
and `POST /api/auth/logout`, all through the same Vite origin. Requests explicitly
use same-origin cookies. A validated profile is the only sign-in evidence;
errors never imply successful login/logout. Logout reads only the CSRF delivery
cookie and echoes it in `X-CSRF-Token`. No bearer/Google token is read or stored
in localStorage. Public trip editing/review remains local and unsaved. Sign-in
warns that navigation clears unsaved details; logout/session refresh does not
remount the form.

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

## Trip form automated tests — PR #8 Milestone 7

The existing Vitest + React Testing Library + jest-dom setup runs in jsdom with
automatic cleanup. No dependency, test configuration, or CI workflow change was
needed for the trip form. Tests use role/label queries and explicit assertions,
not snapshots. Test data is synthetic; provider/backend calls are not required.
The existing health tests mock network/client boundaries, and the production
app-flow test asserts no requests or browser-storage writes during review/edit.

Run from `frontend/` with the pinned Node version:

```sh
# Full frontend suite, once and then exit (also used by CI)
npm run test -- --run

# Focused validator and form/review tests
npm run test -- --run src/features/trip/tripValidation.test.ts src/features/trip/TripCreation.test.tsx

npm run lint
npm run typecheck
npm run build
```

| Coverage | Location |
|---|---|
| Empty/whitespace destination; missing, impossible, and reversed dates; inclusive trip length and leap years | [Validator tests](src/features/trip/tripValidation.test.ts) |
| Invalid traveler/budget syntax, bounds, fractions, zero/negative/nonfinite values, and exact USD cents | [Validator tests](src/features/trip/tripValidation.test.ts) |
| Required/duplicate/unsupported interests, text limits, valid complete draft, normalization without mutation | [Validator tests](src/features/trip/tripValidation.test.ts) |
| Accessible labels, controlled input updates, interest selection/deselection, associated errors, first-invalid focus | [Form tests](src/features/trip/TripCreation.test.tsx) |
| No callback/review for invalid fields; exact normalized callback payloads; review summary; lossless return to edit | [Form tests](src/features/trip/TripCreation.test.tsx) |
| Landing navigation preserved, production review/edit without requests or browser-storage writes | [App tests](src/App.test.tsx) |

Milestone 7 verification: **141 tests across 5 files** passed, including **76
validator cases** and **31 form/component cases**, plus 34 app/health cases.
Lint, strict typecheck, and production build passed. These checks used existing
Node **24.11.1** / npm **11.6.2**; required Node **24.22.3** verification remains
outstanding. No dependency install or hosted CI run is claimed.

Limits: fireEvent/jsdom verifies DOM/state behavior but not actual keyboard
activation, native date-picker interactions, visual layout, zoom, screen-reader
announcements, or cross-browser rendering. Earlier manual browser evidence is in
[memory](../docs/memory.md); there is no committed real-browser end-to-end suite.
Async backend pending/error/retry behavior and server validation/auth are still
future PR #11 work and are not tested as implemented features.

## UI review checklist

The [trip form guide](../docs/trip-creation-form.md) documents every field, the
normalized `TripDraft` contract/example, validation decisions, PR #11 integration
boundary, and the detailed accessibility review. Milestone 8 checks passed **142
tests in 5 files**, lint, strict typecheck, and production build using existing
Node 24.11.1/npm 11.6.2; pinned Node 24.22.3 verification remains outstanding.
There is no network operation or loading state in the form/review flow.

Browser checks covered five standard widths, keyboard traversal/Space/Enter,
focus transitions, a 4,000-character review note, and selected text contrast
ratios. Doubling root text size at 320px no longer overflows the form/review cards,
but the preserved landing header/hero still causes page-level overflow in that
probe. Actual browser zoom, screen-reader announcements, OS high contrast, and
cross-browser/native-picker behavior remain unverified; this is not a claim of
full accessibility conformance.

### Trip form — PR #8 Milestones 3–8

Run `npm run dev` from `frontend/` with the pinned Node version, then open
`http://127.0.0.1:5173/#create-trip`, or follow **Enter trip details** on the
landing page. FastAPI is not required for the form; the independent development
health diagnostic may report an error if it is stopped.

The [form](src/features/trip/TripCreationForm.tsx) receives editable values and
an update callback from [local React state](src/features/trip/TripCreation.tsx).
Destination, start/end dates, travelers, and total per-person USD budget are
controlled and start blank. Numeric editing values stay strings. Eight interest
checkboxes support independent selection/deselection, and an optional multiline
preferences/constraints field starts empty. The
[draft type](src/features/trip/tripCreationModels.ts) is produced only by successful
[client validation](src/features/trip/tripValidation.ts). Successful submission
opens [local review](src/features/trip/TripReview.tsx); invalid input stays on the
form with field errors. The container exposes an optional typed
`onDraftSubmit(draft)` callback for a future parent. No callback is supplied by
the landing page, and no draft is sent to a backend.

Manual checks:

1. Enter and clear all five fields; editing one must preserve the others.
2. Enter zero and a decimal budget. Checking zero must show a budget error; a
   positive amount with up to two decimal places is allowed. The budget is for
   the entire trip per person, not per day or for the group. Placeholder examples
   must not be initial values.
3. Use labels and Tab/Shift+Tab to reach inputs; native date controls can contain
   multiple internal tab stops. Verify focus indicators remain visible.
4. Check widths of 320, 375, 768, 1024, and 1440 pixels, plus zoom/enlarged text.
   Inputs should stack on mobile, pair on desktop, and stay within the page.
5. Refresh: values reset. Confirm existing navigation, preview, and footer work.
6. Select several interests, then deselect one. Others must stay selected and all
   previously entered fields must remain unchanged. Use Tab/Shift+Tab to move
   between checkboxes and Space to toggle; the visible checkmark indicates state.
7. Enter multiple lines of preferences, then change interests and core fields.
   Text/newlines and selections must survive those edits. Clear the optional text
   field; it remains valid because preferences are optional.
8. Click **Review trip details** on an empty form: expect field errors, an alert,
   and focus on Destination. Correct it and check again: focus should reach the
   first remaining invalid input. After the first check, errors update as you edit.
9. Review a valid example: Lisbon, March 27–30 2027, 2 travelers, $750.50, Food.
   Expect a summary of every field and an explicit **Your trip has not been saved**
   notice. The heading should receive focus. The validator's draft has
   `budgetPerPersonMinor: 75050`; review displays $750.50 for the entire trip.
10. Choose **Edit details**: expect focus on Destination and every original input
    restored, including surrounding spaces and multiline preferences. Change the
    destination and review again: the summary must update. Change budget to zero
    or reverse the dates and submit: errors must keep you on the form.
11. Review with no preferences: expect **No additional preferences provided.**
    Refreshing either screen must return to an empty form; there is no storage.

Review and editing use local React state only; backend integration remains
planned. The callback is a synchronous normalized-data handoff, not a save result.
PR #11 must add request mapping, pending/error behavior, and canonical server
results, including unresolved title/timezone handling. Dates must be real calendar
dates and span 1–14 inclusive days; travelers
must be whole numbers from 1–20. Budget must be positive, at most $1,000,000 and
have no more than two decimal places. Exponents, hex, nonfinite numbers, trailing
junk, and excess precision are rejected rather than rounded. At least one unique
supported interest is required. Destination is capped at 200 UTF-16 code units;
optional preferences at 4,000, matching native maxlength behavior. Draft
normalization trims surrounding text/numeric whitespace and converts whitespace-only
preferences to null; the entered values are not rewritten. See
[ADR 0002](../docs/adr/0002-trip-form-validation.md) for policy and server responsibilities.
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
