# Local authentication manual verification

Date prepared: 2026-11-18. Last updated: 2026-11-19.
Owner: human developers, assisted by Codex.
**Local sign-in and logout passed according to the human developer.** Remaining
unchecked items require their own observations. Check a box only after observing its result;
record PASS/FAIL/BLOCKED, date, browser and safe error code/request ID. Do not
attach .env, callback URLs, OAuth codes, bearer/CSRF values, Google tokens,
Network exports or unredacted profile screenshots.

## Recorded results — 2026-11-19

The human reported creating the local roam_dev role/database in their PostgreSQL
19 setup on port 5432, completing the migration commands, updating the ignored
environment file, and restarting FastAPI. They then reported successful Google
sign-in and confirmed logout worked as described. These are **human-reported
local results**, not an agent-observed browser run. Browser identity, raw HTTP
responses, cookie inspection and UUID comparisons were not provided.

| Check | Recorded outcome |
|---|---|
| Local database creation and migration commands | PASS, human-reported |
| Live Google sign-in and signed-in UI | PASS, human-reported |
| Logout | PASS, human-reported |
| Refresh/profile response/returning-user UUID comparison | No separate detailed result recorded |
| Two-tab revocation, timed expiry, invalid callback, consent denial | Not separately reported |
| Failure recovery and manual accessibility review | Not separately reported |

The last automated suite used PostgreSQL 17.0, not the user's native PostgreSQL
19 instance. Production HTTPS and hosted Actions have not been verified.

## Setup checkpoint — report this first

Follow [AUTH startup](AUTH.md#start-local-postgresql-backend-and-frontend).
Use one local database server. Run migration commands yourself only after
confirming the intended development DATABASE_URL privately. Keep backend and
frontend in separate terminals. Preserve any existing unsaved form before the
full-page sign-in action.

- [x] Native database running (service status observed by agent; setup reported by human).
- [x] Migration commands completed successfully (human-reported; exact terminal output not supplied).
- [x] FastAPI /health returned 200 during the agent's local preflight.
- [x] Proxied /health returned 200 during the agent's local preflight.
- [x] Google settings passed agent format/callback validation; human subsequently reported live sign-in success.

Stop at the first blocker. Report only database path (Compose/native), migration
revision/status, health HTTP statuses and safe errors. Do not report connection
strings or credential contents. Liveness success alone is not login success.

## First-time Google sign-in

- [ ] Use an intended development Google account not yet present in this local
  Roam database. If it already exists, mark first-time test BLOCKED/not applicable;
  do not delete the account or database to manufacture this test.
- [x] Open http://127.0.0.1:5173/ and complete Google sign-in (human-reported).
- [x] Roam displays the signed-in state after returning (human-reported).
- [ ] Record inspection of the expected Google project identity, only basic
  permissions, and exact configured-root return URL. Do not infer these UI details
  from the general success report.
- [ ] In DevTools Network, filter /api/auth/me: status 200 with only user
  id/email/display_name. Inspect locally; report status/shape, not private values.
- [ ] Inspect cookie attributes locally: flow cookie cleared; roam_session is
  HttpOnly, host-only, Path=/, Lax; roam_csrf is intentionally readable. Local HTTP
  does not use Secure; deployment HTTPS requires Secure/__Host- names. Do not copy
  cookie values. This localhost test does not prove production cookie enforcement.

## Refresh and returning user

- [ ] Refresh the page: /me 200 recovers the profile without another Google flow.
- [ ] Note the user UUID privately, sign out, then sign in with the same Google
  account again. /me 200 has the same UUID; only report "same UUID: yes/no".
  Google may skip an already-granted consent screen. A fresh Roam session is
  issued; no duplicate user is inferred from changed email/name.

## Logout and invalidation

- [x] Click Sign out and confirm logout works (human-reported after the guided logout check).
- [ ] Separately record POST /api/auth/logout 204, cleared session/CSRF cookies,
  and a fresh same-origin /api/auth/me 401; raw status/cookie observations were not supplied.
- [ ] Log in again, open two tabs. Log out in tab A, then focus tab B: its next
  /me returns 401 and the old profile is removed. This checks shared-browser
  invalidation without copying bearer tokens. Separate browser sessions are not
  expected to be logged out together.
- [ ] Optional idle expiry: sign in, close all Roam tabs and make no authenticated
  requests for more than 24 hours, then revisit. Expect /me 401. Opening/focusing
  tabs or checking /me refreshes activity, so do not poll during the wait. Do not
  change clocks, weaken TTLs, edit session rows or erase user data for this test.
  Deterministic automated tests separately cover exact idle/absolute boundaries.

## Invalid callback and consent denial

- [ ] While signed out, open
  http://127.0.0.1:5173/auth/google/callback?state=manual-invalid&code=manual-invalid.
  Expect 400 OAUTH_CALLBACK_INVALID JSON and no session issued. Return to app root.
  These strings are fabricated, not a captured Google callback.
- [ ] Start a fresh Google login and select Cancel/Deny if Google offers it. Expect
  safe OAUTH_CONSENT_DENIED JSON after a provider denial callback and no sign-in.
  Return to root to retry. If Google skips consent, mark BLOCKED/not offered;
  do not broaden scopes, change the app protocol or revoke unrelated app access
  just to force this screen. Closing the Google tab is an abandoned attempt,
  not proof that a denial callback was handled. Automated denial tests remain available.

## Frontend failure handling

- [ ] After finishing any Google flow, keep Vite running and stop only your local
  FastAPI process with Ctrl+C. Click Check session if signed in, or reload the
  app. Expect an accessible auth error/retry, not invented login/logout success.
- [ ] Restart FastAPI with the documented environment-file command. Click Retry
  sign-in check. Confirm real /me determines the recovered state; a persisted
  valid session can recover without Google, an ended session requires sign-in.
- [ ] Keyboard-accessible buttons, visible focus, status/alert announcements and
  recoverable text are usable. Record browser/screen-reader observations if tested.

## Report template

```text
Database: Compose / native; running: yes/no
Migration: 0002 / blocked (safe reason)
Backend /health: HTTP ...; proxied /health: HTTP ...
First-time sign-in: PASS/FAIL/BLOCKED
Returning sign-in: PASS/FAIL/BLOCKED; same UUID: yes/no/not tested
Refresh and /me profile shape: PASS/FAIL/BLOCKED
Logout and /me 401: PASS/FAIL/BLOCKED
Two-tab invalidation: PASS/FAIL/BLOCKED
Optional idle expiry: PASS/FAIL/PENDING
Invalid callback: PASS/FAIL/BLOCKED
Consent denial: PASS/FAIL/BLOCKED (offered/not offered)
Frontend error/recovery/accessibility: PASS/FAIL/BLOCKED
Safe error code/request ID, if any: ...
```

Do not mark live testing complete from automated results. Record human-reported
observations separately from agent-observed evidence. Final review and fixes are
recorded in [the PR review](pr9-final-review.md); no commit/push/PR is implied.
