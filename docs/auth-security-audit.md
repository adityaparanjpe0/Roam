# PR #9 Milestone 7 authentication audit

Date: 2026-11-17. Owner: user with Codex assistance. Scope: authentication
hardening only, on `feat/google-auth-sessions`; pending human review.
No real Google requests, real account credentials, paid services, or developer
database were used. No dependencies or schema changes are required.

## Changes, risks, tests, and limits

| Change / risk | Mitigation and affected code | Regression evidence | Remaining limitation |
|---|---|---|---|
| Ambiguous cookies can select different credentials across parsers; previous raw prefix detection missed whitespace before `=` and OAuth lacked this check. | [auth_cookies.py](../backend/app/core/auth_cookies.py) parses segments using Starlette, rejects duplicate selected names/multiple headers; [auth.py](../backend/app/api/auth.py) and [sessions.py](../backend/app/api/sessions.py) use the selected values. Callback checks old bearer and CSRF cookies before exchange. | [test_session_api.py](../backend/tests/test_session_api.py), [test_oauth_login.py](../backend/tests/test_oauth_login.py), [test_oauth_callback.py](../backend/tests/test_oauth_callback.py): whitespace/tab variants, before any provider calls. | Deliberately rejects multiple Cookie headers even if distinct; normal browser/proxy behavior must preserve one header. This does not solve XSS. |
| Unsolicited callbacks could clear a legitimate pending browser binding despite state rejection. | [auth.py](../backend/app/api/auth.py) clears flow cookies only after successful atomic flow consumption. Invalid state remains rejected. | [test_oauth_callback.py](../backend/tests/test_oauth_callback.py): missing/wrong state followed by valid callback in the same browser. | Expired/malformed bindings may remain until cookie expiry or a new initiation; they cannot authenticate. |
| Authlib treats falsy optional claims as absent, allowing malformed supplied `azp`/`at_hash`. | [google_oidc.py](../backend/app/providers/google_oidc.py) requires nonempty strings when present, then uses Authlib for meaning/comparisons and joserfc for signatures. | [test_google_identity.py](../backend/tests/test_google_identity.py): signed malformed/null/empty/bool/list claims and existing wrong-party/hash cases. | Trust still depends on maintained libraries and Google's trusted keys; no protocol/crypto replacement is added. |
| A slow response could evade the elapsed-time check while HTTPX buffered a 4096-byte chunk. | [google_oidc.py](../backend/app/providers/google_oidc.py) checks each available decoded chunk, before extending the bounded body, and includes header time. | [test_google_identity.py](../backend/tests/test_google_identity.py): deterministic 1-byte drip stream, delayed headers, early rejection and stream closure. | Blocking network reads have their own five-second timeout; elapsed checks are cooperative, not hard whole-request cancellation. Multiple sequential provider calls have separate budgets. |
| Case-sensitive HTTPS detection could issue non-Secure cookies for an accepted uppercase scheme; noncanonical origins also break exact CSRF matching. | [config.py](../backend/app/core/config.py) rejects noncanonical origins and derives Secure from parsed scheme. Canonical origin uses lowercase scheme/host and omits default ports. | [test_oauth_config.py](../backend/tests/test_oauth_config.py): matching uppercase/default-port callback rejection; existing valid localhost/HTTPS policy tests. [test_session_api.py](../backend/tests/test_session_api.py): host-only HttpOnly/Lax/Secure policy. | TLS termination and actual HTTPS browser behavior still need deployment verification. Use 127.0.0.1 consistently locally; do not mix localhost. |
| Safe responses lacked useful diagnostics, while logging raw exceptions would leak data. | [auth_logging.py](../backend/app/core/auth_logging.py), [auth.py](../backend/app/api/auth.py), [sessions.py](../backend/app/api/sessions.py): stable failure code/status and generated request ID only, correlated with error JSON and X-Request-ID. | [test_oauth_callback.py](../backend/tests/test_oauth_callback.py), [test_session_api.py](../backend/tests/test_session_api.py): exact safe log content, matching UUID, no exception/private/profile/cookie data; supplied IDs ignored. | INFO logger configuration is needed for expected rejections. This is not full structured observability, log retention, or a sanitizer for arbitrary third-party debug loggers. |
| Google outage was incorrectly labelled denied consent. | [auth.py](../backend/app/api/auth.py) distinguishes access_denied, temporary/server failure, unknown/invalid response after state consumption; never reflects description or redirects to error_uri. | [test_oauth_callback.py](../backend/tests/test_oauth_callback.py): correct 400/503 codes, no exchange/persistence, no reflected description, consumed attempt cannot replay. | Failures remain safe JSON on the callback page; dedicated callback recovery UI is not added. Users restart sign-in manually. |

## Full audit coverage

Existing controls are retained unless identified above. Test references include
existing regression coverage; an audit result does not imply every control was
newly implemented here.

| Requested area | Result and evidence |
|---|---|
| Missing/invalid/expired/replayed state | Browser-bound hash lookup, constant-time state comparison, ten-minute expiry, atomic consume before exchange. [Flow tests](../backend/tests/test_oauth_flow.py) and [callback tests](../backend/tests/test_oauth_callback.py) cover replay, expiry, mismatches, duplicate query fields and concurrent consumption. Unbound callbacks now preserve pending browser binding. |
| Nonce | Authlib checks saved nonce against verified ID token, including missing/wrong nonce and nonce_supported=false. [Identity tests](../backend/tests/test_google_identity.py). |
| Issuer/signature/audience/expiry | RS256 allowlist, fixed trusted discovery/JWKS, canonical/legacy Google issuer validation, expected client audience/authorized party, exp/iat/nbf with 30-second skew, strict verified email. Real signed fixtures test failures, algorithm/header injection and key rotation in [identity tests](../backend/tests/test_google_identity.py). |
| Consent denial | State consumed before safe consent error; provider text never reflected, no user/session writes. Callback tests. |
| Token exchange / timeout | Library authorization-code exchange with verifier, backend client secret, fixed endpoints/no redirect/no retries, bounded HTTPX; failed responses cannot authenticate. Identity and callback tests, including slow streaming fix. |
| Missing/forged/revoked/expired sessions | Exact 43-character bearer format, SHA-256 lookup, 24-hour idle and seven-day absolute expiry, revocation/future-date checks, generic 401. [Session security tests](../backend/tests/test_session_security.py), [PostgreSQL session tests](../backend/tests/integration/test_application_sessions.py). |
| Fixation / renewal | Fresh 256-bit bearer and separate CSRF token after each successful authentication; transaction revokes presented prior bearer. No session cookie before commit. PostgreSQL session tests cover rotation, other-browser isolation and rollback. |
| CSRF | Unsafe dependency requires session-bound cookie/header hashes and exact Origin, or same-origin Referer only if Origin absent. Duplicate security headers rejected. Bad CSRF does not refresh idle time. Session security/API/PostgreSQL tests. |
| CORS | Relative same-origin fetch through Vite; no backend CORS grants, no wildcard credentials. Session API tests prove foreign preflight gets no permission and valid-token foreign-origin logout gets 403. CORS is not an authorization control for non-browser clients. |
| Cookies | Host-only Path=/, HttpOnly bearer/flow, Lax, finite expiry, HTTPS __Host-/Secure; separate readable CSRF delivery cookie. Settings now reject noncanonical origins. Cookie API/config tests. No localStorage/sessionStorage bearer or Google token. |
| Open redirects | Fixed configured app root; callback return_to/next/Host/forwarded headers cannot choose a destination. Callback test covers hostile parameters/headers on success and error_uri on failure. |
| Safe errors | Fixed Pydantic envelope, generic 401, no session secret in JSON, no cookie issuance on unsuccessful auth. Failure classification and request-ID tests. |
| Logging | Uvicorn callback query scope removed, including trailing-slash path; Vite proxy errors sanitized and DEBUG serving rejected. New auth diagnostics exclude exception text, identity and credentials. Callback/logging tests. External proxy/logging configuration must independently follow the policy. |
| Database outages | Profile/session issue/prior revocation commit together; SQLAlchemy/config failures map to safe 503. Lookup/logout outage does not claim signed-out success or clear valid cookies. [Boundary tests](../backend/tests/test_session_failures.py), session API outage tests and PostgreSQL rollback/race tests. |

## Verification and deployment limits

Results are recorded after the final verification run in [memory.md](memory.md).
All provider tests use fake transports or signed synthetic fixtures. PostgreSQL
tests use an isolated disposable native PostgreSQL 17.0 UTC cluster; CI targets
PostgreSQL 18.7. The local run does not substitute for hosted CI.

Single-process flow state is bounded to 256 live attempts and lost on restart;
multi-worker deployment requires shared durable state before use. There is no
new rate limiter, session cleanup worker, production serving layer/CSP, or account
deletion/retention implementation. Expired/revoked database rows cannot sign in
while retained. No live Google consent, production HTTPS, reverse-proxy logging,
or deployed security headers were verified. Do not disable checks to work around
configuration errors. Milestone 8 remains unstarted.

Library behavior was cross-checked with primary documentation:
[Starlette cookies](https://starlette.dev/requests/#cookies),
[Authlib ID token claims](https://docs.authlib.org/en/latest/oauth2/specs/oidc.html).
The installed pinned libraries and executable tests determine this branch's behavior.
