# My Trips foundation: manual verification

PR #12 Milestone 4 presents My Trips at `/trips` with responsive cards and a
navigation shell for View Trip. Old `/#my-trips` bookmarks redirect there.
Canonical detail loading and automatic post-save invalidation remain later work.
Use the existing [local startup instructions](trip-creation-integration.md#start-locally)
and [auth setup](../AUTH.md). No new environment variable, dependency, migration
or backend endpoint is required. This checklist is not evidence of a completed
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
   are intentionally deferred to Milestone 5.
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

Automated commands from `frontend/` with pinned Node 24.22.3:

```sh
npm run test -- --run src/features/trip/SavedTripsDashboard.test.tsx src/components/SiteHeader.test.tsx src/App.test.tsx src/features/auth/AuthIntegration.test.tsx
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

Record actual outcomes separately from this checklist. Backend ownership remains
covered by existing opt-in PostgreSQL tests; browser rendering alone is not
proof of cross-owner authorization.
