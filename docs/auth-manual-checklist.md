# Local authentication manual verification

Date prepared: 2026-11-18. Owner: human developers, assisted by Codex.
**All live results are pending.** Check a box only after observing its result;
record PASS/FAIL/BLOCKED, date, browser and safe error code/request ID. Do not
attach .env, callback URLs, OAuth codes, bearer/CSRF values, Google tokens,
Network exports or unredacted profile screenshots.

## Setup checkpoint — report this first

Follow [AUTH startup](AUTH.md#start-local-postgresql-backend-and-frontend).
Use one local database server. Run migration commands yourself only after
confirming the intended development DATABASE_URL privately. Keep backend and
frontend in separate terminals. Preserve any existing unsaved form before the
full-page sign-in action.

- [ ] Database running (Compose db healthy, or existing native service Running).
- [ ] `alembic upgrade head` succeeds; `alembic current` reports 0002.
- [ ] FastAPI starts at 127.0.0.1:8000; GET /health returns 200.
- [ ] Vite starts or is already available at 127.0.0.1:5173; proxied /health returns 200.
- [ ] Google Web client configured privately with the exact callback from AUTH.md.

Stop at the first blocker. Report only database path (Compose/native), migration
revision/status, health HTTP statuses and safe errors. Do not report connection
strings or credential contents. Liveness success alone is not login success.

## First-time Google sign-in

- [ ] Use an intended development Google account not yet present in this local
  Roam database. If it already exists, mark first-time test BLOCKED/not applicable;
  do not delete the account or database to manufacture this test.
- [ ] Open http://127.0.0.1:5173/ and click Sign in with Google. Check the expected
  Google app/project identity and only basic identity permissions. Complete sign-in.
- [ ] Browser returns to the app root; checking state settles on the actual user's
  displayed name/email. No claimed success is accepted from a URL flag.
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

- [ ] Click Sign out: POST /api/auth/logout is 204, then signed-out controls appear.
  Session/CSRF cookies clear. A fresh same-origin /api/auth/me navigation returns 401.
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
observations separately from agent-observed evidence. Milestone 10 stays unstarted.
