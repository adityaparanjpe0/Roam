# ADR 0016: Trip navigation freshness without a shared cache

- Date: 2026-11-24
- Status: PR #12 Milestone 7 implemented locally; awaiting review
- Owner: user with Codex assistance

## Evidence and decision

PR #11 is merged: `15fda2e` is the merge commit, an ancestor of this feature
branch and the locally available `origin/main` tip. Local `main` still points
to older `1b7187b`; do not confuse that stale local branch with missing creation
functionality. No network fetch or new merge was performed to establish this.
Milestone 6 is human-reviewed and committed as `27f224d`.

Keep the existing account-scoped native-fetch hooks, React Router and native
anchors. Dashboard entry mounts a new list consumer and requests the first
20-item page with no-store. Returning with the details page's router Back to My
Trips link has the same fresh-mount behavior. Hard refresh checks the session
and reads independently. The header already exposes My Trips on desktop/mobile.

The existing PR #11 confirmation now provides My Trips and canonical detail
links using the persisted UUID. Saving remains entirely PR #11's responsibility:
no new POST, callback bus, automatic redirect, prefetch or client persistence.
The dashboard is not mounted on the creation page, so there is no live list or
cache to invalidate after successful creation. Navigation triggers the needed
read exactly where it is consumed; the user can still create another trip.

## Browser history restoration

Back/Forward may restore a whole document from the browser's memory cache
without remounting React. AuthProvider now listens for persisted pageshow and
sets its snapshot to loading before using the existing guarded session check.
Authenticated children unmount, clearing cards and aborting requests. Successful
confirmation remounts the correct account's reader at page one; expired/unknown
auth sends no new protected read. An already pending session check is reused;
ordinary pageshow does nothing. Existing focus/online/visibility checks remain,
and ordinary same-account checks do not refetch trips. The listener is cleaned
up with the provider. Browser cache selection and pre-script screenshot behavior
are browser-controlled; tests establish the event handler's behavior, not those
browser internals.

## Ordering, pagination and duplicate protection

Preserve server order: updated_at descending, then UUID ascending for equal
timestamps. Do not sort a single frontend page differently from its cursor
contract. This surfaces recent saves/updates without inventing a relevance rule.
The dashboard now explains most-recently-updated ordering.

The API is paginated. Retain existing explicit Next/Previous controls and opaque
cursors; do not silently drop additional pages or automatically load unbounded
data. Refresh, fresh entry and history restoration reset to the first page.
Counts describe only the current page. Lists are not transactional snapshots:
concurrent edits between cursor requests can change membership; Refresh loads
the latest first page.

The list hook adds a synchronous pending guard spanning accepted navigation
through request settlement. Repeated refresh/page actions cannot enqueue work
before React updates disabled controls. Primitive effect dependencies, active
flags, cancellation and Strict Mode cleanup remain. There is no polling, global
query flag or automatic error retry.

Shared formatting helpers remain authoritative for dates, inclusive calendar
duration, travelers and minor-unit currency amounts. The saved confirmation now
matches details' nullable budget wording without adding a whole-trip suffix to
Not specified. Summary cards still omit budget fields absent from their DTO.

## Alternatives, verification and limits

Refetching costs one bounded read on entry but avoids stale shared-cache state
and invalidation complexity. A shared caching library would need ownership keys,
invalidation and lifetime policies; introduce it only when multiple simultaneous
consumers or mutations justify that coordination. Focus-triggered list fetching
and polling would add requests without being required for this milestone.

[Freshness tests](../../frontend/src/features/trip/SavedTripsFreshness.test.tsx)
exercise real frontend clients/auth with isolated HTTP fixtures for creation to
list, details return, API order, persisted history rechecks/expiry, pending-check
deduplication, cursor navigation/reset and rapid refresh actions. Native full
document navigation is reproduced by unmounting and entering the target URL;
browser cache mechanics and live Google/PostgreSQL are not inferred from JSDOM.
See [memory](../memory.md) for actual checks and the
[manual checklist](../runbooks/saved-trips-dashboard.md#milestone-7-freshness-checks).

PR #11 needs no future merge prerequisite. Remaining integration verification is
a real authenticated form save, dashboard entry, details refresh and browser
Back/Forward smoke check against local PostgreSQL. Production history/static
serving remains planned. Milestone 8 and unrelated features are outside scope.
