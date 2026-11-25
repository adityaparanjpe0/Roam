# Saved trips dashboard and details

Roam currently supports authenticated saved trip metadata: creation, a paginated
My Trips dashboard and individual details. PR #11's creation integration is
merged (`15fda2e`); PR #12 adds dashboard/details. AI planning, maps, editing,
deletion controls and PDF export are not implemented by this frontend feature.

## Architecture and responsibilities

| Component | Responsibility |
| --- | --- |
| [App](../frontend/src/App.tsx) | Existing BrowserRouter, shared header/footer and AuthProvider. Routes `/`, `/trips`, `/trips/:tripId`; legacy My Trips anchor redirects. |
| [SavedTripsPage](../frontend/src/routes/SavedTripsPage.tsx) | Main landmark and standalone dashboard composition. |
| [SavedTripsDashboard](../frontend/src/features/trip/SavedTripsDashboard.tsx) | Heading/count, account gating, request feedback, creation/navigation and pagination actions. |
| [useSavedTrips](../frontend/src/features/trip/useSavedTrips.ts) | One bounded page, cursor history, explicit retry/refresh, pending guard and cancellation. |
| [SavedTripList](../frontend/src/features/trip/SavedTripList.tsx), [TripCard](../frontend/src/features/trip/TripCard.tsx) | Typed presentation, stable trip UUID keys and links; no requests or invented enrichment. |
| [TripDetailsPage](../frontend/src/routes/TripDetailsPage.tsx), [useSavedTrip](../frontend/src/features/trip/useSavedTrip.ts) | Route UUID, independent canonical read, account/error gates and back navigation. |
| [SavedTripDetails](../frontend/src/features/trip/SavedTripDetails.tsx) | Saved facts/preferences and explicit itinerary limitation. |
| [Trip client](../frontend/src/api/trips.ts) | Existing relative URLs, runtime parsing, safe errors, cookies, cancellation and deadline. |
| [Formatting helpers](../frontend/src/features/trip/tripFormatting.ts) | Calendar dates, inclusive days, traveler labels and integer minor-unit currency display. |

## Actual read contracts

`GET /api/v1/trips?limit=20&cursor=…` returns `{items: TripSummary[],
next_cursor: string | null}`. Limit is 1–100, default 20. The opaque next cursor
must be passed unchanged. Summary fields are `id` (UUID string), `title`,
`destination_label`, `start_date`, `end_date` (calendar YYYY-MM-DD strings),
`version` (integer), and `updated_at` (timezone-aware timestamp string).

`GET /api/v1/trips/{trip_id}` returns that summary plus `timezone` (IANA name),
`traveler_count` (integer), `budget_per_person_minor` (integer or null), `currency`,
`interests` (string array), `free_text_constraints` (string or null), `status`,
and `created_at` (timezone-aware timestamp). Nullable response keys are required;
they are not editable form values or an unsaved TripDraft. Structured database
preferences and itinerary records are not exposed in this response.

Budget is per person for the entire trip. New creation uses USD cents; legacy
read responses can contain other currency codes and unknown budgets. Shared
formatting uses currency fraction digits and distinguishes null from zero.
Calendar dates display with explicit UTC date formatting to avoid viewer-zone
day shifts. Duration is inclusive calendar days, including one-day/DST cases.
Cards omit travelers/budget/interests because they are absent from the list DTO.

Server ordering is updated_at descending, then UUID ascending. The UI preserves
that order across cursor pages and explains most-recently-updated ordering.
Counts describe the current page, not an invented total. Next/Previous controls
expose additional pages; Refresh returns to page one. Concurrent edits can move
records between cursor requests; the list is not a transactional snapshot.
See the complete [trip API guide](trip-api.md) for write contracts and bounds.

## Authentication, ownership and lifecycle

The existing React auth context checks `/api/auth/me`. Unknown, loading, guest
and signing-out states do not mount a protected trip reader. Authenticated
children are keyed by account UUID; details also use the route UUID. Account
loss, route replacement and sign-out discard local results and abort pending
reads. Active flags reject late results even if a test transport ignores abort.
Effects depend on primitive cursor/ID and explicit attempt, not auth objects.

Requests use same-origin HttpOnly session cookies, no-store and the existing
relative API/proxy configuration. GETs do not copy tokens into JavaScript
storage or send arbitrary user IDs. Backend session dependencies determine the
owner; queries filter owner plus resource UUID. Missing and other-owner details
return the same 404 and UI message. Frontend auth gates improve UX but never
replace backend authorization. Unsafe creation retains existing CSRF/origin
checks. No security policy is loosened.

Each request has the existing ten-second deadline. Loading clears old content;
success shows validated data; successful empty pages show an intentional state
with creation navigation. An empty later page does not claim the account is
empty. Failures never become empty results or expose raw server/exception text.

| Failure | Visible recovery |
| --- | --- |
| 401 | Existing explicit account recheck; /me establishes session-expiration/sign-in behavior. |
| 403 | Check account; no forced logout, privilege bypass or automatic loop. |
| Invalid ID / 404 | Invalid-link or indistinguishable unavailable message and Back to My Trips. |
| Network, timeout, server, malformed response | Safe feedback and explicit request retry; old content stays hidden. |

Fresh page entry, details return and hard refresh read current data. Creation's
saved confirmation links to My Trips and the canonical details URL. There is no
mounted dashboard/cache on the creation route to invalidate. Persisted browser
Back/Forward restoration clears confirmed auth while rechecking the session,
then remounts the proper account's reader at page one. Ordinary same-account
focus checks do not refetch trips. No polling, shared cache or private browser
persistence. Refetching costs a bounded request but keeps invalidation simple.
See [freshness decisions](adr/0016-trip-navigation-freshness.md).

## UX and accessibility

The dashboard uses Roam's existing colors, typography and spacing. Cards use one
column on narrow screens, two from 42rem, three from 64rem. Detail facts use one
or two columns; long destinations/titles and multiline preferences wrap without
truncating saved text. Detail facts are grouped on the existing surface color;
the back link has a 44px minimum target at the default root font size. Card
keyboard outlines sit inside the clipped card boundary. No animation library,
image API or new design system is introduced.

Semantic landmarks/headings, native buttons/links, original time attributes,
visible focus styles, status/alert messages, atomic detail errors, disabled
pending actions and existing retry focus support keyboard use. Skeletons are
decorative/aria-hidden. Programmatic page-heading focus suppresses a decorative
outline; interactive keyboard controls retain their visible outline. Test these
with a screen reader as well: markup/browser checks alone do not certify WCAG.

## Launch locally

Use the existing setup guides for locked dependencies: [frontend](../frontend/README.md),
[backend](../backend/README.md), [PostgreSQL](runbooks/local-postgres.md) and
[Google/session configuration](AUTH.md). Keep the real root environment file
private; preserve it rather than overwrite it. No credentials belong in VITE
variables or documentation. Use the same 127.0.0.1 origin throughout development.

From the root with Docker Desktop/Compose available:

```sh
docker compose up -d --wait db
```

In a separate terminal, from backend with the configured Python environment:

```sh
uv run --no-sync --env-file ../.env alembic upgrade head
uv run --no-sync --env-file ../.env uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, from frontend with the pinned Node runtime:

```sh
npm run dev
```

Open `http://127.0.0.1:5173/trips`. Vite proxies API/auth requests to FastAPI and
supports direct frontend URLs. Production same-origin static/history fallback
remains planned and must preserve API/auth/health paths. A dev preview on 5177
is useful for isolated fixture checks, but use the configured OAuth origin for
real Google sign-in. Do not change the OAuth redirect merely for visual tests.

## Verification and current limits

Run frontend lint/typecheck, `npm run test -- --run`, and production build. The
[24-requirement coverage matrix](saved-trips-testing.md) distinguishes unit,
component and mocked-HTTP frontend integration tests. Backend database-free
pytest does not establish PostgreSQL ownership; opt-in tests require a separate
TEST_DATABASE_ADMIN_URL targeting local postgres maintenance and create their
own isolated scratch databases. No development-DB fallback or real provider calls.

For real end-to-end verification, with your local database/server running:

1. Sign in through existing Google controls. Create/review/save a synthetic trip;
   follow Go to My Trips, then View Trip. Compare fields with the saved response.
2. Refresh both URLs and open details directly in another tab. Return with Back
   to My Trips and browser Back/Forward; verify current content and focus.
3. Use a fresh test account with zero trips for the empty state. Use browser
   offline mode to verify a safe failure, reconnect and explicitly retry. Do not
   alter backend authorization or manufacture successful production responses.
4. In separate isolated browser profiles, create a trip as account A, then open
   its URL as B. Compare its 404/unavailable state with a random missing UUID.
   Sign out while a read is pending; private content must stay hidden.
5. Verify at 320/390, 768 and 1024/1440px, keyboard-only operation, visible focus,
   long text, 200% zoom and screen-reader loading/error announcements.

Actual milestone results and blockers are in [memory](memory.md). Browser
fixtures demonstrate rendering/navigation without Google or a database; they
must never be described as live authenticated FastAPI/PostgreSQL verification.
No real end-to-end pass is claimed until the prerequisites and steps above run.

The itinerary section explicitly states that the API does not return activities
or establish whether generation occurred. It does not invent an empty itinerary,
activities or inactive generation/edit/export buttons. Future features must add
typed authoritative itinerary contracts, retain the stable UUID/timezone/version,
extend this section with real data and preserve backend ownership/validation.
Shared mutation/cache coordination can be reconsidered when that work exists.
