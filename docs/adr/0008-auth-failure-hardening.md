# ADR 0008: Authentication failure boundaries and diagnostics

- Date: 2026-11-17
- Status: implemented for human-authorized PR #9 Milestone 7; review pending
- Owner: user with Codex assistance

## Decision

Preserve the same-origin OAuth/session design and library verification. Reject
ambiguous flow, bearer, and CSRF cookies using Starlette's own cookie parsing
rules before selecting a credential. Reject multiple Cookie headers rather than
depending on proxy merge order. A callback that has not consumed a valid flow
must not delete its browser binding; consumed attempts remain single-use and are
cleared after success or failure.

Require a canonical APP_BASE_URL: lowercase scheme/host, no path or trailing
slash, no explicit default port. For example, use `https://roam.example`, not
`HTTPS://roam.example` or `https://roam.example:443`. This keeps exact browser
Origin comparisons predictable. Cookie security derives from the parsed scheme,
not a case-sensitive string prefix. HTTP remains loopback development/test only.

When signed optional `azp` or `at_hash` claims are supplied, require nonempty
strings before Authlib validates their meaning. Authlib treats falsy optional
values as absent; the application rejects malformed supplied values. Signature,
issuer, audience, time, nonce, authorized-party and access-token hash comparisons
remain library operations; no custom cryptography is added.

Check the provider response budget on each available decoded chunk, before
buffering it, including time spent receiving headers. Do not aggregate 4096
bytes before checking. HTTPX's separate five-second network timeouts remain;
the elapsed-time check cannot interrupt an in-progress blocking read and is not
a hard five-second end-to-end cancellation guarantee. Responses remain capped
at 64 KiB, with fixed HTTPS endpoints, no redirects/retries/environment proxies.

Expected authentication failures emit only a stable code, status, and fresh
server-generated UUID to `roam.auth`. Use WARNING for 5xx, INFO for expected
rejections. Error JSON and X-Request-ID share that UUID; ignore supplied request
IDs. Never log exception text/tracebacks, profile fields, headers, or query data.
Google `access_denied` remains a safe 400 consent failure; `server_error` and
`temporarily_unavailable` become 503 AUTH_UNAVAILABLE; unknown errors are invalid
callbacks. Provider descriptions/error URLs are never reflected or followed.

## Consequences and limits

No new dependencies, schema migrations, environment variables, UI, broad scopes,
rate-limit infrastructure, or arbitrary return-to URLs are introduced. Initiation
now documents 400 for ambiguous cookies; auth errors add X-Request-ID. Frontend
success and recovery contracts stay unchanged.

No CORS middleware is needed: Vite proxies relative requests, and production is
planned to use one origin. Cross-origin scripts receive no CORS permission;
unsafe requests independently require exact Origin/Referer plus session-bound
CSRF. A future separate-origin architecture needs an explicit decision and
explicit origins, never wildcard credentials.

Configure the `roam.auth` logger at INFO to retain expected rejection events;
5xx warnings work with standard warning-level logging. Deployment log retention,
aggregation, TLS/security headers/CSP and proxy query redaction remain deployment
work. Flow state still requires one process and is lost on restart. This milestone
does not claim live Google or production HTTPS verification. See the
[security audit](../auth-security-audit.md) for evidence and remaining limits.
