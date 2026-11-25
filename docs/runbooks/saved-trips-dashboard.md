# My Trips foundation: manual verification

## Milestone 7 freshness checks

PR #11 is already merged (`15fda2e`); use the existing form submission. These
manual steps remain unexecuted for this milestone; automated HTTP-fixture tests
are separate evidence. Use synthetic trips in the existing local setup.

1. Sign in, enter/review/save a trip through the existing landing-page form.
   Confirm exactly one POST and no list prefetch while saving. The saved
   confirmation offers Go to My Trips, View saved trip and Create another trip.
2. Follow Go to My Trips. Confirm a fresh first-page GET after auth, and the new
   trip appears in API order: updated_at descending, UUID ascending for ties.
   Confirm My Trips is available in desktop and mobile navigation.
3. Open details, follow Back to My Trips, then reload the dashboard. Each entry
   should read current first-page data. Details directly opened/refreshed should
   independently retrieve the selected UUID.
4. From a dashboard visit, navigate away, then use browser Back/Forward. If the
   browser uses its back/forward cache, persisted pageshow must hide old cards
   while /me resolves, then retrieve fresh data for the confirmed account. If
   the browser reloads instead, normal bootstrap handles freshness. Inspect the
   browser navigation/cache diagnostics; synthetic events alone do not prove a
   real cache restoration. Repeat after ending the session in another tab:
   expired auth must not display old cards or issue a new protected list read.
5. With more than 20 synthetic owned trips, follow Next/Previous and confirm
   additional pages remain reachable. Refresh should return to the latest first
   page, not retain an old cursor. Counts are per page. Concurrent edits can move
   items between cursor pages; Refresh reloads the current first page.
6. Try rapid Refresh/page actions. At most one accepted request is pending.
   Ordinary React renders and same-account auth focus checks must not refetch
   trips. React Strict Mode's development rehearsal is cancelled normally.
7. Compare dates/durations across DST and one-day boundaries, and budgets across
   saved confirmation/details: currency code, integer minor units, per person for
   the entire trip, unknown distinct from zero. Cards omit unavailable budgets.

Focused command from frontend: `npm run test -- --run
src/features/trip/SavedTripsFreshness.test.tsx`. The suite uses isolated mocked
HTTP with native clients; full-document links are tested through URL/remount
lifecycles. Still needed: live form → PostgreSQL → dashboard/details and actual
browser history/mobile/keyboard smoke checks. No future PR #11 merge is needed;
hosted static/history serving remains planned.

## Milestone 6 details checks

Milestone 6 replaces the older shell described below. These are manual steps,
not a claim of live execution. Use synthetic owned trips and the existing local
frontend/backend/PostgreSQL setup; never log or copy session secrets.

1. Sign in, open My Trips, and use View Trip. Confirm the URL contains the saved
   UUID and the detail GET retrieves that UUID without an owner parameter.
2. Verify title, destination, timezone, calendar dates, inclusive duration,
   travelers, full-trip per-person currency budget, interests and preferences
   against the saved record. A null budget must say Not specified, not zero.
3. Refresh the details URL and open it in a fresh tab. Both should check the
   session and load details independently of a dashboard visit. Production
   static/history routing is still planned; Vite checks do not prove deployment.
4. Use Back to My Trips and browser history. Confirm the dashboard loads normally
   and creation links still reach the existing form.
5. Open `/trips/not-a-uuid`: expect Invalid trip link and no detail GET. Compare
   nonexistent and another synthetic owner's UUID: both show the same unavailable
   state from backend 404, without revealing whether the private resource exists.
6. Check a guest/expired session: no protected read until auth resolves. Use the
   existing header sign-in or explicit account recheck. A 403 must not imply
   logout or trigger repeated requests. Test server/offline/timeout failures:
   safe alert, explicit retry, loading and eventual outcome; no automatic loop.
7. Throttle a detail response and sign out/change accounts or navigate to a
   different UUID. Old content must disappear, pending work must abort and late
   results must never replace the new account/trip.
8. Check narrow mobile and desktop widths, long text, preference line breaks,
   keyboard back/retry navigation, focus and status/error announcements. The
   itinerary section explicitly explains missing API itinerary information;
   there are no fictional activities or generation/edit/delete/export controls.

Focused automated command from frontend: `npm run test -- --run
src/routes/TripDetailsPage.test.tsx src/App.routes.test.tsx`. These tests use
mocked HTTP; live Google/PostgreSQL ownership and screen-reader checks remain
manual. See [ADR 0015](../adr/0015-saved-trip-details.md).

PR #12 Milestone 4 presents My Trips at `/trips` with responsive cards and a
navigation shell for View Trip. Old `/#my-trips` bookmarks redirect there.
Canonical detail loading and automatic post-save invalidation remain later work.
Use the existing [local startup instructions](trip-creation-integration.md#start-locally)
and [auth setup](../AUTH.md). Milestone 5 requires no additional environment
variable, dependency, migration or backend endpoint. This checklist is not evidence of a completed
live-Google or database/browser run for this milestone.

1. Start the existing local PostgreSQL/FastAPI/Vite stack with pinned runtimes.
   Open `http://127.0.0.1:5173/trips`. Without a confirmed account, My Trips
   must show checking, signed-out or recoverable account-error state and must
   not issue a trip GET. The form remains usable.
2. Sign in through the existing account controls. Google returns to the app
   root; choose My Trips in the header if needed. In Network, verify that the
   trip request begins after the current-user check succeeds. Expect
   GET `/api/v1/trips?limit=20`, same-origin session credentials and a 200
   metadata page. Do not copy cookies, response bodies or authenticated HARs.
   Strict Mode can abort/restart an initial request during development; there
   must be no ongoing loop or polling.
3. With an account that has no saved trips, expect the honest empty state and
   Create a trip link. With saved trips, compare the title, destination and
   calendar dates against your synthetic saved data. Duration is inclusive;
   one-day trips show 1 day. Travelers/budget/interests are omitted from cards
   because the list API does not return them. View Trip opens a navigation
   shell, with no canonical detail fetch or generated activity data yet.
4. Create/save a synthetic trip through the existing form, then choose My Trips
   and Refresh trips. The new server record should appear. Refresh requests the
   first page and resets previous-page history. Browser reload also reloads from
   the server after authentication; no list is recovered from browser storage.
5. If the account already has more than 20 trips, check Next page and Previous
   page and confirm the returned cursor is used. Do not create bulk development
   data solely for this check; deterministic tests cover cursor transitions.
6. Throttle the browser network and choose Refresh trips. Expect a loading status
   and disabled refresh action until completion. Use browser offline mode for a
   load failure, restore connectivity, then Retry loading trips. The failure
   must not be presented as an empty account. No automatic trip retry occurs.
7. While a trip request is pending, sign out. Trip content must disappear as
   sign-out starts, and late responses must not restore it. Complete sign-in
   with a different account and verify only that account's trips appear. Do not
   delete or modify another account's records for testing. Component tests also
   simulate success/failure arriving after cancellation.
8. Leaving the tab and returning may recheck the existing session, but a
   successful same-account check must not trigger another trip GET. Explicit
   Refresh trips is required for data changed elsewhere. A changed/expired
   account clears the list; a trip 401 offers Recheck sign-in without a loop.
9. Confirm trip-form inputs survive logout/account checks, the header/mobile
   drawer still works, anchors reach unique targets, buttons work by keyboard,
   and long titles/dates remain readable on a narrow viewport.

## Milestone 4 visual checks

1. Check populated, empty, loading and error views at 320, 390, 768, 1024 and
   1440px. Expect a single column below 42rem, two from 42rem and three from
   64rem. Look for horizontal scrolling, clipped names, uneven card footers,
   overlapping controls and illegible dates. Check enlarged text/reflow too.
2. Confirm the count says how many saved trips are on the current page, without
   implying a total across all pages. Longer names should wrap and remain fully
   available to assistive technology. Card links have distinct accessible names.
3. Use Tab from the My Trips heading: Plan a New Trip precedes View Trip actions.
   Interactive focus must remain visible. Use Enter on View Trip, verify the
   shell's honest unavailable notice, then Back to My Trips. Full trip details
   remain future work; the human defined Milestone 5 as state/recovery hardening.
4. Choose Plan a New Trip from desktop and mobile. Verify `/#create-trip`, the
   form visible below the sticky header, and focus in Destination. The root home
   page remains the existing creation flow; it makes no dashboard list request.
5. On mobile, open Menu, use its route links, and check Escape/Close focus return.
   From the dashboard, home/feature/about links must reach the root page sections.
6. Compare calendar dates in browsers with different local timezones; dates must
   not shift. Check one-day, leap-day and daylight-saving date ranges. Review and
   saved views use currency-code amounts, traveler labels and the same date
   presentation. Budget is per person for the entire trip; null is unspecified.

Automated browser fixture checks use a temporary local preview and isolated
synthetic HTTP responses. Those checks can establish rendering/navigation, not
Google login, real owner data or PostgreSQL behavior. Production deep-link
serving also remains unverified until FastAPI static/history serving is built.

## Milestone 5 state checks

Milestone 5 is state/recovery hardening. Earlier forecasts assigning full trip
details to this milestone are superseded; details remain future work.

| Condition | Expected dashboard behavior | Recovery |
|---|---|---|
| Auth still loading | Checking-sign-in status; no protected GET | Wait for the existing account check |
| Confirmed guest | Visible sign-in panel and Google action; no protected GET | Existing full-page sign-in, with draft-loss warning |
| List pending | Busy region, atomic loading status, hidden decorative skeletons | Wait; no duplicate submit or polling |
| Valid nonempty page | Real cards and current-page count | Explicit refresh/pagination |
| Valid empty first page | Empty-account message and Plan your first trip | Existing creation form |
| Empty later page | Page-moved wording, not an empty-account claim | Previous page or first-page refresh |
| Read 401 | No cards; Check your sign-in | Recheck sign-in through existing /me; confirmed expiry shows existing notice/sign-in action |
| Read 403 | No cards; Request not permitted | Check account; a valid profile does not override denial or force logout |
| 500/storage/upstream failure | Safe load error, never empty data | Retry loading trips explicitly |
| Auth configuration unavailable | Safe sign-in-unavailable state | Existing account check |
| Network/ten-second timeout | Distinct connection/timeout message, no cards | Restore connectivity and retry explicitly |
| Explicit retry | Loading, then success/empty/error; outcome receives focus | At most one request per accepted action |
| Sign-out/account change | Hide results, abort request and discard component state | Ignore late success/failure; existing auth controls recover focus |

The [HTTP-boundary tests](../../frontend/src/features/trip/SavedTripsDashboard.states.test.tsx)
cover these failures without weakening a backend route, printing credentials or
waiting for a real session to expire. They use the real typed client/auth
provider with deterministic fake HTTP and timers. The API client still preserves
CSRF_FAILED for unsafe creates; FORBIDDEN is frontend normalization for read 403.

For a manual smoke check, open `/trips` signed out, use the visible sign-in action,
then inspect a populated/empty account. Browser offline mode can exercise network
failure; restore connectivity and choose Retry loading trips. Check keyboard
focus after retry and sign-out during a throttled list request. Do not remove
server checks to manufacture 401/403/500; automated fixtures cover them. This
checklist is not a claim of a new live-Google or database/browser run.

Automated commands from `frontend/` with pinned Node 24.22.3:

```sh
npm run test -- --run src/features/trip/SavedTripsDashboard.states.test.tsx src/features/trip/SavedTripsDashboard.test.tsx src/api/trips.read.test.ts src/api/trips.test.ts
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Record actual outcomes separately from this checklist. Backend ownership remains
covered by existing opt-in PostgreSQL tests; browser rendering alone is not
proof of cross-owner authorization.
