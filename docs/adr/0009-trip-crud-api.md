# ADR 0009: Owner-scoped trip metadata API

- Date: 2026-11-20
- Status: accepted plan; Milestone 1 implemented on `feat/trip-crud-api`
- Owner: user with Codex assistance; teammate review pending

## Problem and decision

The frontend can review an unsaved draft, and authentication can identify a
verified user, but neither creates or authorizes a saved trip. Add synchronous
REST operations under `/api/v1/trips` using the existing PostgreSQL schema,
session dependency, SQLAlchemy engine and small service/repository modules.
This matches the existing architecture without a generic repository framework.

Milestone 1 implements POST plus collection/detail GET. PATCH and DELETE remain
unimplemented until separately approved milestones. There is no frontend wiring,
itinerary generation, provider request, schema migration, or new dependency.

## Authentication and ownership

Reuse `get_current_user`: it validates the opaque Roam session, and POST also
requires the session-bound CSRF cookie/header and trusted Origin/Referer. A
client's `owner_id` is forbidden input. New trips use the verified user's UUID.
Every list/detail query filters by owner; detail additionally filters by trip ID.
Missing and other-owner records both return 404 `RESOURCE_NOT_FOUND`, with the
same public message/details and independent generated request IDs.

Authentication and trip operations use separate short transactions, following
the existing auth service pattern. This does not cancel an already-authorized
in-flight request when logout races it. Services own commit boundaries. The DTO
is assembled while the session is open, but returned only after commit succeeds.
Failure rolls back; no detached ORM objects or SQL exceptions cross HTTP.

## Initial input policy

Use the current form's positive USD budget and eight interest IDs. Monetary
amounts are strict integer cents, from 1 through 100,000,000 per person for the
entire trip; booleans, floating-point values and numeric strings are rejected.
Travelers are strict integers 1–20. Exact Gregorian dates allow past trips and
1–14 inclusive days. Interests must be unique, with 1–8 entries.

Destination text is trimmed/nonempty and bounded to 200 characters. An optional
title is trimmed/nonempty and bounded to 120; omitted/null title defaults to the
first 120 destination characters. Constraints allow null or up to 4000 characters
before trimming; whitespace-only text becomes null. NUL and invalid Unicode are
rejected at validation, not reported as DB outages. Unknown fields, including
owner, version, status, provider IDs and arbitrary preferences, are forbidden.
Server defaults supply draft status, version 1 and versioned empty preferences.

Require an explicit supported IANA timezone instead of guessing from a city or
using the browser timezone. The frontend does not collect it yet: the integration
PR must supply it deliberately. Standard-library timezone data works locally;
psycopg already includes the `tzdata` fallback on Windows in the existing lock.
No timezone/provider lookup service is added.

Database checks remain defense in depth. Their nullable/nonnegative money policy
is intentionally broader than the HTTP create policy; existing unknown budgets
are returned as null. Python/PostgreSQL text bounds count characters, whereas
the existing frontend uses UTF-16 limits; frontend-accepted text fits the backend
bounds. The initial applied migration is not rewritten.

## Read contract and pagination

Detail returns metadata only, not nonexistent route/validation/report structures.
List returns compact summaries, default 20 and maximum 100. Order is
`updated_at DESC, id ASC`, matching the existing owner/order index. The repository
fetches at most `limit + 1` and does not load relationships or count all records.

The URL-safe base64 JSON cursor contains version 1, an aware timestamp preserving
microseconds, and a UUID. Validate size (maximum 512 characters), shape, version,
timestamp and UUID. It is opaque presentation, not encrypted or an authorization
token; altering or reusing it never removes the query's owner filter. Cursor
signing is unnecessary for this access boundary. Ordering is deterministic for
unchanged data; concurrent updates can move records between pages. Snapshot
pagination is not promised.

## Errors and contracts

Share the existing error envelope; retain auth's OpenAPI model names and existing
wire shape. Detail values may now include safe integers for later version
conflicts. Business API request validation gets a generated request ID, stable
code, allowlisted field names and fixed messages, without echoing private input,
unknown key names, Pydantic exception text or SQL. Validation handling outside
`/api/v1/` retains the existing FastAPI behavior. Existing session errors and
cookie clearing remain unchanged. Private success/error responses use no-store.

There is no generated frontend client today. FastAPI generates the OpenAPI
contract; tests cover its routes/models. The approved no-frontend scope defers
TypeScript generation/integration rather than introducing tooling here.

## Later approved milestones — not implemented here

PATCH will merge explicitly supplied fields, validate the effective state, lock
the owned row, require the client's version and increment it atomically. Metadata
changes affecting an existing itinerary will be guarded rather than silently
rewriting days/activities. DELETE will require a version and reject removal of
locked activities. Those guards and concurrency behavior are not claimed by
Milestone 1. Repeated POSTs intentionally create distinct UUIDs; idempotency keys
remain required only for the planned generation/replan operations.

## Alternatives and verification

Offset pagination is initially simpler but becomes expensive/deletion-sensitive
at large offsets; the existing index makes a small cursor implementation useful
now. Returning ORM objects would couple HTTP to storage/lazy loading; explicit
DTOs constrain disclosure. Raw SQL would duplicate the existing ORM/session
infrastructure. No new generic layers are justified.

Use isolated PostgreSQL HTTP tests with two real application sessions and CSRF,
plus schema/error tests without a database. Verify commit visibility, rollback,
cross-owner responses, cursor boundaries and request/log redaction. Evidence is
recorded in [memory](../memory.md); hosted CI and teammate review are separate.
