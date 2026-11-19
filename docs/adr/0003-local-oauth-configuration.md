# ADR 0003: Local Google OIDC uses the browser-facing Vite origin

- Date: 2026-11-17
- Status: configuration decision recorded under human-approved Milestone 2;
  runtime implementation pending
- Owner: user with Codex assistance; teammate walkthrough pending

## Context and decision

The human approved the authentication plan and authorized only local Google
configuration next. Retain React, FastAPI as the Google OIDC authorization-code
client, PostgreSQL, and opaque server-side application sessions with hashed
tokens. Authlib remains the proposed maintained library; compatibility and
token validation must be verified before implementation.

Use `http://127.0.0.1:5173` as the local browser origin and
`http://127.0.0.1:8000` as the FastAPI upstream. Register exactly
`http://127.0.0.1:5173/auth/google/callback` on a development Web application
OAuth client. A future Vite `/auth` proxy will forward the callback to FastAPI
without changing its path. No such proxy or callback is implemented today.
Request only `openid email profile`, without offline access. Keep real client
credentials in the ignored root `.env`; the committed example has blank values.

## Alternatives and consequences

A direct port-8000 callback could reach FastAPI without a Vite proxy, but would
split the browser-facing auth flow across origins and differ from the intended
same-origin API development workflow. Choose one registered URI consistently
instead of registering both as speculative fallbacks. Revisit this decision if
development serving changes; update Google registration and docs together.
Production requires a separate HTTPS callback/client and a deployment review.

The cost is that login cannot be exercised until the proxy and backend route
exist. Configuration alone proves neither OIDC validation nor session security.
Verification for this milestone is document/value consistency and ignore-rule
checks; later milestones must test callback routing, identity validation,
cookies, CSRF, expiry, and revocation. Google console setup and live login are
unverified. See the [manual runbook](../runbooks/google-oauth-local.md).
