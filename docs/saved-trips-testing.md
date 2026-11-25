# Saved trips automated coverage

PR #12 Milestone 8 uses existing Vitest, Testing Library and JSDOM. No new
dependencies, runtime features, credentials, database dependency or CI step.
The user reviewed Milestone 7, committed as `ca9f072`. See [memory](memory.md)
for actual results, including the local backend integration blocker.

## Coverage audit

Existing tests remain authoritative rather than duplicating each scenario in
another suite. The new [App integration tests](../frontend/src/App.savedTrips.integration.test.tsx)
join routes, actual authentication context/provider and native clients, mocking
only HTTP responses. The route suite adds a stale failure regression.

| Requested behavior | Automated evidence |
| --- | --- |
| 1. Successful list retrieval | [Read-client suite](../frontend/src/api/trips.read.test.ts): compact summaries, cursor handling and server order. |
| 2. Individual retrieval | Same suite: canonical metadata, UUID path and required-nullable fields. |
| 3. Credentials | Same suite: same-origin cookies, no owner parameter or GET CSRF dependency; [HTTPS tests](../frontend/src/api/auth.https.test.ts) preserve creation CSRF behavior. |
| 4. HTTP failures | Read suite: status/code mapping, unsafe/non-JSON envelopes, no raw error reflection. |
| 5. Network failure | Read suite: fixed safe message, no automatic retry, separate abort/timeout cases. |
| 6. Dashboard loading | [Dashboard state suite](../frontend/src/features/trip/SavedTripsDashboard.states.test.tsx): observable waiting state and disabled controls. |
| 7. Saved trip rendering | [Dashboard suite](../frontend/src/features/trip/SavedTripsDashboard.test.tsx): only actual returned metadata, stable records. |
| 8. Formatting | [Card tests](../frontend/src/features/trip/TripCard.test.tsx), [formatting tests](../frontend/src/features/trip/tripFormatting.test.ts): calendar-safe dates, inclusive days, nullable integer money and traveler labels. |
| 9. Empty results | Dashboard/state suites: intentional empty state with creation action, distinct from failures and empty later pages. |
| 10. Failure/retry | State suite: error → explicit retry → loading → success/failure, safe feedback and focus. |
| 11. Guest behavior | Dashboard suites and [App routes](../frontend/src/App.routes.test.tsx): no protected request before confirmed auth. |
| 12. Expiry | State suite: read 401 → explicit /me recheck → existing expiration notice and sign-in. |
| 13. Creation navigation | New App suite follows the actual creation href into the existing form with destination focus. |
| 14. Details navigation | New App suite follows the actual card UUID href, reloads independently and displays canonical detail data. |
| 15. Details retrieval | [Details route suite](../frontend/src/routes/TripDetailsPage.test.tsx) and App suite: real client parsing and displayed facts. |
| 16. Route ID | Route suite: selected/new UUID endpoint, invalid UUID no HTTP; App suite uses card href without passing trip state. |
| 17. Details loading | Route/App suites: session loading before protected GET, then detail loading before content. |
| 18. Missing trip | Route suite: safe terminal 404 with back navigation, no retry/existence probe. |
| 19. Inaccessible trip | Route suite uses the same 404 state; new App suite verifies repeated 403 after valid account recheck without forced logout or bypass. |
| 20. Honest itinerary | New parameterized App cases for draft/ready/archived: no invented activities or unsupported empty/generated claim or inactive controls. |
| 21. Logout clears data | Dashboard state suite: pending logout; new App case: already rendered details disappear before real logout completes. |
| 22. Stale responses | Dashboard/route suites: old accounts/routes/unmounted requests cannot restore content. New late rejection case preserves newer successful route. |
| 23. Freshness | [Freshness suite](../frontend/src/features/trip/SavedTripsFreshness.test.tsx): new entry, details return, history restoration, refresh/cursors, duplicate guards. |
| 24. Creation preserved | [Creation integration](../frontend/src/features/trip/TripCreation.integration.test.tsx) and freshness suite: existing review/save, cookie/CSRF, uncertain mutation errors, navigation and account cancellation. |

The response has no itinerary-presence flag or contents. A frontend test cannot
honestly assert that a saved draft has never had an itinerary. The tested
unavailable section explicitly communicates that contract limitation; confirmed
empty itinerary rendering awaits a future authoritative contract.

## Fixtures and test levels

[Typed fixture factories](../frontend/src/test/tripFixtures.ts) contain synthetic
profiles and saved responses, reused by route and new integration tests.
[Deferred promises](../frontend/src/test/deferred.ts) control loading and stale
completions without sleeps. Existing local fixtures remain where migrating them
would be unrelated churn. Malformed-network tests deliberately pass unknown
values through Response.json to exercise runtime validation, not TypeScript alone.

- Unit/contract tests exercise pure validation/formatting and native transport
  against synthetic Response objects; they do not prove the deployed API schema.
- Component tests assert accessible headings, status/alerts, links, displayed
  facts and interactions. AuthContext stubs establish selected states in focused
  tests; they are not authentication implementation or authorization evidence.
- Frontend integration tests compose actual App/provider/router/client at the
  fetch boundary. Mocked /me/logout/list/detail responses isolate UI behavior.
  Existing fake timers exercise deadlines; no live Google, Maps, AI or database.
- Backend ownership integration tests use real FastAPI, session and repository
  behavior with isolated PostgreSQL databases. Only those can establish actual
  server-side owner filtering/non-enumeration for these cases.

Native anchor navigation is simulated by reading its href, unmounting the old
document and entering the URL. Router Back uses the actual Link. This does not
claim browser-level history, layout or accessibility verification. No routing,
client or provider functions are mocked in the new App suite. Additional text
injection coverage verifies React renders preferences literally.

## Commands and GitHub Actions

From frontend, using the pinned Node runtime and installed lockfile dependencies:

```sh
npm run test -- --run
npm run lint
npm run typecheck
npm run build
```

[Frontend CI](../.github/workflows/frontend-ci.yml) already uses these exact
non-interactive commands on Ubuntu with Node from .nvmrc after npm ci. New files
match existing discovery; fixtures contain no machine-specific paths, secret
values or environment requirement. No workflow change is needed. Local command
passes establish compatibility with those commands, not a hosted Actions pass.

[Backend CI](../.github/workflows/backend-ci.yml) already runs database-free
pytest and a PostgreSQL service-backed job with TEST_DATABASE_ADMIN_URL. The
existing [ownership tests](../backend/tests/integration/test_trip_crud_api.py)
cover real create/detail round trips, other-owner/missing indistinguishability,
owner-only lists, cursor ownership/order, owner spoofing, CSRF and revoked/expired
sessions. Local commands with the established backend environment:

```sh
uv run --no-sync pytest -q
uv run --no-sync --env-file ../.env pytest --run-db-tests tests/integration/test_trip_crud_api.py -q
```

Database fixtures require an explicit local postgres maintenance URL; no fallback
to the application database. They create/drop only registered random scratch
databases. The local opted-in run produced setup errors because that explicit
test URL was missing; it is not a pass or evidence of failed authorization
assertions. Do not copy production credentials or weaken fixture checks.

Remaining manual checks: live login/save/PostgreSQL/reload/other-owner denial,
actual browser Back/Forward cache restoration, responsive mobile/desktop layout,
keyboard and screen-reader announcements/focus, and deployed frontend history
fallback preserving API/auth routes. See the
[manual runbook](runbooks/saved-trips-dashboard.md). Milestone 9 has not begun.
