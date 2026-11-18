# ADR 0004: Synchronous Authlib initiation with server-only pending flow data

- Date: 2026-11-17
- Status: implemented for human-authorized PR #9 Milestone 3 only; walkthrough pending
- Owner: user with Codex assistance

## Decision

Use Authlib 1.9.9 (BSD-3-Clause; installed distribution license reviewed), its
public `authlib.oauth2.client.OAuth2Client` protocol client, and its secure token
generator for authorization URLs, state, nonce, and PKCE S256. HTTPX 0.28.1 is
now a runtime dependency for synchronous discovery, retaining Roam's sync model.
No OAuth request/crypto algorithm is reimplemented. No token transport is needed
yet: initiation only constructs a URL; callback/token validation is deferred.

Authlib's current HTTPX convenience integration imports HTTPX2, and its Starlette
integration is async. Neither is needed for URL construction. This choice avoids
a second runtime HTTP stack or async/database bridging in this milestone.
Callback implementation must select a supported maintained token transport and
OIDC validator, rather than treating this protocol client as a complete login.
Do not use a signed browser session cookie for PKCE storage: signed payloads are
readable. The browser instead receives only a random opaque binding value.

Pending state, nonce, verifier, exact redirect URI, and monotonic expiry live in
a thread-safe process-local store under the binding's SHA-256 digest. Maximum
256 active attempts, ten-minute TTL, expired-entry pruning on initiation, and
same-browser replacement bound memory. Full capacity returns 429; records from
other browsers are not evicted. This records no authenticated identity and is
not the planned PostgreSQL application-session implementation.

This narrows the initial full-auth plan's PostgreSQL login-transaction proposal
to an initiation-only foundation, without adding a migration/application session
outside the requested milestone. A process restart or worker change loses the
flow and must fail closed. Shared durable flow storage, atomic callback consume,
replay rejection, throttling, and complete session/CSRF behavior remain required
before deployment. Never enable public login based on this milestone alone.

## Configuration and provider boundaries

Use the existing `/auth/google/start` and configured browser-facing callback
from ADR 0003. No alternate `/api/auth/...` route, callback placeholder, frontend
proxy change, token exchange, DB write, or UI is added. Never derive the callback
from Host/forwarded headers or user query parameters. HTTPS origins use Secure,
HttpOnly, SameSite=Lax, host-only `__Host-roam_oauth` cookies with Path=/;
loopback HTTP is allowed only with explicit development/test settings.

Auth settings are lazy like database settings; invalid/missing values return
503 while health remains available. Restart after changing settings. This
documents the current exception to the target startup-validation rule.

Discovery uses only Google's fixed well-known URL, verified TLS, disabled
environment proxies/redirects/retries, five-second HTTP timeouts, a bounded
five-second body-read window, a 64 KiB size cap, and one-hour caching. Validate
issuer and exact authorization/token/JWKS endpoints and required capabilities.
If optional PKCE metadata is absent, still send S256; if present and incompatible,
fail closed. Never silently downgrade. Failed metadata refresh cannot use an
expired cached document. Later live testing must verify this exact Google Web
client flow; generated parameters alone do not establish provider enforcement.

## Evidence and reconsideration

Tests exercise real Authlib URL creation with deterministic synthetic tokens and
mocked HTTP; no Google credentials or requests are used. They cover config,
redirect/cookie secrecy, PKCE agreement, cache refresh, metadata errors, capacity,
expiry, separate browsers, and missing callback/session routes. See current
[memory evidence](../memory.md). Move flow state to PostgreSQL before a callback
needs multi-process/restart durability. Retain opaque database-backed application
sessions as the approved final architecture; do not expand this flow store into
an application authentication shortcut.
