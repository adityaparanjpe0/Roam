# ADR 0015: Authenticated saved trip details

- Date: 2026-11-24
- Status: PR #12 Milestone 6 implemented locally; awaiting human review
- Owner: user with Codex assistance

## Decision

Replace the navigation shell at `/trips/:tripId` with
[TripDetailsPage](../../frontend/src/routes/TripDetailsPage.tsx). Existing card
anchors already target the persisted UUID. Keep browser navigation semantics and
reuse React Router, AuthProvider and getTrip; no new dependency or client.

Mount [useSavedTrip](../../frontend/src/features/trip/useSavedTrip.ts) only after
confirmed authentication, keyed by account UUID and route ID. This extends ADR
0012's local-hook exception to an independent detail reader. No shared cache or
mutation invalidation requires coordination yet. Reconsider a query library
when future mutations introduce that need.

Effect dependencies are primitive trip ID and explicit attempt. Cleanup aborts
and marks the request inactive. Account loss, signing out and route changes
discard results before another account/trip renders. Explicit retry clears
content, prevents duplicate requests and focuses the result or alert. Account
recovery reuses AuthProvider and focuses the page heading afterward. Sign-in
remains the existing header action. No automatic retries, polling or storage.

## Contract and security

`GET /api/v1/trips/{trip_id}` accepts a UUID and returns TripResponse: calendar
dates, timezone, traveler count, nullable integer minor-unit per-person budget,
currency, interests, nullable free-text constraints and audit/version metadata.
Existing runtime validation, same-origin session cookies, no-store and ten-second
deadline remain. The GET sends neither a user ID nor a CSRF header.

Backend session dependency supplies the owner; repository queries filter by both
owner and resource UUID. Missing and other-owner resources have identical 404
behavior. The UI makes no extra existence probes. Invalid UUIDs fail locally;
read 401/403 reuse explicit account recovery. Other recoverable errors offer
safe request retry. Backend authorization and contracts are unchanged.

[SavedTripDetails](../../frontend/src/features/trip/SavedTripDetails.tsx) renders
props only, reuses calendar-safe formatting, distinguishes null budget from zero,
preserves preference line breaks and renders server text through React escaping.
Only free-text constraints are available; the stored structured preferences
object is not in this response.

The API has neither activities nor an itinerary-presence flag. Draft status is
not authoritative evidence of absence. Explain this limitation rather than claim
that no itinerary exists, fabricate activities or show inactive controls. Future
confirmed-empty wording requires a reliable itinerary contract.

## Future work and evidence

Stable UUID, canonical metadata/version, timezone and a separate itinerary
section provide a foundation for future planning/edit/replan/export PRs. The
inspected repository does not establish PR #17–#20's individual assignments;
do not invent that mapping or implement those features here.

Direct entry/refresh use Vite's existing frontend history fallback. Production
static/history serving remains planned and must preserve API/auth/health paths.
Component tests do not prove hosted deployment or live database ownership.

[Route tests](../../frontend/src/routes/TripDetailsPage.test.tsx) use the real
client with mocked HTTP for auth gating/resolution, canonical fields/nulls,
invalid IDs, 404/401/403/500/503, offline/timeout, malformed responses, retry,
logout/account/route races and Strict Mode. App tests cover independent direct
entry; existing card tests cover UUID links. See [memory](../memory.md) and the
[manual checklist](../runbooks/saved-trips-dashboard.md#milestone-6-details-checks).
