# Trip creation form — PR #8 foundation and PR #11 integration

Status: PR #11 Milestones 1–2 connect the existing form/review to authenticated
POST `/api/v1/trips` on `feat/trip-creation-integration`. Review is local; only
explicit Save sends a request. A validated 201 shows canonical saved data.
Refresh clears in-memory editing/confirmation; it does not delete a saved record.
Live persistence verification remains Milestone 3. No dashboard, provider or AI
call is implemented. The independent development `/health` diagnostic is unchanged.

## Fields and meanings

All values start blank; interests start as an independent empty array.

| Visible field | Editable state | Meaning and validation |
|---|---|---|
| Destination | `destination: string` | City/region entered as text, not a resolved place. Trimmed nonempty label, at most 200 UTF-16 code units. |
| Destination time zone | `timezone: string` | Explicit IANA name, initially blank, trimmed and bounded to 64 characters. Browser support supplies feedback; backend validation is authoritative. Never inferred from the browser. |
| Start date | `startDate: string` | Exact valid `YYYY-MM-DD` calendar date, years 0001–9999. Past dates are permitted. |
| End date | `endDate: string` | Same format; on/after start, with 1–14 inclusive days. Same-day trips are valid. |
| Number of travelers | `travelerCount: string` | Decimal digits representing a whole number from 1–20, including everyone traveling. |
| Budget per person (USD) | `budgetUsd: string` | Total for one person for the entire trip, not daily or group spending. Positive amount from $0.01–$1,000,000 with at most two decimal places. |
| Interests | `interests: Interest[]` | One or more unique values from the eight options below; selections can be independently removed. |
| Additional preferences or constraints | `constraints: string` | Optional multiline text, at most 4,000 UTF-16 code units including surrounding whitespace. It remains untrusted text. |

| Display label | Stable interest value |
|---|---|
| Food | `food` |
| Sightseeing | `sightseeing` |
| Nature | `outdoors` |
| Nightlife | `nightlife` |
| Shopping | `shopping` |
| Art and culture | `culture` |
| Adventure | `adventure` |
| Relaxation | `relaxation` |

The options and derived `Interest` type share one definition in
[tripCreationModels.ts](../frontend/src/features/trip/tripCreationModels.ts).
These match the backend trip-interest allowlist, not the separate database
activity-category enum. Destination/constraints also reject NUL and lone Unicode
surrogates before sending text that PostgreSQL cannot store.

## Normalized local draft contract

Only [validateTripForm](../frontend/src/features/trip/tripValidation.ts) creates
drafts in the current flow. Its result is a discriminated union: an invalid result
has field errors and no draft; a valid result has a complete `TripDraft`.

```ts
interface TripDraft {
  destinationLabel: string
  timezone: string
  startDate: string
  endDate: string
  travelerCount: number
  budgetPerPersonMinor: number
  currency: 'USD'
  interests: Interest[]
  freeTextConstraints: string | null
}

type TripDraftSubmitHandler = (draft: TripDraft) => void
```

Synthetic example:

```json
{
  "destinationLabel": "Lisbon",
  "timezone": "Europe/Lisbon",
  "startDate": "2027-03-27",
  "endDate": "2027-03-30",
  "travelerCount": 2,
  "budgetPerPersonMinor": 75050,
  "currency": "USD",
  "interests": ["food", "culture"],
  "freeTextConstraints": "Step-free access\nVegetarian meals"
}
```

The budget is positive integer cents, so `75050` represents $750.50 per person
for the entire trip. Dates have no instant or timezone conversion. No owner, trip
ID, provider identity or title is fabricated; timezone is explicitly entered.
This local contract maps to the hand-maintained, runtime-validated API contract
in [the trip client](../frontend/src/api/trips.ts), per [ADR 0010](adr/0010-trip-creation-integration.md).

## Validation and submission flow

1. [TripCreation](../frontend/src/features/trip/TripCreation.tsx) owns editable
   values, submission-attempt status, and the optional reviewed draft.
2. [TripCreationForm](../frontend/src/features/trip/TripCreationForm.tsx) renders
   controlled inputs. Submitting prevents browser navigation and asks the container
   to validate; native submit popups are disabled so custom feedback is consistent.
3. Validation rejects malformed date/numeric strings before producing a draft.
   Manual Gregorian checks prevent JavaScript date rollover. UTC day arithmetic
   avoids daylight-saving offsets and handles inclusive duration.
4. Budget parsing assembles decimal digits into cents without float multiplication
   or rounding. Scientific/hex notation, currency symbols, grouping, nonfinite
   values, trailing decimal points/junk, and excess precision are rejected. `.50`
   is accepted. The positive-budget rule supersedes the earlier zero-budget form
   proposal; the existing database schema remains unchanged.
5. Successful normalization trims destination and optional text, trims numeric
   whitespace before conversion, copies interests, and maps blank optional text
   to null. It never clamps or rewrites editable values. Length bounds match HTML
   `maxlength` code-unit semantics; details are in [ADR 0002](adr/0002-trip-form-validation.md).
6. Failure stays on the form. A persistent initially empty alert region reports
   the current error count atomically. Field messages use `aria-describedby` and
   `aria-invalid`; submission focuses the first invalid control. Later edits update
   errors without moving focus or losing unrelated data.
7. Success calls the optional typed `onDraftSubmit(draft)` prop once per explicit
   submission and renders [TripReview](../frontend/src/features/trip/TripReview.tsx).
   The landing page supplies no callback. No render/effect makes this handoff.
8. Review focuses its heading, which describes the server-confirmation notice. It shows
   canonical local draft values as text, preserves preference line breaks, and
   explicitly labels the budget per person for the entire trip. Edit clears the
   reviewed snapshot, restores original entries, and focuses Destination.

Review validation stays synchronous/local and enabled so users can discover
errors. Save is asynchronous: pending feedback and disabled Save/Edit reflect a
real request, with a ten-second deadline. Focus changes for explicit navigation,
server errors and confirmation run during layout, not a later passive effect.

## PR #11 backend connection

The optional callback remains a local-review notification, never a save result.
The container's reviewed-trip controller sends the explicit Save through
[the mapper](../frontend/src/features/trip/tripApiMapping.ts) and API client. It
sends snake_case fields, integer cents and calendar dates, omits title for the
backend default, and never sends owner/status/version. The backend independently
validates session/CSRF, assigns ownership, validates data and commits PostgreSQL.

Only a confirmed authenticated account enables Save. Unknown/loading/signed-out
auth leaves editing/review available. A 401 refreshes the existing auth snapshot;
CSRF failure offers Google sign-in with a warning that full navigation clears
unsaved entries. There is no token/draft browser storage or OAuth redesign.

Recognized 422 fields return to the form with the original raw values, server
validation summary, inline errors and first-invalid focus. Editing clears only
the edited field's server error. General errors keep review editable; raw server
messages/SQL are never shown. Network, timeout and invalid-response errors warn
that a trip may already be saved. No automatic POST retry occurs, and repeated
manual retries may create duplicates because POST is not idempotent.

Save's controller ref blocks a second click before the disabled state renders.
Account changes/unmount abort and forget pending/saved state; late results cannot
show the previous account's confirmation. Editable parent state remains mounted.
Cancellation does not undo a server commit. The saved screen uses validated
server values and offers only explicit Create another trip, not saved-trip
editing or a link to an unimplemented dashboard. See [the API guide](trip-api.md).

## Responsive and accessibility review

The feature reuses Roam's shared fonts, colors, spacing, and radii. Form/review
cards have matching hierarchy, wrapping, and mobile full-width action buttons.
Inputs and interest rows have hover feedback; keyboard focus outlines remain
visible. Native checkmarks distinguish selection without relying on border color.
The checkbox row gets the keyboard outline, with the native outline retained as
a fallback when the selector feature is unavailable. No positive tabindex is used.

Manual procedure (start `npm run dev` from `frontend/`):

1. Open `http://127.0.0.1:5173/#create-trip`. Inspect widths of 320, 375, 768,
   1024, and 1440px. Mobile fields/summary stack; wider layouts use two columns.
   Check blank, invalid, and review screens, including long unbroken preferences.
2. Tab/Shift+Tab through the form. Native dates have internal segment/calendar
   stops. Use Space on interest checkboxes and Enter on the review action. Confirm
   a visible focus indicator and no trap; Edit should return focus to Destination.
3. Submit empty fields, correct one, and check the changing error count and
   associated messages. With a screen reader, verify actual announcements rather
   than relying only on the presence of ARIA attributes.
4. Review valid details and confirm the server-confirmation notice, per-person amount, and
   selected labels. Edit without losing values. Refresh to confirm the form resets.
5. Use actual browser zoom at 200%, then separately enlarge text. Check at narrow
   widths, with OS high-contrast settings, and in other browsers/mobile devices.

Observed locally in Milestone 8: no page overflow at the five standard widths;
4,000-character unbroken review text wrapped. At 320px with doubled root font
size, form/review content stayed within each card after the wrapping fix. However,
the existing landing header/hero still caused page-level overflow in that separate
text-enlargement probe. Those unrelated landing styles were preserved; this is a
known limitation, not a passing whole-page zoom/accessibility claim.

Computed text/background contrast ratios were 5.09:1 for helper text on the card,
5.17:1 for error text on the card, and 5.62:1 for normal button text. These are
measurements of these specific styles, not an accessibility certification. Browser
checks verified Tab traversal, Space selection, Enter review/edit, focus transfer,
hover colors, and disabled CSS appearance (via a temporary browser-only probe).
Actual screen-reader speech, OS forced colors, native pickers across devices,
real browser zoom, and cross-browser behavior remain unverified. See
[frontend test instructions](../frontend/README.md#trip-form-automated-tests--pr-8-milestone-7)
and [memory](memory.md) for test results and evidence limits.
