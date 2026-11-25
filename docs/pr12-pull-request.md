# Proposed title

Add authenticated saved trips dashboard and individual trip details

Copy the body below into GitHub. Keep incomplete verification items unchecked;
upload the synthetic screenshots before requesting final review.

---

## Summary

Users can revisit their saved trip metadata in My Trips and open a stable URL
for each trip. The UI reads the existing authenticated FastAPI endpoints instead
of placeholder trips, and preserves PR #11's creation flow.

## Changes

- Add `/trips` and `/trips/:tripId`, desktop/mobile My Trips navigation, creation
  links and back navigation. Details fetch independently of dashboard state.
- Extend the existing typed native-fetch client with list/detail reads, runtime
  validation, safe errors, session credentials, cancellation and a ten-second
  deadline. Preserve existing creation/CSRF handling.
- Add reusable presentational cards and responsive detail facts using shared
  calendar-date, inclusive-duration, traveler and minor-unit currency formatting.
  Cards display only fields in the summary response; details show full metadata.
- Distinguish auth loading/guest, request loading, empty, populated and failure
  states; provide explicit retry/account recovery and accessible feedback/focus.
- Refetch on entry/return and confirmed auth after browser history restoration;
  preserve server ordering/cursors and discard obsolete account/route requests.
- Add tests and implementation/runbook documentation. Explain unavailable
  itinerary information without fictional activities or inactive controls.

## Testing

Final local checks on Windows, Node 24.22.3 / existing Python 3.12 environment:

- `npm run test -- --run`: **479 passed across 24 files**.
- `npm run lint`, `npm run typecheck`, `npm run build`: **passed**.
- `ruff format --check .`: **77 files already formatted**; `ruff check .`: passed;
  `mypy app`: **no issues in 40 source files**.
- `python -m pytest -q`: **434 passed, 136 skipped**. Existing Starlette/httpx
  deprecation warning remains.
- Explicit PR #10 PostgreSQL suite: **14 setup errors** due to missing local
  TEST_DATABASE_ADMIN_URL; **no ownership assertions executed**. No development
  database substitution. Existing CI provisions its own PostgreSQL test URL.
- Milestone 9 Chrome 151 fixture run: **23 layout measurements** without
  horizontal overflow at 320/390/768/1024/1440px, including zero/one/20 trips and
  long details. Keyboard card navigation, direct refresh/back navigation,
  safe states/retry and create-to-dashboard passed with intercepted HTTP;
  screenshots were inspected and no browser page errors occurred.
- Diff whitespace and high-confidence tracked-file/branch-history secret scans
  found no issues. These are bounded checks, not proof against every secret form.

Frontend tests and browser fixtures mock HTTP; they do not establish live Google,
PostgreSQL ownership or hosted deployment. Existing GitHub Actions commands remain
compatible; hosted CI has not been run for this local preparation.

## Technical Decisions

- React Router 8.5.3 provides route composition; existing native anchors retain
  browser navigation semantics. No second router, auth provider or HTTP client.
- Local account/route-keyed hooks fit independent read-only consumers. Refetching
  costs a bounded request on entry but avoids a shared cache/invalidation layer;
  no Redux, query-library addition, polling or private browser persistence.
- Preserve API `updated_at DESC, id ASC` ordering and bounded cursor pages.
  Counts are per page; Refresh resets to the first page. No per-card detail calls.
- Preserve YYYY-MM-DD dates as calendar strings. Budgets remain per person for
  the entire trip; null is unknown, not zero. Editable drafts remain distinct
  from persisted response types.
- No backend/schema/migration changes. Rollback is a frontend revert; no data
  migration or paid provider call is introduced. Routing adds one pinned direct
  dependency and two transitive dependencies.

## Security Considerations

- Reuse same-origin cookies and existing server sessions. GETs send no owner ID;
  unsafe creation retains CSRF/origin checks. No tokens in localStorage.
- Backend ownership queries remain authoritative; missing/other-owner resources
  share 404 behavior. UI gates are not authorization enforcement.
- Account loss/sign-out clears private results and cancels reads. Active guards
  prevent late completions from restoring another account/route's content.
- Render server strings as text, allowlist DTO fields and show fixed safe error
  messages. No new trip/token logging, production mocks or exposed credentials.
- Teammate review should walk through ownership boundaries and the added
  persisted-pageshow session recheck.

## Screenshots

Upload synthetic fixture captures before final review: desktop/tablet/mobile
dashboard, mobile details with long text, and keyboard focus. Captures exist
locally from Milestone 9 but are intentionally ignored and not uploaded in this
draft. No real-user information or raw cookies should be included. Local paths
are listed in the final review document; they will not render as GitHub uploads.

## Known Limitations

- Real authenticated form → PostgreSQL → dashboard/details and two-account
  ownership smoke checks remain pending local database/Google setup. PostgreSQL
  integration checks must pass in a configured environment before merge.
- Production same-origin static/history fallback is still planned; Vite direct
  entry/refresh does not prove deployment behavior. Backend/API/auth paths must
  retain their handlers when deployment is implemented.
- The metadata API exposes neither itinerary activities nor a reliable presence
  flag. The UI explains unavailability rather than claiming confirmed absence.
- Browser cache selection, screen-reader operation and 200% zoom need manual
  checks; fixture/browser markup checks do not certify accessibility.
- Cursor pages are not a snapshot under concurrent edits. No total count,
  background synchronization or shared cache is provided.
- Hand-maintained TypeScript DTOs require contract review when backend schemas
  change. Future itinerary mutations may justify generated types/shared caching.

## Related Issues

- Builds on trip CRUD/ownership in #10 and merged creation integration in #11.
- No issue-closing keyword is included: no separate issue to close was verified.
- Future itinerary integration is follow-up work; #17–#20's individual assignments
  were not established by inspected repository documentation.

Before marking ready to merge:

- [ ] Run configured PostgreSQL ownership regressions and live two-account smoke checks.
- [ ] Run live Google/form save → dashboard → details/direct refresh verification.
- [ ] Attach synthetic screenshots; finish screen-reader/zoom/history-cache checks.
- [ ] Obtain green hosted CI and teammate review/walkthrough.
