# ADR 0010: Authenticated trip creation from the existing review flow

- Date: 2026-11-21
- Status: accepted through human plan approval; Milestone 1 client implemented,
  UI integration and manual persistence verification remain planned
- Owner: user with Codex assistance; teammate review pending

## Decision and current boundary

Connect the existing form/review to POST `/api/v1/trips` without changing OAuth,
the database schema, backend CRUD, or the navbar. Milestone 1 adds only the typed
[trip client](../../frontend/src/api/trips.ts), shared CSRF reader, and mocked HTTP
tests. The mounted form still makes no save request. Its timezone field, explicit
Save action and server-confirmed screen belong to Milestone 2; full manual
verification and final instructions belong to Milestone 3.

Use native fetch for this one explicit mutation. This is a narrow, human-approved
exception to AGENTS' default TanStack Query direction for future trip server
state. There is no query cache, dashboard/list synchronization, or background
refetch to manage here. Reconsider TanStack Query for PR #12's saved-trip queries.
Do not add Axios, a generic client framework, a router, or a new dependency now.

## Existing HTTP and authentication contract

Use a relative `/api/v1/trips` URL with same-origin credentials, no-store,
JSON Accept/Content-Type and X-CSRF-Token. The existing Vite `/api` proxy targets
FastAPI on loopback port 8000 and preserves Origin/cookies. No frontend URL
environment variable or CORS grant is needed. Production same-origin asset
serving remains planned, not implemented by this client.

Reuse auth's existing CSRF reader: `roam_csrf` on local HTTP and
`__Host-roam_csrf` on HTTPS. Missing, ambiguous or malformed CSRF cookies prevent
the POST. The client never reads Roam's HttpOnly bearer, stores a token, or sends
an owner ID. FastAPI identifies the owner through its existing verified session
dependency and enforces session-bound CSRF/origin checks independently.
Reject redirects for trip creation so a redirected request cannot forward the
trip body or CSRF header elsewhere. OAuth redirect navigation is unchanged.

Allowlist request properties even though TypeScript describes the expected
shape: structural typing permits extra properties at runtime. Omit undefined
optional fields. Require HTTP 201, JSON and a validated TripResponse shape;
explicitly copy only documented response fields. Types match the current
[Pydantic contract](../../backend/app/schemas/trips.py); the response budget stays
nullable for legacy records. Runtime checks establish usable primitive types,
safe integers, UUID/calendar/audit formats and storage text bounds; they do not
replace backend business validation. No OpenAPI change or generator dependency
is introduced. Review these hand-maintained types/tests when the backend changes.

## Failures, privacy and delivery limits

Use stable TripApiError codes for authentication, CSRF, validation, known
configuration/storage outages, generic HTTP/server failures, invalid responses,
network failures and timeouts. HTTP status remains useful when a proxy returns
HTML or malformed JSON. Recognized 422 detail fields become fixed frontend
messages; server messages, arbitrary keys/values and raw exceptions are never
returned to presentation code. Copy only a validated UUID request ID from a
matching error envelope. Do not log cookies, payloads, provider values or errors.

One call sends at most one POST. A ten-second timer bounds fetch/body reading;
caller cancellation stays AbortError and cleanup removes timers/listeners.
There is no automatic retry. The current POST is not idempotent: network loss,
timeout, malformed success or cancellation can occur after a committed insert.
Messages must not claim those failures prove nothing was saved. Disabling a
button in Milestone 2 prevents repeated clicks, not duplicates across retries,
tabs or a lost response. Aborting a request does not roll back a server commit.

## Approved next milestones (not implemented here)

- Keep form → review, then add an explicit authenticated Save trip action.
- Collect a destination IANA timezone explicitly, initially blank; do not guess
  from a city or use the browser zone. Omit optional title and use backend default.
- Map existing dates as calendar strings, dollars as integer cents, traveler
  count as an integer, the eight interest IDs, and trimmed/null constraints.
- Preserve editable values on rejection; use loading, inline/general errors,
  accessible feedback/focus, immediate in-flight and stale-account guards.
- Show canonical saved response data without inventing a trip page/dashboard.
  A refresh can clear the confirmation while the database record remains.
- Retain the warning that full-page Google sign-in clears unsaved in-memory data.
- Validate with mocked frontend HTTP, existing backend regressions and manual
  local create → refresh → authenticated GET plus cross-owner 404 verification.

## Alternatives and evidence

Direct fetch inside the component mixes transport/auth parsing with UI state.
A shared generic request framework would require broader auth refactoring for
one endpoint. A small separate client and shared existing CSRF reader preserve
the established auth behavior and keep each boundary explainable.

Automated tests cover exact wire data, extra-field filtering, HTTP/HTTPS CSRF,
status/error parsing, privacy, runtime response rejection, cancellation and
timeouts without live requests. Actual commands/results are recorded in
[memory](../memory.md). Tests do not claim browser login or database persistence
through the UI until those boundaries are implemented and manually verified.
