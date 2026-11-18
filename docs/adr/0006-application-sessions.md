# ADR 0006: Revocable PostgreSQL sessions and stateful CSRF protection

- Date: 2026-11-17
- Status: implemented for human-authorized PR #9 Milestone 5 only; review pending
- Owner: user with Codex assistance

## Decision and API exception

After verified Google identity, create an independent opaque Roam session in the
existing PostgreSQL database. The user's current milestone explicitly requests
`GET /api/auth/me` and `POST /api/auth/logout`; these override the previously
planned `/api/v1/me` and `/api/v1/auth/logout` for these two routes only. No legacy
alias is added; other business JSON APIs still belong under `/api/v1`.

Migration `0002` adds `sessions` with UUID identity, user FK/cascade, unique
32-byte bearer hash, 32-byte CSRF hash, and UTC creation/last-seen/absolute-expiry/
revocation timestamps. Checks enforce hash length, ordering, and at most 168
hours absolute duration (not calendar-day intervals across DST). User/expiry
indexes support access and future cleanup. The additive upgrade preserves
existing users/trips. Downgrade removes only sessions and signs everyone out;
never edit already-shared revision `0001`.

## Creation, lifetime, and revocation

Use standard-library `secrets.token_urlsafe(32)` independently for bearer and
CSRF values: 256 bits of unpredictable entropy each. Store only their SHA-256
digests. A slow password hash is unnecessary for random 256-bit values; do not
add a pepper/signing secret without a requirement. This supersedes the unused
SESSION_TOKEN_PEPPER proposal. There is no JWT or custom signing/encryption.

After all Google I/O and validation, one short service-owned transaction upserts
the user, revokes any presented old session, and inserts the new session. Always
generate a fresh token, never adopt a client-supplied value. Failure rolls back
the profile, revocation, and new row together. Set cookies only after commit,
clear transient flow cookies, and 303 to the configured app origin root. Do not
use a caller-provided return URL. The callback's Google verification is unchanged.

Absolute lifetime is seven days; idle lifetime is 24 hours. At every request,
lock the matching session row, check user/expiry/revocation, validate unsafe
request CSRF, and then update last-seen. Failures roll back without refreshing
idle time. No request extends absolute expiry. Row locking serializes validation
with logout/rotation; revoked sessions cannot be revived. Logout conditionally
revokes the authenticated user's current session and clears cookies only after
commit. A stale/copied cookie gets the same generic 401 as other invalid sessions.
Other browsers' sessions remain valid. Session lookups do not contact Google.

## Cookies and CSRF

HTTPS uses `__Host-roam_session` (HttpOnly) and `__Host-roam_csrf` (readable by
JavaScript). Both are Secure, SameSite=Lax, host-only (no Domain), Path=/, with
finite absolute lifetime. Explicit loopback development/test uses `roam_session`
and `roam_csrf` without Secure; production rejects HTTP configuration.

Unsafe methods through `get_current_user`/`get_current_session` must include
the CSRF cookie value as `X-CSRF-Token`. Compare its digest with both the cookie
and the authenticated session's stored CSRF digest using constant-time checks.
Also require exact APP_BASE_URL Origin, with parsed same-origin Referer fallback
only when Origin is absent. Reject null/foreign/ambiguous values. This is a
stateful synchronizer-token design with cookie delivery, not naive double submit:
injecting an arbitrary cookie/header pair cannot match the victim's DB session.
SameSite is defense in depth. XSS remains a separate concern.

The CSRF cookie intentionally is not HttpOnly so future React can send its value
in a header. The session bearer stays HttpOnly. No token appears in JSON or
localStorage. GET /me returns only `{user: {id, email, display_name}}` with
Cache-Control: no-store. It does not rotate CSRF on every read and break other
tabs. A missing/invalid CSRF cookie requires reauthentication before unsafe work.
Generic 401 clears bad cookies; CSRF 403 and database 503 do not pretend logout
succeeded. Unsafe protected requests cannot bypass CSRF by using the user-only
dependency. Resource services must separately authorize by owner.

## Alternatives, limits, and evidence

Signed-cookie sessions avoid a lookup but complicate immediate revocation;
their payload is readable unless additionally encrypted. PostgreSQL already
exists and supplies consistent revocation/transactions across instances, so its
lookup/write cost fits the current scale. Revisit last-seen write frequency only
after measuring contention. No Redis, worker, roles, or trip CRUD is introduced.

AppSettings validates origin/cookie policy separately from Google credentials;
existing sessions continue to work while Google is unavailable. Restart after
environment changes. Durable application sessions survive process restarts,
but transient OAuth pending flows still do not; shared flow storage, throttling,
frontend/proxy integration, live Google/HTTPS verification, and session-row
cleanup/retention tooling remain unfinished. Expired/revoked rows are rejected
even before cleanup. Full deployment security is not claimed.

Tests cover real PostgreSQL session hashes, constraint failures, rotation,
idle/absolute expiry, logout replay, cross-session CSRF, rollback, concurrent
validation/revocation, callback issuance, and existing-data migration preservation.
See [memory](../memory.md) for current evidence. No live Google requests or real
credentials are needed.

References: [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
