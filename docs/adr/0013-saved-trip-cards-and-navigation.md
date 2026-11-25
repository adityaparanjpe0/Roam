# ADR 0013: Saved trip cards, formatting and page navigation

- Date: 2026-11-24
- Status: PR #12 Milestone 4 human-reviewed and committed as 3bfc6c6; not merged
- Owner: user with Codex assistance

## Decision and product boundary

Use the existing typed collection response and account-keyed hook to present a
standalone My Trips page. SavedTripsPage composes SavedTripsDashboard; its
authenticated child passes each page to SavedTripList, which renders TripCard
with a TripSummary and a navigation URL. Stable trip UUIDs remain list keys.
Cards have no HTTP, authentication or server-state responsibilities.

The collection DTO supplies title, destination, travel dates, UUID, version and
updated time. Cards display title/destination, dates and inclusive duration.
Travelers, budget and interests are absent from that DTO and are omitted. Do not
load detail data for every card, invent defaults or widen backend contracts for
presentation. The count describes the current page, never an unsupported total.

Keep Roam's paper/green/rust tokens, serif headings, plain CSS, visible control
focus and local CSS surfaces. The grid has one column below 42rem, two from
42rem and three from 64rem. Long text wraps; loading placeholders are hidden
from accessibility APIs. Empty/error states preserve the existing recovery
actions. No photos, paid image service, Maps provider or new asset license.

## Shared formatting

tripFormatting owns deterministic en-US presentation. Calendar dates format in
UTC with their original YYYY-MM-DD value retained in time attributes. Inclusive
duration uses UTC midnight arithmetic plus one day, avoiding viewer timezone,
daylight-saving and year-boundary shifts. These functions consume API/form
validated dates; backend domain validation remains authoritative.

Review and saved-confirmation views also reuse the date, traveler-count and
budget helpers. Currency display includes its code; integer minor units are
scaled using Intl's currency fraction digits (USD cents today). Null budget is
Not specified, distinct from a known zero. The UI retains the per-person,
entire-trip meaning and makes no currency conversion or per-day estimate.

## Routes and navigation scope

Add pinned react-router 8.5.3 in declarative mode for the concrete page URLs,
following its [official installation](https://reactrouter.com/start/declarative/installation)
and [routing](https://reactrouter.com/start/declarative/routing) documentation.
Its registry engine/peer requirements were checked against pinned Node 24.22.3
and installed React/React DOM 19.3.1 before installation. The lockfile adds the
router and its two dependencies; existing package versions are unchanged.

- `/` retains the existing landing page and creation form.
- `/trips` renders My Trips. Old `/#my-trips` bookmarks redirect here.
- `/trips/:tripId` is a navigation shell only. It does not fetch, claim ownership
  or display canonical detail data. Full detail behavior remains future work.
- Unmatched frontend paths show a page-not-found view.

Native anchor links retain normal browser navigation semantics. Plan a New Trip
targets `/#create-trip`. Home fragment focus/scroll runs after React mounts its
target; browser verification found the native cross-page fragment alone could
leave the form offscreen. The creation action focuses the destination input.
Page headings receive programmatic navigation focus without a decorative frame;
interactive controls retain global visible focus styles.

BrowserRouter selects frontend pages; existing AuthProvider, API clients,
cookies, CSRF, provider redirects and Vite API/auth proxies are unchanged.
Production same-origin static serving/history fallback is still planned. It must
serve frontend URLs while preserving `/api`, `/auth` and health handling; a Vite
preview check does not establish production deployment behavior.

## Alternatives and evidence

The human subsequently scoped Milestone 5 to dashboard state/recovery rather
than canonical details; [ADR 0014](0014-dashboard-state-recovery.md) supersedes
that earlier milestone forecast without implementing detail behavior.

Per-card detail calls would add request fan-out to obtain unavailable summary
fields. Mock enrichments or a broken View Trip URL would misrepresent current
behavior. This milestone uses supported fields and an honest destination shell;
it does not implement generation, deletion, activities or full detail loading.

Unit/component tests cover formatting, card semantics/no requests, stable-ID
reordering, routes, counts, auth gating and cross-page form focus. Browser fixture
checks and actual frontend gate results are recorded in [memory](../memory.md).
See the [manual checklist](../runbooks/saved-trips-dashboard.md). Synthetic visual
fixtures do not prove Google login, backend ownership or database integration.
