# ADR 0005: Verify Google identity before an atomic PostgreSQL user upsert

- Date: 2026-11-17
- Status: implemented for human-authorized PR #9 Milestone 4 only; review pending
- Owner: user with Codex assistance

Milestone 4 is human-reported complete/reviewed. The text-only/no-session
callback behavior below is historical and is superseded by Milestone 5's
[application-session decision](0006-application-sessions.md). Its Google
validation and identity upsert decisions remain in effect.

## Existing schema and identity

Inspection of `User` and Alembic revision `0001` confirms the existing non-null
issuer/subject fields and unique `(oidc_issuer, oidc_subject)` constraint. No new
column, constraint, or migration is necessary. Google `sub`, scoped by its issuer,
identifies the account. Emails can change or be shared by distinct identities;
they never select or merge a Roam account. Google's documented issuer forms
(`https://accounts.google.com` and `accounts.google.com`) are validated first,
then normalized to the canonical HTTPS issuer before persistence.

## Callback and verification

`GET /auth/google/callback` rejects oversized, ambiguous/duplicate parameters,
missing/wrong browser binding, mismatched state, and expired/replayed attempts.
Under one process lock it consumes the matching pending record BEFORE provider
or database work. Wrong state does not consume a legitimate record. Denied
consent consumes a valid record without token exchange or DB work. Any failed
exchange/save requires a fresh login attempt, never an automatic retry.

Retain Authlib 1.9.9's public OAuth protocol client for standard grant formatting
and response parsing. Supply its documented `session.post` interface through a
small bounded synchronous HTTPX adapter, using HTTPX's BasicAuth against the
fixed Google token endpoint. The original callback URI and PKCE verifier come
only from server-held flow data. This reuses existing transport dependencies
instead of adding HTTPX2/Requests or implementing grant/crypto algorithms.

Use joserfc 1.8.0 (already an Authlib transitive dependency, now explicitly
declared because Roam imports it) to verify RS256 signatures against Google's
fixed trusted JWKS URL. Never resolve a URL/key supplied by a token header.
Bound metadata, token, and key responses to 64 KiB and HTTP timeouts; bound ID
tokens to 16 KiB and JWKS to ten keys. Cache keys for five minutes; an unknown
`kid` permits at most one trusted refresh per callback, with no code-exchange
retry. Authlib `CodeIDToken.validate` checks issuer, audience, expiration,
issued-at/not-before, nonce, authorized party where applicable, and `at_hash`
when supplied. Permit 30 seconds of clock skew. Only then apply profile policy:
`email_verified is True` (not a truthy string/number), bounded nonblank subject,
normalized email, and optional name trimmed/bounded to 120 characters without
control characters. Missing name preserves a returning user's current name.

## Persistence and race handling

After all Google I/O and validation complete, the application service opens a
short SQLAlchemy transaction. A PostgreSQL `INSERT ... ON CONFLICT` under the
existing identity constraint performs identity lookup/create/update atomically
and returns the existing or new UUID. Concurrent first logins serialize at that
constraint and return one user. Only email, optional display name, and updated
timestamp change; identifiers, creation time, and existing trips are preserved.
Rollback covers the entire write. Database failures return a sanitized 503.

A read-then-insert could race and would require an additional unique-violation
recovery path. Native upsert fits the existing PostgreSQL-only semantics and is
both smaller and authoritative. Tests use PostgreSQL, never SQLite.

## No temporary authenticated state

Successful callback returns no user profile or token: plain text explicitly
states that the identity was verified/profile saved and the user is NOT signed
in. It clears only flow cookies and sets no application session. Access/refresh/
ID tokens stay in callback-local memory and are not persisted. The callback is
not a test-login shortcut. Milestone 5 must implement the actual revocable
opaque PostgreSQL-backed application session and CSRF lifecycle.

Pure ASGI middleware removes callback query strings from the original scope
used by Uvicorn access logging. The handler privately parses that query and the
middleware discards it afterward. Do not log request.state, raw provider bodies,
codes, tokens, headers, or cookies. Future Vite/production proxies need separate
callback-query redaction before exposure. No frontend/proxy changes are included.

## Limits and evidence

Process-local pending flow state remains a one-process development limit;
restarts lose attempts and workers cannot share them. Durable shared flow state,
rate limits, HTTPS deployment, sessions, and frontend behavior remain unfinished.
State rejection, real RSA/JOSE/OIDC claim validation, consent/errors, cookie
clearing, log-scope redaction, user updates, duplicate races, and rollback have
isolated tests. See [memory](../memory.md) for exact current results and limits.
No real Google credentials, provider calls, or live login are verification claims.

References: [Google ID-token claims](https://developers.google.com/identity/openid-connect/openid-connect),
[Authlib OAuth client](https://docs.authlib.org/en/stable/oauth2/client/http/index.html),
[joserfc JWT verification](https://jose.authlib.org/en/guide/jwt/).
