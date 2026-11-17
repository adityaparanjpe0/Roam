# ADR 0001: A small relational schema with explicit migrations

- Date: 2026-11-17
- Status: accepted for PR #7's approved schema milestone; implementation on branch
- Owner: Aditya, with Codex assistance; teammate walkthrough/review pending

## Problem and decision

Roam needs durable ownership and itinerary records before adding trip APIs.
Use synchronous SQLAlchemy 2.x with psycopg and PostgreSQL, and manage schema
versions with Alembic. Keep the existing pooled engine and explicit transaction
pattern. ORM models represent storage; future Pydantic models will validate HTTP
requests/responses. No ORM object is exposed through an endpoint in this change.

The initial revision creates only `users`, `trips`, `trip_days`, and `activities`.
Sessions, provider references, route legs, revisions, planner runs, and usage
counters remain future migrations. In particular, activities currently accept
only `user_entered` origin; `place_reference_id` and `provider_grounded` must
arrive together with the provider-reference schema. This prevents claiming
provider grounding without a referenced record.

## Schema details

All four tables use application-generated UUID primary keys. Users, trips, and
activities have non-null `timestamptz` creation/update audits with PostgreSQL
`now()` defaults. SQLAlchemy sets `updated_at` on updates; direct SQL must do so
explicitly. There is no update trigger. PostgreSQL stores instants, and clients
render them in the trip timezone. Audit defaults use transaction time.

| Table | Storage and limits | Relationships / indexes |
|---|---|---|
| `users` | Required issuer (2048 chars), subject (255), normalized lowercase trimmed email (254); optional display name (120) | Unique issuer/subject pair; email is deliberately not unique or an ownership key |
| `trips` | Required title (120), destination label (200), timezone (64), inclusive dates (1–14 days), travelers (1–20), uppercase three-letter currency; optional provider ID (512), budget and free text (4000) | Required owner FK with `RESTRICT`; index `(owner_id, updated_at DESC, id)` supports owner-scoped listing |
| `trip_days` | Required local date; optional summary (500) | Required trip FK with `CASCADE`; unique `(trip_id, local_date)` also supplies its lookup index |
| `activities` | Required title (120), category, start/end instants; notes optional (2000); nonnegative order defaults 0, lock defaults false | Required day FK with `CASCADE`; index `(trip_day_id, starts_at, sort_order)` supports daily schedules |

Nonempty text checks apply to issuer, subject, email, trip title/destination/
timezone, and activity title. Other textual bounds are enforced by `varchar(n)`.
Trip status is `draft` (default), `ready`, or `archived`; version starts at 1
and must remain positive. This stores a version; concurrency control is future
service logic, not an automatic version increment in this schema.

Budgets and activity estimates use nullable nonnegative `bigint` minor units
per person, in the trip currency. `NULL` means unknown/unspecified; zero means
a known zero. Activity cost confidence must be `unknown` with NULL or `user`
with a known amount. Provider/model confidence values remain deferred.

Categories initially allow `sightseeing`, `food`, `culture`, `outdoors`,
`shopping`, and `other`. Named text CHECK constraints are easy to change in a
later migration; PostgreSQL native enums would require extra enum lifecycle
handling without helping this initial slice.

Trip JSONB defaults: `interests=[]`, `preferences={"schema_version": 1}`.
Interests must be an array with at most 20 entries and 2048 serialized bytes;
preferences must be an object containing version 1 and at most 8192 serialized
bytes. These are storage guards, not full semantic validation: tag allowlists,
element types, allowed preference keys, IANA timezone validity, actual ISO
currency membership, cross-row day boundaries, scheduling, locked-field
protection, and owner authorization must be enforced before exposing write APIs.
Assign new JSON lists/dicts when updating them; in-place JSON mutation tracking
is intentionally not configured.

Deleting a trip cascades through days and activities at the database level.
Deleting a user with trips is rejected until an explicit account deletion policy
exists. Ownership has a foreign key now; it does not itself prevent cross-user
reads. Future queries must include owner ID and resource ID.

## Alternatives and consequences

- Raw SQL would avoid ORM mapping but repeat relationship/session plumbing.
  SQLAlchemy retains explicit SQL and PostgreSQL constraints while supplying
  typed mappings and transactions. Inspect generated queries when adding APIs;
  these default lazy relationships do not solve N+1 loading automatically.
- NoSQL would make foreign keys, atomic related writes, and relational ownership
  less direct. PostgreSQL fits these access paths; JSONB handles small preferences.
- Async SQLAlchemy adds async driver/session rules. The synchronous baseline
  matches current architecture; reconsider only after measured concurrency needs.
- Creating all tables at startup loses reviewed, versioned change history.
  Alembic runs separately and imports all model metadata. Applied revisions are
  immutable; future changes get new revisions.

The initial downgrade removes all four tables and their data. Rehearse it only
on disposable databases. It is not a production rollback strategy. Production
still needs tested backups/restores, role separation, deployment secrets/TLS,
and staged migrations appropriate to real data. Milestone 3 configures CI
migration tests using an independent disposable PostgreSQL service; a hosted
run is still required to verify GitHub orchestration.

## Evidence

The PostgreSQL tests apply Alembic to empty owned scratch databases, exercise
relationships, invalid values, uniqueness and foreign keys, and rehearse upgrade
→ downgrade → upgrade. `alembic check` compares metadata, including server
defaults, after migration. Autogenerate/check does not detect every possible
CHECK-constraint change; behavioral tests and migration review remain required.
See [migration tests](../../backend/tests/integration/test_migrations.py),
[model tests](../../backend/tests/integration/test_models.py), and the dated
results in [memory](../memory.md).
