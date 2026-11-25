# ADR 0014: Dashboard state and recovery actions

- Date: 2026-11-24
- Status: implemented locally for PR #12 Milestone 5; uncommitted, review pending
- Owner: user with Codex assistance

## Decision and scope

The human defined Milestone 5 as dashboard loading, empty, error and auth states.
This supersedes earlier forecasts assigning canonical trip details to Milestone
5. Detail loading remains future work; the existing navigation shell is unchanged.

Preserve the account-keyed useSavedTrips hook and three request-state variants:
loading, successful page, or safe TripApiError. Empty is a successful page with
no items, never an error fallback. Keep existing cursor pagination and explicit
first-page refresh/retry. Do not add a query dependency, persistence or polling.

## Authentication and error policy

- Loading/unknown/signed-out/signing-out auth mounts no protected list fetcher.
- Signed-out users get a visible dashboard sign-in button using the existing
  startGoogleSignIn helper and its full-page/draft-loss warning. An immediate
  guard prevents duplicate navigation; failure text never includes exceptions.
- A read 401 offers Recheck sign-in through AuthProvider.retry. Only the existing
  `/api/auth/me` result establishes the next account state. Expiration notices
  come from the existing provider; no forced redirect or automatic retry loop.
- A read 403 maps to frontend FORBIDDEN, meaning request denied, not proof of an
  expired session. Check account uses the same existing session check. A valid
  profile does not override a repeated trip denial or invent a logout.
- Read 403 is no longer labelled CSRF_FAILED. This is client normalization only:
  backend error envelopes/authorization are unchanged, and create's 403 still
  maps to CSRF_FAILED with its existing protection and messages.
- Server/network/timeout/response failures offer explicit request retry with
  fixed client messages. AUTH_NOT_CONFIGURED offers account recovery instead.
  Raw server text, arbitrary details, exceptions and tokens never reach the UI.

Retry clears the old error/cards, displays loading, and performs one bounded
request from the first page. Account-recovery cases expose no blind list retry.
Logout or account change unmounts the keyed child; abort/active guards ignore late
responses. Refresh failures never retain previously rendered authenticated data.
Backend authorization remains decisive for every actual request.

## Accessibility and alternatives

Use atomic status/alert announcements, aria-busy during list loading and
aria-hidden skeletons. Empty accounts get an inline creation action. Initial
background results do not steal focus. Explicit request retry focuses the final
result/error; explicit account recovery focuses the resulting sign-in action,
account error or heading. Signing out cancels that local focus intent so existing
account-control focus behavior is preserved.

Automatic retries could loop on denied/expired sessions or an outage. Forcing
logout on every 403 would conflate authorization and authentication. A new auth
system or global state machine would duplicate existing responsibilities. Small
typed UI recovery metadata keeps the client, auth provider and request hook
boundaries understandable without changing backend security.

## Evidence and limits

[HTTP-boundary state tests](../../frontend/src/features/trip/SavedTripsDashboard.states.test.tsx)
exercise native client parsing, session checks, timeout cancellation, explicit
retry, focus, sign-in navigation and logout races. Existing request/account-switch
tests remain. [Read-client tests](../../frontend/src/api/trips.read.test.ts) also
check legacy CSRF-labelled read denials; existing creation tests retain POST CSRF.
Results are recorded in [memory](../memory.md). Mocked HTTP does not prove live
Google, database authorization, screen-reader or deployed behavior.
