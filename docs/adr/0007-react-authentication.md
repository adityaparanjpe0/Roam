# ADR 0007: React auth snapshot and same-origin proxy

- Date: 2026-11-17
- Status: implemented for human-authorized PR #9 Milestone 6; review pending
- Owner: user with Codex assistance

## Decision

Use built-in React state/context and native fetch for account UI, following the
human preference. There is one small profile snapshot and logout action; no new
dependency/cache is needed. This is a narrow exception to planned TanStack Query
usage. Future trip server state still defaults to TanStack Query; revisit once
trip queries exist. Do not add Redux or use UI state as resource authorization.

The wrapper uses existing `/api/auth/me` and `/api/auth/logout` contracts,
relative URLs, same-origin credentials, no-store caching, ten-second deadlines,
caller cancellation, and runtime profile validation. Copy only id/email/name.
Unicode limits follow backend code points. Types are maintained beside the
wrapper: no client generator exists and no backend schema changes here.

A /me 200 with valid profile establishes signed-in UI; 401 establishes signed-out
UI. Network/server/timeout/shape errors are unknown status, not proof of logout.
Focus, visible-tab return, and reconnect checks recover ended sessions. Avoid
polling, which would refresh idle activity while absent. An open tab can show
its last confirmed profile until the next check; the backend remains authoritative.

Sign in calls `window.location.assign('/auth/google/start')`. There is no Google
SDK, frontend protocol/secret, redirect URI construction, URL success flag, or
localStorage/sessionStorage token. Full navigation clears the local draft;
disclose that before activation rather than adding trip persistence here.

Logout reads only `roam_csrf` for HTTP or `__Host-roam_csrf` for HTTPS and sends
X-CSRF-Token. The bearer remains HttpOnly/browser-managed. 204 confirms logout;
401 confirms an ended session. For missing CSRF/403, check /me once: only a
subsequent 401 confirms absence; otherwise show recovery and allow reauthentication
for a new pair. Lost responses do not prove success. Abort/revision guards
prevent stale checks from restoring signed-in state after logout. Disable
duplicate actions and restore focus after explicit actions; background checks
do not steal it. Keep the public trip form mounted through auth transitions.

## Proxy and privacy

Vite forwards complete `/api` and `/auth` namespaces plus exact `/health` to
FastAPI on loopback port 8000. Preserve paths, query, Origin, Cookie, and
Set-Cookie; do not rewrite Origin or loosen CORS. Unknown API/auth paths reach
FastAPI instead of SPA fallback. Local origin/callback stay on port 5173.

Installed Vite source inspection showed proxy errors include raw callback URLs.
Sanitize proxy errors to a fixed actionable message and discard original stack/
details for those errors. DEBUG bypasses customLogger, so refuse serving with
DEBUG enabled. Unrelated build diagnostics remain unchanged. Do not add raw
request logging around auth.

## Alternatives and limits

TanStack Query offers lifecycle/cache invalidation, but adds a dependency before
trip queries exist. Keeping state only inside the header is smaller but harder
to reuse for later account-dependent UI. Context fits this slice; it is not a
replacement for future server query management.

Tests use synthetic responses, real parsing, Strict Mode cancellation, stale
response races, CSRF selection, navigation helper calls, focus, and trip-state
preservation. Browser/proxy fixtures do not prove live Google or HTTPS. Denied/
invalid callbacks still display the backend's safe error response; frontend
callback-error redirect polish is not added. Shared OAuth flow storage, rate
limits, cleanup, live consent/cookies, screen-reader/cross-browser verification,
and deployment remain outstanding. See [frontend auth](../frontend-auth.md) and
[memory evidence](../memory.md).
