# Trip metadata API — Milestones 1–3

Implemented on `feat/trip-crud-api`: create, list, retrieve, partially update,
and safely delete an owned trip. PR #11 Milestone 2 wires frontend creation;
Milestone 3 verifies real HTTP/PostgreSQL with synthetic session identities.
The separate live-Google smoke check remains human work. Itinerary endpoints remain planned.
See [ADR 0009](adr/0009-trip-crud-api.md) for decisions and rollback/security limits.

## Prerequisites and data flow

Follow [backend setup](../backend/README.md) and [authentication setup](AUTH.md).
PostgreSQL must be reachable at the configured runtime `DATABASE_URL` and have
migration `0002`. This milestone adds no schema migration and does not run
migrations automatically. The form collects an explicit timezone and offers
authenticated Save after review; see [the form flow](trip-creation-form.md).

Request → existing verified session/CSRF dependency → synchronous trip service
transaction → owner-scoped SQLAlchemy query → PostgreSQL → Pydantic response.
Google is not contacted by these endpoints. Authentication identifies the user;
the owner filter authorizes which trips that user can access.

## Endpoints

| Method | Path | Success |
|---|---|---|
| POST | `/api/v1/trips` | 201, complete metadata, relative `Location` header |
| GET | `/api/v1/trips?limit=20&cursor=…` | 200, summaries and nullable next cursor |
| GET | `/api/v1/trips/{trip_id}` | 200, complete metadata |
| PATCH | `/api/v1/trips/{trip_id}` | 200, version-checked updated metadata |
| DELETE | `/api/v1/trips/{trip_id}` | 204, empty body after committed deletion |

All require the Roam session cookie. POST/PATCH/DELETE also require the matching readable
CSRF cookie and `X-CSRF-Token`, and a trusted browser Origin/Referer. Session
cookie names remain `roam_session` / `roam_csrf` for local HTTP and `__Host-`
prefixed on HTTPS. Cookies are sent by the browser, not copied into request JSON.
Do not paste cookie/token values into shared terminals, logs or issue reports.
Responses contain no owner identity, cookies, provider data or ORM relationships.
All trip success responses have `Cache-Control: no-store`.

### Create

```json
{
  "title": "Lisbon spring break",
  "destination_label": "Lisbon, Portugal",
  "timezone": "Europe/Lisbon",
  "start_date": "2027-03-27",
  "end_date": "2027-03-30",
  "traveler_count": 2,
  "budget_per_person_minor": 75050,
  "currency": "USD",
  "interests": ["food", "culture"],
  "free_text_constraints": "A relaxed pace"
}
```

Only title and constraints may be omitted/null. Default title is the first 120
characters of the trimmed destination. Dates must be exact real `YYYY-MM-DD`
values, 1–14 inclusive days, including past dates. Travelers: integer 1–20.
Budget: integer 1–100,000,000 USD cents per person for the whole trip. Numeric
strings, booleans and floating-point values are rejected for these integers.
Destination/title limits are 200/120 characters after trimming; constraints are
bounded to 4000 before trimming and whitespace-only normalizes to null.
Invalid Unicode and NUL characters are rejected rather than reaching PostgreSQL.

Timezone must be a supported IANA name; no inference is performed. Interests
require 1–8 unique IDs from `food`, `sightseeing`, `outdoors`, `nightlife`,
`shopping`, `culture`, `adventure`, `relaxation`. Unknown fields are rejected.
No request may set owner, status, version, timestamps, provider ID or preferences.
Server values start at `draft` / version 1; no itinerary rows are created.

Example 201 body (also the detail response shape):

```json
{
  "id": "95bc33a8-2238-4467-9660-cc60f760826d",
  "title": "Lisbon spring break",
  "destination_label": "Lisbon, Portugal",
  "timezone": "Europe/Lisbon",
  "start_date": "2027-03-27",
  "end_date": "2027-03-30",
  "traveler_count": 2,
  "budget_per_person_minor": 75050,
  "currency": "USD",
  "interests": ["food", "culture"],
  "free_text_constraints": "A relaxed pace",
  "status": "draft",
  "version": 1,
  "created_at": "2026-11-20T14:00:00Z",
  "updated_at": "2026-11-20T14:00:00Z"
}
```

`Location: /api/v1/trips/95bc33a8-2238-4467-9660-cc60f760826d` identifies the
created resource. Existing stored unspecified budgets remain readable as null;
new creates require a positive budget. Repeated POSTs create different trips.

### List and detail

List requires `limit` between 1 and 100 (default 20). Order is updated time
descending, then UUID ascending. Each summary includes only `id`, `title`,
`destination_label`, `start_date`, `end_date`, `version`, and `updated_at`:

```json
{"items": [], "next_cursor": null}
```

When `next_cursor` is non-null, send it unchanged as the next request's `cursor`.
The opaque cursor is bounded/validated, not a permission grant. All pages retain
the current owner's filter. Concurrent updates can move records between pages;
there is no snapshot guarantee or expensive total-count query. Detail exposes
metadata only; fetching it does not generate or load an itinerary.

### Partial update

```http
PATCH /api/v1/trips/95bc33a8-2238-4467-9660-cc60f760826d
Content-Type: application/json
X-CSRF-Token: <session-bound value>
```

```json
{
  "base_version": 1,
  "traveler_count": 3,
  "free_text_constraints": null
}
```

Use the version from the last detail/read/create response. `base_version` is a
required strict positive integer fitting PostgreSQL's integer version column.
Supply at least one metadata field; an empty object or version alone returns 422.
The editable fields are title, destination label, timezone, dates, travelers,
budget, currency, interests and constraints. Owner, status, version, timestamps,
provider ID and preferences remain server-controlled/forbidden request fields.

Omitted fields retain their stored values. Explicit null is allowed only for
constraints, where it clears the value; whitespace-only constraints also clear.
Other fields keep create's type/length/allowlist rules. PATCH does not regenerate
the title when destination changes. Explicit budget updates must be positive
integer cents; an untouched legacy null budget stays unknown, never zero.

The service locks the owned trip row, compares its version, and validates the
complete merged metadata before modifying anything. For example, changing only
start_date still checks the stored end_date and the 14-day inclusive bound.
Other invalid legacy metadata must be repaired to the current API rules before
an update can succeed; PATCH is not a blanket validator bypass for stored data.
On a successful nonempty PATCH, version increments exactly once and updated_at
refreshes, including when the supplied values equal the old values. Created_at,
owner and omitted fields remain unchanged. The 200 body is the same complete
metadata shape as detail, with `Cache-Control: no-store`.

If the supplied version is stale, return 409 `VERSION_CONFLICT` with safe integer
`details.current_version`. Retrieve the current trip before intentionally
reapplying edits; do not blindly replace the version and retry an old patch.
Two concurrent updates based on version 1 produce one 200/version 2 and one 409.
Missing/other-owner UUIDs return the same 404 before exposing a current version.

If any trip-day record exists, **only title may be supplied**. Other metadata
updates return 409 `TRIP_HAS_ITINERARY`, even if a supplied value equals its stored
value. This conservative guard avoids changing dates, budget, location or
constraints without an itinerary revalidation engine. Title edits leave all
day/activity records, including locked activity fields, unchanged. No itinerary
rows are deleted, regenerated, unlocked or rescheduled by PATCH.

Every check and write occurs in one short transaction. The row lock is released
on commit/rollback, never held while the user edits or during provider calls.
Future itinerary writers must coordinate on the parent trip/version as well.
SQL failures return sanitized 503; failed validation/conflicts/commits do not
persist values, timestamps or version changes. Authentication's own last-seen
transaction remains separate, as documented in the ADR.

### Permanent deletion

```http
DELETE /api/v1/trips/95bc33a8-2238-4467-9660-cc60f760826d
If-Match: "2"
X-CSRF-Token: <session-bound value>
```

Send no JSON body. `If-Match` is required: exactly one quoted decimal version
between 1 and 2,147,483,647, without leading zeros. Missing, duplicate, bare,
weak (`W/"2"`), wildcard and multi-value headers return 422. Use the version from
the last read; this API uses its documented 409 version-conflict envelope rather
than HTTP 412. There is no ETag response or general HTTP conditional-request support.

Within one transaction, lock the owner-filtered trip, check the version, check
for locked activities, then delete. Missing/other-owner trips return the same
404 before version disclosure. An owned stale version returns 409 VERSION_CONFLICT.
Any locked activity returns 409 LOCKED_ACTIVITY; no trip, day or activity changes.
There is no force-delete or unlock endpoint in this PR. Future itinerary/lock
writers must acquire the parent trip lock and enforce its version before mutation.

For an allowed deletion, existing PostgreSQL foreign keys cascade to the trip's
days and activities. Users and other trips survive. This is permanent removal,
not archival. Success is 204 with no JSON body and `Cache-Control: no-store`,
only after commit. SQL/commit failures return safe 503 and roll back all cascades.
A repeated DELETE returns 404; it does not recreate the resource or repeat work.

### Failures

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired/revoked session |
| 403 | `CSRF_FAILED` | Unsafe request lacks valid session-bound proof/origin |
| 404 | `RESOURCE_NOT_FOUND` | Missing or other-owner trip, identical public behavior |
| 422 | `VALIDATION_FAILED` | Invalid body, UUID, cursor, limit or If-Match header |
| 409 | `VERSION_CONFLICT` | Supplied mutation version is stale; details contains current_version |
| 409 | `TRIP_HAS_ITINERARY` | Non-title fields supplied for a trip with day records |
| 409 | `LOCKED_ACTIVITY` | Deletion would remove a protected activity |
| 503 | `DATABASE_UNAVAILABLE` | Authentication storage or trip persistence unavailable |
| 503 | `AUTH_NOT_CONFIGURED` | Existing authentication-origin settings invalid |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Check the request fields.",
    "request_id": "<server-generated UUID>",
    "details": {"traveler_count": "Use an integer."}
  }
}
```

`X-Request-ID` matches the JSON ID. Errors use no-store. Details use fixed safe
messages/allowlisted field names, not submitted values or SQL. Correlate safe
code/status/request-ID logs without enabling body/cookie/SQL-parameter logging.

## TypeScript read client

PR #12 Milestone 2 extends the [existing client](../frontend/src/api/trips.ts)
from PR #11; it does not mount a dashboard or change the backend contract.

```ts
import { getTrip, listTrips } from './api/trips'

const controller = new AbortController()
const page = await listTrips({ limit: 20 }, controller.signal)
// Follow page.next_cursor with listTrips({ limit: 20, cursor: page.next_cursor }, signal).
// A detail link supplies its stable UUID; no user/owner ID is accepted.
if (page.items[0]) {
  const trip = await getTrip(page.items[0].id, controller.signal)
  // Render canonical trip metadata; a null budget is unknown, never zero.
}
// Cancel outstanding work during cleanup with controller.abort().
```

The optional list options are `limit` (1–100; omission uses server default 20)
and `cursor` (omitted/null means first page). Follow a cursor only when non-null;
pass it unchanged. The client bounds syntax/length without decoding it. Queries
allowlist those two fields. Detail IDs must be UUID strings. Invalid client
arguments reject with VALIDATION_FAILED before fetch; the server remains
authoritative.

TripSummary contains only the seven documented list fields. TripResponse adds
the metadata shown above; all its fields are present, but budget and constraints
may be null. A missing nullable key is malformed, not equivalent to null.
Calendar dates/audit timestamps remain strings and budgets remain integer cents.
TripFormValues are editable strings and TripDraft is a local validated snapshot;
neither represents a persisted record. A saved response additionally has its
server-assigned ID, title, status, version and timestamps. Itinerary fields are
not part of either read response.

GET uses relative URLs and `credentials: 'same-origin'`, with JSON Accept,
no-store and redirect rejection. Browser-managed session cookies authenticate
the request. Reads do not access the CSRF cookie, store tokens or send owner IDs;
FastAPI's session dependency and owner-filtered query enforce access.

Both functions require 200 and validate JSON at runtime before copying documented
fields. They share the existing trip client's ten-second fetch/body deadline and
accept AbortSignal; cancellation rejects with AbortError. No automatic retry is
performed. TripApiError retains safe code/status/validated request ID and fixed
load-specific messages. A read 404 means RESOURCE_NOT_FOUND for both missing and
other-owner resources. Read failures do not imply a write occurred. Existing
create errors and their uncertain-save wording remain unchanged.

Focused mocked-fetch regression command from `frontend/`:

```sh
npm run test -- --run src/api/trips.test.ts src/api/trips.read.test.ts
```

See [ADR 0011](adr/0011-saved-trip-read-client.md) for tradeoffs and limits.

## Verification

For complete local startup, UI save/refresh/ownership checks and troubleshooting,
use the [trip integration runbook](runbooks/trip-creation-integration.md). Its
evidence distinguishes real PostgreSQL/session verification from Google login.

From `backend/`, run focused tests:

```sh
uv run --locked pytest tests/test_trip_schemas.py tests/test_trip_api_errors.py
uv run --locked pytest tests/test_trip_patch_schemas.py
uv run --locked pytest tests/test_trip_delete_api.py
uv run --env-file ../.env --locked pytest --run-db-tests tests/integration/test_trip_crud_api.py
uv run --env-file ../.env --locked pytest --run-db-tests tests/integration/test_trip_patch_api.py
uv run --env-file ../.env --locked pytest --run-db-tests tests/integration/test_trip_delete_api.py
```

The database command requires an explicit local maintenance
`TEST_DATABASE_ADMIN_URL`, never the development `DATABASE_URL`. Existing fixtures
create/drop only registered UUID-named scratch databases; do not substitute
SQLite, clear development tables or remove a Docker volume.

For manual use, start PostgreSQL and FastAPI as described in the backend guide,
and sign in at `http://127.0.0.1:5173/`. Inspect schemas at backend `/docs` and
`/openapi.json`. Authenticated read requests can be tried in `/docs`. Its port
8000 origin does not satisfy the configured 5173 origin for writes; do not
weaken CSRF or change Google callback registration to bypass that restriction.

A local-only POST can be issued from the browser console while on Roam's 5173
origin, reading the CSRF cookie in memory rather than printing/copying it:

```js
const csrf = document.cookie.split('; ').find(row => row.startsWith('roam_csrf='))?.slice('roam_csrf='.length)
const response = await fetch('/api/v1/trips', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf ?? '' },
  body: JSON.stringify({
    destination_label: 'Lisbon, Portugal', timezone: 'Europe/Lisbon',
    start_date: '2027-03-27', end_date: '2027-03-30', traveler_count: 2,
    budget_per_person_minor: 75050, currency: 'USD', interests: ['food'],
  }),
})
console.log(response.status, await response.json())
```

This intentionally creates a real owned development trip. Use synthetic data,
do not print `csrf`, and do not run it merely to inspect schemas. Browser-supplied
Origin and the HttpOnly session cookie accompany the request. The example is
local HTTP only; production HTTPS cookie names differ. Repeat detail/list reads
using the returned ID; another account must receive 404 for that ID and never
see it in its list. PR #11's frontend review now offers authenticated Save;
a dashboard remains planned after PR #12's read-client milestone.

To manually update a synthetic owned development trip from Roam's 5173 origin,
use the same cookie/header approach with `method: 'PATCH'`, the returned trip ID,
and JSON such as `{base_version: 1, title: 'Updated plan'}`. Expect 200/version 2;
resending version 1 must return 409 without overwriting. Test another account's
ID for 404. These checks mutate development records; use the isolated automated
tests for rollback, concurrency and adversarial fixtures instead.

Only if you intentionally want to permanently remove a synthetic development
trip, use `method: 'DELETE'`, no body, and headers containing the same CSRF proof
plus `'If-Match': '"2"'` (replace 2 with its current version). Expect 204 with an
empty body; do not call `response.json()` on it. Verify a subsequent GET returns
404. Use automated scratch-database tests for locked activities/cascades; never
seed or delete normal development records merely to run destructive tests.
