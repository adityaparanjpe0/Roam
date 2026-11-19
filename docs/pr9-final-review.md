# PR #9 final review and proposed pull request

Date: 2026-11-18. Reviewer: Codex, for the human developers.
This is a local review artifact, not a created/published PR or released version.

## Verdict

**2026-11-19 follow-up:** F1/F2 code fixes and F3 documentation cleanup are now
implemented and tested. Full backend: 368 passed (93 PostgreSQL cases); frontend:
200 passed; format/lint/types/build pass. No commit/push/PR was performed.
The earlier 503 AUTH_NOT_CONFIGURED setup blocker is superseded by the human's
later report of successful local Google sign-in and logout after configuration,
database migration and backend restart. See [the manual record](auth-manual-checklist.md).
This is human-reported evidence, not an independently observed browser run;
remaining detailed manual checks, hosted CI and production HTTPS are unverified.

**Original 2026-11-18 review:** publication was held for F1/F2/F3.
The original automated suites passed, but additional isolated reproductions exposed
gaps those tests do not cover. No application fixes were applied during this
original review. The follow-up below supersedes the outstanding-fix status.
At the original review the human reported Milestones 1–9 complete without live
outcomes. Subsequent local sign-in/logout success was human-reported on
2026-11-19. Do not infer additional live observations from synthetic tests.

## Findings and proposed fixes

### F1 — High: valid compressed provider JSON fails during response reconstruction

Affected: [_bounded_response](../backend/app/providers/google_oidc.py#L71).
HTTPX iter_bytes decodes upstream content. Reconstructing a Response with that
decoded body and the original Content-Encoding: gzip header causes another
decompression, raising httpx.DecodingError. Legitimate compressed discovery,
token or JWKS responses can consequently become AUTH_UNAVAILABLE. This is a
functional failure that fails closed, not a demonstrated authentication bypass.

Evidence: an isolated process used MockTransport to return valid gzip-compressed
synthetic application/json from ByteStream. Calling the real _bounded_response
raised DecodingError. No Google network or real credential was used. Existing
uncompressed fixtures do not catch this failure. No claim is made about whether
Google currently compresses any particular response to this installation.

Proposed fix: when rebuilding an already decoded response, preserve only needed
headers or remove stale Content-Encoding/Content-Length/transfer-encoding and
let HTTPX recalculate the body length. Preserve response-size/time limits,
status handling, fixed hosts and no-redirect behavior.

Regression checks: compressed discovery, token and JWKS success; normal JSON
success; compressed oversized decoded bodies still rejected; a complete synthetic
Google → PostgreSQL session flow succeeds with compressed responses.

Resolution 2026-11-19: removed stale encoding/length/transfer-encoding headers
when constructing the decoded in-memory response. Transport boundary and full
compressed PostgreSQL flow regressions pass, including decoded 64 KiB bounds.

### F2 — Medium: overlapping first calls can initialize different flow stores

Affected: [get_login_flow_store](../backend/app/api/auth.py#L44).
lru_cache protects cache coherence but does not make factory execution
single-flight. Overlapping initial calls can each return a different LoginFlowStore;
only one becomes the cached store used later. A valid attempt saved to the other
instance is rejected at callback. Per-instance locking does not solve instance
initialization. Ordinary pending-state locking/atomic consumption remains sound.
One Uvicorn worker does not eliminate this race: synchronous FastAPI handlers
can run concurrently in its thread pool.

Evidence: in an isolated process, a Barrier inside an instrumented constructor
forced two first factory calls to overlap. The returned stores differed. An
attempt saved in the uncached instance could not be consumed through the cached
instance. This is a deterministic forced-interleaving repro, not a measured
production failure rate or evidence that normal sequential requests fail.

Proposed fix: construct one flow store before requests can run (module/app startup
state) and have the dependency return that instance. Reset the instance explicitly
in test fixtures. Keep this small; no Redis, new protocol, or shared-state service
is needed to fix initialization within one process.

Regression checks: concurrent first access always returns the same store;
attempts created by overlapping initial requests remain available to callbacks;
single-use consumption/replay, capacity and expiry tests still pass.

Resolution 2026-11-19: module-initialized store and plain getter replace the cached
lazy factory. Fixtures explicitly supply fresh stores; concurrency regression
and existing replay/expiry/capacity tests pass.

### F3 — Low: stale milestone instructions in living documentation

Current text still says Milestone 9 is unstarted in
[auth-testing](auth-testing.md#remaining-gaps), Milestone 8 is unstarted in
[the security audit](auth-security-audit.md#verification-and-deployment-limits),
and stop before Milestone 7/9 in parts of the
[OAuth runbook](runbooks/google-oauth-local.md) and
[session runbook](runbooks/application-sessions.md). Some sections explicitly
preserve history, but these imperative/current-status statements can mislead.

Proposed fix: replace living-guide status/stop statements with links to AUTH and
the current verification record, or label them explicitly as historical. Preserve
dated memory entries instead of rewriting their past evidence. Keep live tests
pending unless detailed human-reported results are recorded as such.

Resolution 2026-11-19: living guide stop/unstarted statements now refer to AUTH
and the current manual record. Historical dated evidence is preserved.

## Review of all requested areas

| # | Area | Result / evidence |
|---|---|---|
| 1 | Branch/tree | feat/google-auth-sessions at e8ca2f5; initial working tree clean. Local main is 1b7187b; branch 8 commits ahead, 0 behind. No fetch or remote-freshness claim. Only this requested report is retained as a new untracked deliverable. |
| 2 | PR scope | 82 changed files, 7,379 insertions/65 deletions against local main: authentication, tests, dependencies, migration and relevant docs. |
| 3 | Unrelated edits | Header CSS supports account controls; App wraps existing content in auth context. AGENTS exceptions document approved session paths and React state choice. No unrelated feature or rewrite found. |
| 4 | Secrets/generated artifacts | No tracked env/secret downloads/private-key/build/cache/export paths detected. Seven targeted secret/token formats scanned across 243 unique tracked blobs in HEAD and all 8 feature commits: no matches. Synthetic test credentials and intended lockfiles are present. This was a targeted scan, not exhaustive gitleaks/entropy proof; no actual .env was read. |
| 5 | Google verification | Real RS256/trusted-key and Authlib claim checks exist and pass signed-fixture tests; fixed discovery/JWKS endpoints, minimal scopes, state/nonce/PKCE. F1 affects valid provider transport; fix before claiming the flow robust. |
| 6 | Stable identity | Atomic upsert on unique canonical issuer/subject, not email. Existing User schema unchanged apart from docstring; same-email/different-subject and duplicate-login races tested. |
| 7 | Session lifecycle | Fresh 256-bit bearer/CSRF, only SHA-256 hashes persisted; user/session issuance and prior revocation atomic; seven-day absolute/24-hour idle expiry; locking and logout revocation tested. F2 concerns transient OAuth state, not DB sessions. |
| 8 | Cookies/CSRF | Host-only HttpOnly bearer; HTTPS Secure/__Host-, Lax, finite lifetime. Session-bound CSRF header/cookie/hash plus exact Origin or Referer fallback on unsafe dependency paths. Duplicate credentials rejected; no wildcard CORS grants. |
| 9 | Endpoints | Only /health, /auth/google/start, /auth/google/callback, /api/auth/me and /api/auth/logout registered. Safe 401/403/503 and error/cookie contracts tested; fixed success redirect. |
| 10 | React identity | Native service validates /me; only valid 200 establishes identity, 401 removes it, other failures recover. Logout waits for server confirmation; cancellation/revision guards cover stale results. |
| 11 | Existing form | Trip feature files unchanged against main; validation/review/edit and auth-transition form preservation tests pass in full frontend suite. No live browser retest claimed. |
| 12 | Scope exclusions | No new trip routes/CRUD, role column, RBAC, Redux, queues, Redis, or deployment layer. Existing Trip models predate branch. |
| 13 | Migrations | Additive 0002 follows unchanged 0001; model registration updated. Fresh upgrade, 0001-user preservation, downgrade/reupgrade and metadata agreement pass in disposable PostgreSQL. Downgrade loses sessions, retains users/trips. |
| 14 | Backend gates | Ruff format/check, mypy app and full pytest pass; exact results below. Reproductions F1/F2 expose missing regressions despite green suite. |
| 15 | Frontend gates | ESLint, TypeScript, Vitest and production build pass; exact results below. |
| 16 | Actions compatibility | Workflow files unchanged. Ordinary pytest and database-marker run select new tests; 91/357 selected with CI's DB selector. Vitest --run is noninteractive. Hosted Actions and pinned external artifact availability not verified. |
| 17 | Documentation | AUTH explains actual behavior and limitations; unreleased changelog is truthful. F3 needs cleanup. No released version or production deployment is claimed. |
| 18 | Live versus mocked | Human subsequently reported local Google sign-in/logout success; manual record identifies that source and retains unreported checks. Automated Google responses remain synthetic. No agent-observed browser, hosted CI or production HTTPS success is claimed. |

The local main log records the trip-form merge as pull request #7, while project
conversation uses PR #8 for that workstream. Verify actual predecessor links and
issue IDs before adding Related Issues; do not invent automatic closing references.

## Actual verification run

| Check | Current result |
|---|---|
| Ruff format --check | 61 files already formatted |
| Ruff check | Passed |
| mypy app | Passed, 34 source files |
| Default pytest | 266 passed, 91 opt-in database skips |
| Full pytest --run-db-tests | 357 passed, no skips, 31.74 seconds |
| Frontend lint / typecheck | Passed |
| Vitest --run | 200 passed in 11 files |
| Production frontend build | Passed, Vite 8.3.8 |
| Editor diagnostics | No errors reported |
| git diff --check main...HEAD | Passed |
| Extra compressed-response repro | Valid response rejected: F1 confirmed |
| Extra initialization-interleaving repro | Uncached attempt lost: F2 confirmed |

Runtime: Python 3.12.16; Node 24.22.3/npm 11.19.1. Database run used a fresh native
PostgreSQL 17.0 UTC cluster with generated test-only credentials, stopped and
removed afterward; developer database and .env were not used. CI targets 18.7,
so local tests do not prove that hosted platform. Existing Starlette
TestClient/httpx deprecation warning remains visible. No dependencies installed.
No real Google/paid request, live login, deployed HTTPS/CSP, or container build
was performed. Docker and dedicated secret scanners were not on agent PATH.

## A. Proposed PR title

**Add Google OIDC authentication and revocable PostgreSQL sessions**

## B. Proposed GitHub PR description

This is draft text. F1/F2/F3 are resolved in the 2026-11-19 working diff; the
original review snapshot below is retained, with current counts added. Unchecked acceptance
items below must remain honest. No PR has been created.

### Summary

Add Google sign-in backed by verified OIDC identity and revocable Roam sessions.
React recovers the current user from the backend, supports logout and session
expiry, and preserves the existing local trip form during auth-state changes.

### Changes

- FastAPI Google authorization-code initiation/callback using Authlib, joserfc,
  trusted discovery/JWKS, state, nonce and PKCE S256.
- Atomic user upsert by canonical issuer/Google sub with profile updates and
  duplicate-login race handling.
- PostgreSQL hashed opaque sessions, rotation, expiry, get_current_user,
  GET /api/auth/me and CSRF-protected POST /api/auth/logout.
- Additive Alembic 0002 for sessions; original 0001 unchanged. Upgrade with
  alembic upgrade head. Downgrading to 0001 deletes session rows and requires
  sign-in again; users and trips remain. Rehearse only on a disposable database.
- Accessible React account controls, full-page backend-managed sign-in,
  validated current-user requests and recoverable failure states.
- Synthetic-provider/unit/PostgreSQL/React tests; setup examples, AUTH guide,
  security decisions and manual verification checklist. No paid APIs enabled.

### Testing

- Current 2026-11-19 follow-up: 368 backend tests pass, including 93 PostgreSQL cases;
  default run separately passes 275 with 93 intentional skips.
- Ruff formatting/lint and mypy app pass. Frontend lint/typecheck/build pass;
  200 Vitest cases pass across 11 files, including the existing trip form.
- PostgreSQL tests cover migrations, stable identity, session hashes, expiry,
  rotation/revocation, concurrency, CSRF and rollback.
- Google discovery/exchange/JWKS responses are synthetic; real library signature
  and claim verification runs. No real Google credentials or calls in tests.
- F1/F2 regressions pass, including gzip/deflate and concurrent first-store access.
- Human reported local Google sign-in and logout working after native PostgreSQL
  19 setup/migrations and backend restart. The agent did not observe the browser
  or capture exact HTTP/cookie/UUID details. Hosted Actions and production HTTPS remain
  unverified. UI screenshots are not attached; add safe/redacted review images
  without tokens, callback URLs or private profile data.

### Security Decisions

- Only openid email profile scopes; validate signed identity before DB writes;
  identify users by issuer/sub, never email.
- Keep Google secret/verifier server-side, discard Google tokens after use,
  and never store bearer tokens in browser storage or JSON responses.
- Store SHA-256 hashes of random 256-bit bearer/CSRF tokens. Issue cookies only
  after commit; rotate at login and revoke server-side at logout.
- Host-only HttpOnly session cookies; HTTPS Secure/__Host-, SameSite=Lax,
  seven-day absolute and 24-hour idle limits.
- Unsafe cookie-authenticated requests require session-bound CSRF proof and
  configured-origin validation. Same-origin Vite proxy; no wildcard CORS.
- Fixed configured-root success redirect; safe generic errors and code/status/
  request-ID diagnostics; callback-query and proxy-error log privacy.

### Technical Tradeoffs

- Database-backed opaque sessions make per-session revocation explicit at the
  cost of a database lookup/activity update. Signed cookies alone would not
  provide immediate individual revocation and signing would not encrypt data.
- FastAPI synchronous HTTPX/SQLAlchemy keeps the modular monolith explainable.
  A small transport adapter preserves bounds while libraries own protocol/crypto.
- React state/context suffices for the small auth snapshot; future trip server
  state retains the planned TanStack Query direction.
- Transient OAuth state is one-process and lost on restart. This PR is not a
  multi-worker/production deployment; shared durable state, rate limiting,
  retention and deployed TLS/security headers remain follow-up work.
- PR #10 will enforce owner-only trip operations. This PR adds authentication
  without trip CRUD, roles or a frontend authorization shortcut.

### Related Issues

No verified issue number supplied. Add a confirmed reference if applicable;
do not use the planned PR number as a Closes reference. Predecessor PR links
must be checked against actual repository history.

## C. Acceptance checklist

- [x] Correct feature branch and local-main comparison recorded; initial tree clean.
- [x] Diff is auth/session/UI/tests/migration/docs scope; no unrelated app changes found.
- [x] Tracked artifact paths and targeted credential formats reviewed, including feature history.
- [x] Maintained OIDC/JOSE verification, minimal scopes, state/nonce/PKCE present.
- [x] Stable issuer/sub identity, profile updates and duplicate-user races tested.
- [x] Only hashed bearer/CSRF persisted; fresh sessions/rotation/expiry/revocation tested.
- [x] Cookie flags, origin/CSRF protections, safe redirects/errors covered.
- [x] Authenticated, unauthenticated, expired, malformed and outage cases covered.
- [x] React obtains identity from backend and confirms logout; no browser token storage.
- [x] Existing trip form tests pass; trip feature files unchanged from main.
- [x] No trip CRUD, roles or unrelated infrastructure introduced.
- [x] Additive 0002, unchanged 0001, upgrade/downgrade/reupgrade/metadata tests pass.
- [x] Current backend format/lint/types and 357 tests pass.
- [x] Current frontend lint/types/build and 200 tests pass.
- [x] Existing noninteractive Actions commands/markers discover these tests.
- [x] Automated results explicitly distinguished from human report/live evidence.
- [x] F1 compressed-response fix plus regression tests and rerun completed (2026-11-19).
- [x] F2 singleton initialization fix plus concurrency regression and rerun completed (2026-11-19).
- [x] F3 stale living-guide milestone instructions reconciled (2026-11-19).
- [x] Human-reported local sign-in/logout and database setup success recorded with attribution.
- [ ] Remaining detailed live first/returning login, refresh/profile, logout/invalidation,
  invalid callback, offered consent-denial and frontend recovery observations recorded;
  blocked/not-offered cases labelled honestly.
- [ ] Safe UI review screenshots attached if publishing UI changes.
- [ ] Hosted Backend checks / Frontend checks pass on final proposed head.
- [ ] Teammate performs final auth/schema walkthrough and approves PR.
- [ ] Human explicitly authorizes any commit/push/PR creation; none done here.

## D. Limitations and follow-up ownership

**Fixed in PR #9 follow-up (2026-11-19):** F1/F2 and their missing regressions;
F3 documentation cleanup. The earlier local setup blocker was subsequently
resolved according to the human's sign-in/logout report; the manual record keeps
unreported checks separate. Hosted CI and production verification remain outstanding.

**PR #10:** derive trip owner UUID from get_current_user, never request fields;
filter parent/child access through owner-scoped queries; use non-enumerating
404 for cross-owner IDs; apply CSRF to unsafe methods; add two-user ownership
tests and intended save/reload integration. Exact contracts require PR #10 planning.

**Before deployment/public launch:** shared OAuth attempt state for multiple
workers; bounded rate limiting without invented infrastructure; expired/revoked
session retention/cleanup; account-deletion policy; real Google/HTTPS/proxy
interoperability; serving-layer CSP/security headers; intended PostgreSQL platform
and hosted CI verification. A valid cookie does not solve XSS or replace ownership.
Provider elapsed checks are cooperative, not whole-login cancellation guarantees.

## E. Architectural decisions to explain

1. Google verifies identity; Roam owns the application session lifecycle.
2. Issuer/sub is an immutable external key; email is mutable profile information.
3. Protocol/signature validation belongs to maintained libraries; app services
   apply verified-email/profile policy and atomic database persistence afterward.
4. Random opaque bearer hashes permit DB revocation without custom JWTs. CSRF
   proof is separate from HttpOnly authentication, with explicit same-origin intent.
5. One same-origin FastAPI modular monolith and PostgreSQL deployment target;
   React is a display/client layer, not an authorization boundary.

## F. Five junior SWE interview questions

1. Walk through clicking Sign in with Google to the first successful /me response.
   Where are state, nonce, PKCE verifier, Google tokens and the Roam bearer used?
2. Why use Google sub instead of email, and how does the database prevent two
   concurrent first logins from creating duplicate users?
3. Why store a hash of an opaque session token? How do rotation, idle/absolute
   expiry and logout make a copied old cookie stop working?
4. Why are SameSite=Lax and HttpOnly insufficient by themselves for CSRF/XSS?
   What does our unsafe-request dependency verify, and what will PR #10 add?
5. Which parts of our auth tests are fake and which are real? Why did all tests
   pass while final review still found the gzip and initialization bugs, and
   what regression tests would you add?
