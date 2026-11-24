# ADR 0012: Account-scoped React state for the first My Trips view

- Date: 2026-11-24
- Status: PR #12 Milestone 3 human-reviewed and committed as f04b9a0; not merged
- Owner: user with Codex assistance

## Decision and scope

The human requested only the dashboard fetching/state foundation, allowed a
simple React hook, and prohibited a new query library without justification.
Use the existing typed trip client from [ADR 0011](0011-saved-trip-read-client.md)
with a small useSavedTrips hook for this single consumer. There is no shared
cache or mutation synchronization in this milestone. This scoped decision
supersedes the earlier PR #12 plan's TanStack Query recommendation for this view;
TanStack Query remains the repository default when shared server state requires it.

Mount the minimal My Trips section on the existing landing page, with a matching
desktop/mobile anchor. Loading begins on page entry once authentication resolves.
No router, detail page or styled card system is added. Preserve the mounted
creation form and account controls. The presentation-only SavedTripList receives
summaries through props and never authenticates or fetches.

Milestone 4 subsequently adds cards, standalone routes and a navigation shell;
see [ADR 0013](0013-saved-trip-cards-and-navigation.md). The account-keyed fetch
lifecycle remains unchanged.

## Authentication and request lifecycle

The dashboard reuses useAuth. Only confirmed authentication mounts OwnedTrips,
keyed by the stable current-user UUID. Loading, signed-out, unknown-account and
signing-out states mount no trip hook. Account changes replace the keyed child;
logout, sign-out initiation and loss of confirmed auth unmount it. This discards
trip results, errors and cursor history before another account's results render.
The UUID is a React lifecycle key only; it is never sent to select an owner.

The hook effect depends only on a primitive page cursor and explicit attempt
counter. New auth/profile objects, changing callbacks and ordinary renders do
not refetch. Each request owns an AbortController and active flag. Cleanup marks
it inactive and aborts it. Both completion handlers check the flag and signal;
even a substituted request that ignores abort cannot overwrite current state.
The private request ref is cleared only by its matching controller.

Initial state is loading. Validated success contains one page, including empty
pages; failures retain only the client's safe error. Explicit refresh/retry
sets loading and requests the first page; cursor navigation requests one bounded
20-item page at a time. Previous cursors remain in component memory only. No
cached cards are retained during refresh, and no total count is invented.
An empty later page is distinguished from an empty first page.

A 401 hides list content and offers the existing auth retry action explicitly.
There is no automatic auth/retry loop. AuthProvider retains its existing session
checks; it is unchanged. Ordinary focus events do not refresh this trip list.
No polling, persistence, new dependency or backend authorization change is added.
React Strict Mode may start, cancel and restart the initial effect in development;
do not add a global flag/cache to suppress that lifecycle check.

## Alternatives and limits

TanStack Query can handle cache lifetimes, invalidation and paginated reads, but
introducing it now adds a dependency without a shared-state requirement. Revisit
it when multiple screens consume trips or creation/editing needs coordinated
invalidation. A hook that depends on entire auth/options objects would refetch
on unrelated renders. A single unkeyed state holder could flash old-account data
before an effect resets it; account-keyed mounting avoids that transition.

Use Refresh trips after saving a trip or changing data elsewhere. Automatic
post-save invalidation, focus refresh, detailed routing and visual cards remain
later work. The server independently validates the session and owner on every
request; frontend gating never grants resource access. The API supplies metadata
only and cannot establish itinerary presence.

## Evidence

[Dashboard tests](../../frontend/src/features/trip/SavedTripsDashboard.test.tsx)
cover auth gating, stable dependencies, all request states, refresh/pagination,
unmount/account/Strict Mode races, literal presentation and real auth/client
composition with mocked HTTP. Existing form/auth/header tests remain regression
gates. See [memory](../memory.md) for measured results and the
[manual runbook](../runbooks/saved-trips-dashboard.md) for live checks not implied
by component tests.
