# React authentication — PR #9 Milestone 6

The header now shows checking, signed-in, signed-out, or recoverable-error state.
The sticky header uses an inline sign-in action or initials/name and sign-out.
Routine signed-out notices are live announcements rather than permanent rows.
Full identity text remains accessible. Desktop sign-in help appears on hover/
focus and can be dismissed with Escape; mobile help stays visible inside the
native modal drawer. Error messages and retry remain available. This presentation
change does not alter authentication.
Only backend current-user data establishes sign-in. PR #11 now adds an explicit
Save action after the form's local review, reusing the authenticated session and
CSRF reader. Auth alone never saves trips or authorizes a resource. No OAuth or
role implementation is changed by that integration.

## Structure and contract

- `frontend/src/api/auth.ts`: relative cookie requests, runtime shape validation,
  deadlines/cancellation, CSRF delivery-cookie selection, and full navigation.
- `frontend/src/features/auth/`: context/provider, lifecycle, accessible controls,
  and feature CSS. No new dependency.
- `frontend/src/App.tsx` / `components/SiteHeader.tsx`: composition alongside
  existing navigation; the form is not gated/remounted.
- `frontend/vite.config.ts`: auth/API/health forwarding and log privacy.

| Action | Contract |
|---|---|
| Bootstrap/refresh | GET `/api/auth/me`; validated 200 `{user:{id,email,display_name}}` establishes identity; 401 clears it |
| Sign in | Full-page `/auth/google/start`; backend owns OAuth/callback; no client success flag |
| After callback | Backend 303 to app origin root; React mounts fresh and checks /me |
| Sign out | POST `/api/auth/logout`, same-origin cookies and X-CSRF-Token; 204 confirms logout, 401 means session ended |
| Server/network/shape failure | Unknown status with retry, never invented login/logout success |

Read only HTTP `roam_csrf` or HTTPS `__Host-roam_csrf` for the unsafe-request
header. JavaScript never reads the HttpOnly bearer. Tokens are not returned in
JSON or stored in localStorage/sessionStorage. Browser Origin is sent normally;
the proxy preserves it for server CSRF validation. A missing CSRF cookie/403
checks /me; if the session remains valid, reauthenticate for a new pair.

React state/context is the human-requested exception for this small auth snapshot;
future trip server queries still default to TanStack Query. No client generator
exists yet; types match current OpenAPI and are guarded at runtime. No backend
endpoint/schema changes are introduced here.

PR #11's single create mutation uses the narrow native-fetch exception in
[ADR 0010](adr/0010-trip-creation-integration.md). Save requires a confirmed user
and is unavailable while signing out. A trip 401 refreshes the auth snapshot;
CSRF failure offers existing Google navigation with an unsaved-data warning.
Account changes discard pending/saved confirmation state and abort/ignore late
results, preserving parent form values. Cancellation does not undo a server
commit. No token is put in storage or request JSON, and no owner ID is accepted.

## Lifecycle and accessibility

Mount/refresh checks the server. Focus, reconnect, and visible-tab return recheck
sessions that expired or were revoked elsewhere. No polling extends idle time.
An open tab can show the last confirmed profile until its next check; every
protected backend operation independently validates the session/ownership.

Strict Mode may start/abort an extra development check. Cancellation and request
revisions ignore obsolete results, including late signed-in results after logout.
Native named buttons, duplicate-submit prevention, live status/error messages,
and a described sign-in draft-loss notice support keyboard use. Focus returns
to the next account action after explicit logout/retry; initial/background
checks do not steal focus from trip editing.

Focus recovery runs in a layout effect during commit. A passive effect from a
previous render must not consume the focus request of a newly clicked action.
Regression tests click sign-out during the authenticated commit and check focus
after both confirmed logout and an outage; integration assertions also wait for
the final focused control.

Sign-in navigation clears unsaved details, disclosed on the control. Logout,
expiry, and retries keep the form mounted. No draft auto-save is introduced.
Profile text is rendered literally; no avatar/provider URLs or raw HTML are used.

## Compact navigation and automatic session checking

Implemented on `feat/navbar-overhaul`, 2026-11-19: the manual "Check session"
button is removed, following the earlier human decision. Users do not need to
manage or manually verify their session.

Keep automatic current-user checks on mount, focus, reconnect and visible-tab
return, along with backend validation on protected requests. Preserve the
"Retry sign-in check" action for recoverable error states. Do not add polling,
change expiration rules or remove GET /api/auth/me as part of this cleanup.
Component tests now use focus-triggered automatic checking; manual verification
should use automatic recovery or error-state retry. Three section links stay
within the five-item cap, so no extra desktop overflow control is needed. Below
56rem, Menu opens a native modal drawer with 48px minimum actions, scroll locking,
Escape/Close, and focus return. Selecting a section closes the drawer and focuses
that section. Native browser modal behavior supplies background inertness.

## Local setup

1. Follow [Google configuration](runbooks/google-oauth-local.md) and the
   [session runbook](runbooks/application-sessions.md). Keep credentials only in
   root ignored `.env`; apply migrations through `0002`.
2. Start FastAPI on `http://127.0.0.1:8000` using its environment-file convention,
   and Vite at `http://127.0.0.1:5173`. Keep hosts/ports consistent.
3. Register exactly `http://127.0.0.1:5173/auth/google/callback`. Vite preserves
   auth/API paths, query, cookies, and Origin. No wildcard CORS or VITE_* OAuth
   configuration is needed.
4. Disable DEBUG before serving: Vite verbose logs expose callback URLs, so
   startup refuses that mode. Proxy failures produce sanitized errors.
5. Observe actual /me state before claiming login works. Backend/config/database
   failures show recovery while the form remains usable. Denied/invalid callbacks
   currently show the backend's safe error response, not a new React error route;
   return home/back and recheck.

The health diagnostic remains development-only. Account checks also run in
production and need planned same-origin serving. `vite preview` alone is not
the production FastAPI deployment or a verified OAuth setup.

## Verification and limits

Use pinned Node 24.22.3 and the existing gates:

```sh
npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Tests cover profile/Unicode shapes, 401 versus failures, timeout/cancellation,
HTTP/HTTPS CSRF, duplicate submission, Strict Mode/stale responses, expiry,
focus, literal rendering, trip preservation, and proxy privacy. Existing form
tests still prove local review. See [memory](memory.md) for measured evidence.

Synthetic browser/proxy fixtures do not prove real Google sign-in, real-account
logout, or production HTTPS. Screen-reader/cross-browser testing, shared OAuth
flow state, throttling, retention, and deployment remain outstanding. Stop before
Milestone 7.
