# ADR 0011: Extend the trip client with authenticated metadata reads

- Date: 2026-11-24
- Status: implemented locally for PR #12 Milestone 2; uncommitted, review pending
- Owner: user with Codex assistance

## Problem and decision

The dashboard needs the existing owner-scoped collection/detail GETs. PR #11
already supplies a typed native-fetch trip client with runtime parsing, safe
errors, session credentials, a ten-second timeout and cancellation. Extend that
module instead of introducing another HTTP client or authentication system.

`TripSummary` describes the seven collection fields. `TripResponse` extends it
with complete metadata, preserving required nullable budget/constraints keys.
`TripListResponse` contains summaries and a required nullable `next_cursor`.
These are separate from editable `TripFormValues`, local `TripDraft`, and the
create request. Dates remain calendar strings; money remains integer minor
units, with unknown stored budgets represented by null.

Expose `listTrips(options?, signal?)` and `getTrip(tripId, signal?)`. Use the
existing relative `/api/v1/trips` path and same-origin cookies; GET does not read
the CSRF cookie. No owner ID, token storage, new URL configuration or backend
contract change is needed. Bound pagination inputs to the backend's range and
cursor syntax, but never decode a cursor or treat it as authorization. Validate
UUIDs before constructing detail paths. Server ownership checks remain decisive.

Extract the existing request lifecycle into one private trip-only helper shared
by POST and GET. Require 201 for create and 200 for reads, JSON content and
validated runtime shapes; copy only documented fields. No automatic retry is
performed. Preserve caller AbortError, bound body reading as well as fetch, and
remove timeout/listener resources on completion.

Keep `TripApiError` and its existing create messages. Read failures use fixed
load-specific messages, preserving safe codes/status/request IDs without raw
server messages or arbitrary details. Read 404 maps to RESOURCE_NOT_FOUND;
missing and other-owner trips have the same public behavior. POST's uncertain
save wording and CSRF behavior are unchanged.

## Alternatives and limits

A second client would duplicate transport/auth conventions. Separate GET effects
inside visual components would mix responsibilities. A generic app-wide HTTP
framework or auth rewrite adds unnecessary scope. A private helper in the existing
module shares only the lifecycle needed by the three current trip requests.

TanStack Query remains the planned server-state layer for the dashboard; this
milestone adds transport functions only, without cache, hooks, routing or UI.
No itinerary, itinerary-presence flag or total count exists in the read DTOs.
Concurrent changes can move trips between cursor pages; do not promise a snapshot.
Hand-maintained DTOs/parsers must be reviewed with backend contract changes until
OpenAPI generation is introduced deliberately.

## Evidence

The [existing creation tests](../../frontend/src/api/trips.test.ts) remain intact.
The [read tests](../../frontend/src/api/trips.read.test.ts) cover wire options,
pagination, runtime rejection, nullable data, privacy, errors and cancellation/
timeouts with mocked fetch. Actual check results belong in [memory](../memory.md).
No live database, Google login, browser dashboard or production proof is implied.
