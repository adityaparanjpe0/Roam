# Trip metadata API — Milestone 1

Implemented on `feat/trip-crud-api`: create, list, and retrieve an owned trip.
PATCH/DELETE, itinerary endpoints and frontend save integration remain planned.
See [ADR 0009](adr/0009-trip-crud-api.md) for decisions and rollback/security limits.

## Prerequisites and data flow

Follow [backend setup](../backend/README.md) and [authentication setup](AUTH.md).
PostgreSQL must be reachable at the configured runtime `DATABASE_URL` and have
migration `0002`. This milestone adds no schema migration and does not run
migrations automatically. The local trip form still reviews unsaved data only.

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

All require the Roam session cookie. POST also requires the matching readable
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

### Failures

| HTTP | Code | Meaning |
|---|---|---|
| 401 | `AUTHENTICATION_REQUIRED` | Missing/invalid/expired/revoked session |
| 403 | `CSRF_FAILED` | Unsafe request lacks valid session-bound proof/origin |
| 404 | `RESOURCE_NOT_FOUND` | Missing or other-owner trip, identical public behavior |
| 422 | `VALIDATION_FAILED` | Invalid body, UUID, cursor or pagination limit |
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

## Verification

From `backend/`, run focused tests:

```sh
uv run --locked pytest tests/test_trip_schemas.py tests/test_trip_api_errors.py
uv run --env-file ../.env --locked pytest --run-db-tests tests/integration/test_trip_crud_api.py
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
see it in its list. The frontend form itself still does not save trips.

PATCH/version checks and protected DELETE remain the next milestones, so use
disposable test databases for repeated creation while developing this API.
