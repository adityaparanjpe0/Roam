# Authentication automated testing — PR #9 Milestone 8

Date: 2026-11-18. Owner: user with Codex assistance. Milestone 7 was reported
complete/reviewed by the human; Milestone 8 was also reported complete/reviewed
on 2026-11-18. Milestone 9 provides [the manual verification checklist](auth-manual-checklist.md).
No application code, schema, dependencies or workflow configuration changed.

## What this milestone adds

[test_auth_flow.py](../backend/tests/integration/test_auth_flow.py) adds 16
PostgreSQL-backed cases that connect real initiation, Authlib authorization-code
exchange/PKCE, joserfc signature verification, Authlib OIDC claims, user upserts,
session transactions, cookies, /me and logout. Existing unit tests are retained.
The successful HTTP/HTTPS cases repeat login with changed profile data and prove
one stable user, rotated sessions, rejected CSRF, and revoked-cookie replay.
Invalid claims/exchange failures prove no user/session rows are committed. A real
SQLAlchemy commit-event failure proves rollback and no cookie issuance. Frozen
session/flow clocks test expiry without sleeps.

[AuthIntegration.test.tsx](../frontend/src/features/auth/AuthIntegration.test.tsx)
adds 12 cases using real components, context and auth service. Fetch is replaced
at the HTTP boundary, rather than replacing the auth service. This covers loading,
validated profiles, 401/expiry, logout 204/401/403/503, missing CSRF, malformed
responses, network errors, cancellation on timeout, focus recovery and preserving
the unsaved trip form. [auth.navigation.test.ts](../frontend/src/api/auth.navigation.test.ts)
checks the real navigation helper against the fixed backend route, replacing
only window.location.assign in a Node test environment. Existing component tests
already prove the sign-in button invokes that helper.

## Coverage map

This maps all requested behaviors; it is not a line-coverage percentage.

| # | Requested behavior | Executable evidence |
|---|---|---|
| 1 | Google initiation and redirect | [Login tests](../backend/tests/test_oauth_login.py); integrated start helper verifies Google origin, scopes, PKCE and flow cookie. |
| 2 | Missing/invalid/expired state | [Flow tests](../backend/tests/test_oauth_flow.py), [callback tests](../backend/tests/test_oauth_callback.py), integrated cases prove no exchange or database writes. |
| 3 | Invalid ID tokens | [Identity tests](../backend/tests/test_google_identity.py) exercise signed fixtures and malformed tokens; integrated cases reject nonce/issuer/audience/expiry/signature failures before persistence. |
| 4 | Verified identity mapping | Integrated lifecycle proves normalized email, display name, canonical issuer, stable Google subject and UUID across repeat login. |
| 5 | New user creation | Integrated lifecycle plus [user tests](../backend/tests/integration/test_google_users.py). |
| 6 | Repeat login without duplicates | Integrated lifecycle asserts one user, profile updates, unchanged UUID; existing user tests include concurrent first-login upserts. |
| 7 | Session creation and cookie flags | Integrated localhost/HTTPS lifecycle plus [PostgreSQL session tests](../backend/tests/integration/test_application_sessions.py) and [session API tests](../backend/tests/test_session_api.py). |
| 8 | Valid /me | Real callback-created cookie authenticates through real PostgreSQL lookup in integrated lifecycle. |
| 9 | Missing/expired /me | Integrated missing/idle-expired cases; existing PostgreSQL tests also cover absolute expiry, malformed, unknown and revoked bearers. |
| 10 | Logout invalidation/clearing | Integrated 204 response clears cookies; copied bearer replay returns 401. Existing tests cover concurrent revocation. |
| 11 | CSRF | Integrated logout rejects missing proof and later succeeds with correct proof; [security tests](../backend/tests/test_session_security.py) cover origin/header/token adversarial cases and session binding. |
| 12 | Google/database failures | Integrated timeout/rejected exchange and SQLAlchemy commit failure; [failure boundary tests](../backend/tests/test_session_failures.py) and session API outage tests cover lookup/logout failures. |
| 13 | Sign-in redirect action | [Existing controls tests](../frontend/src/features/auth/AuthControls.test.tsx) prove button → helper; new navigation test proves real helper → fixed full-page path. |
| 14 | Current-user loading | Deferred real-service fetch keeps aria-busy/status and no signed-in claim until validated response. |
| 15 | Signed-in rendering | New integration tests plus existing controls tests for missing name, literal text/XSS and email fallback. |
| 16 | Unauthenticated/expired session | Real 401 bootstrap and focus recovery replace the old profile with signed-out controls. |
| 17 | Logout | Real-service integration covers CSRF request, duplicate-submit prevention, pending state, confirmed success, ended session and recoverable failures. |
| 18 | Accessible error handling | New integration tests assert role=alert, named retry buttons, focused recovery, timeout text, and no private error reflection. |

## Mock boundaries and isolation

- Google discovery, token endpoint and trusted JWKS are served by HTTPX
  MockTransport. Synthetic short-lived ID tokens use ephemeral test RSA keys;
  real JOSE/OIDC validation runs, including a deliberately wrong signing key.
  No Google account, production key or token is involved. Private test keys are
  never written to files. Existing narrow route tests may replace provider or
  persistence services to isolate HTTP error mapping; the new success path does not.
- Existing scratch-database fixtures require explicit --run-db-tests and a local
  TEST_DATABASE_ADMIN_URL targeting the postgres maintenance database. They create
  owned UUID databases, migrate through Alembic and drop only registered names.
  No SQLite substitute, application table truncation or development URL fallback.
- Only clocks and infrastructure-failure hooks are substituted inside the backend.
  Production randomness is exercised, but assertions use properties, not exact
  random bytes; correctness never depends on a particular generated token.
- [Backend conftest](../backend/tests/conftest.py) rejects sync/async default HTTPX
  transports. [Guard tests](../backend/tests/test_network_guard.py) prove requests
  fail at the transport before sockets. This is not a network firewall for arbitrary
  third-party libraries; current provider HTTP uses HTTPX.
- [Frontend setup](../frontend/src/test/setup.ts) replaces fetch with a rejecting
  fake before each test. Individual tests explicitly provide responses. Cleanup
  unmounts React and restores globals; new auth tests also clear CSRF cookies,
  timers and spies. DOM cookies/storage are test-local, not a real browser profile.

## Run locally and in CI

From backend, after installing the locked development environment:

```sh
uv run --no-sync ruff format --check .
uv run --no-sync ruff check .
uv run --no-sync mypy app
uv run --no-sync pytest
uv run --env-file ../.env --no-sync pytest --run-db-tests -m database
```

The last command requires a deliberately configured local test administrator;
see [the database guide](../backend/README.md#database-foundation--pr-7-milestone-1).
Never substitute a production URL. Omit `-m database` to run the full backend
suite together. Neither the tests nor CI need real Google credentials.

From frontend, after npm ci:

```sh
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

The existing [backend workflow](../.github/workflows/backend-ci.yml) already
runs ordinary pytest, then --run-db-tests -m database against its disposable
PostgreSQL service. The new module is marked database and discovered normally.
The existing [frontend workflow](../.github/workflows/frontend-ci.yml) already
uses Vitest --run, so the new files execute once without watch mode. No workflow
changes, GitHub secrets or manual prompts are required for these tests. Locked
installation still needs package registries; provider requests during tests are
faked. This verifies the workflow wiring, not a hosted green run or availability
of every pinned remote artifact. No Actions run was launched in this milestone.

## Actual local results

- Python 3.12.16: Ruff format/check passed (61 files); mypy app passed (34 files).
- Default pytest: 266 passed, 91 database tests intentionally skipped.
- Full pytest with isolated PostgreSQL: 357 passed, no skips, in 51.50 seconds.
  A generated-credential native PostgreSQL 17.0 UTC cluster was stopped and removed
  afterward. The workflow targets PostgreSQL 18.7; hosted execution is unverified.
- Node 24.22.3 / npm 11.19.1: frontend lint, typecheck and production build passed;
  Vitest 200 tests passed in 11 files. No dependencies were installed or changed.
- The existing Starlette TestClient/httpx deprecation warning remains visible;
  assertions and warning policy were not weakened.

## Remaining gaps

These are automated application/transport tests, not a real Google browser login
or deployed HTTPS test. Consent-screen configuration, real provider interoperability,
TLS termination, browser-enforced HttpOnly/SameSite/Secure behavior, reverse-proxy
logging/CSP, and multi-tab/multi-worker deployed behavior remain unverified.
JSDOM accessibility assertions do not replace manual keyboard/screen-reader
review or a browser accessibility audit. Database commit failure is injected;
network partitions and ambiguous connection loss during commit are not simulated.
Production session-retention/cleanup and shared OAuth flow-state infrastructure
remain outside this milestone. Milestone 9 is unstarted.
