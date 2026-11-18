# ADR 0002: Validate editable trip details before creating a local draft

- Date: 2026-11-17
- Status: accepted for PR #8's human-requested client validation and local review scope
- Owner: user with Codex assistance; teammate review pending

## Problem and decision

Controlled inputs intentionally contain incomplete strings. They must not become
a normalized trip draft through permissive numeric parsing or date rollover.
Use a pure TypeScript validator returning either typed field errors or a complete
`TripDraft`. React presents feedback; the validator owns checks and normalization.
No dependency, backend request, or persistence is needed for this boundary.

The human's Milestone 5 request requires a **positive** budget. This supersedes
PR #8's earlier zero-budget form policy. The existing database still accepts
nullable/nonnegative budgets; it is a storage foundation, not a business API.
Do not change the shared initial migration. Future request validation must enforce
the established product policy and reconcile generated contracts in PR #11.

Client rules:

- Destination: trimmed nonempty text, at most 200 UTF-16 code units.
- Dates: exact `YYYY-MM-DD`, years 0001–9999, real Gregorian calendar dates.
  End is on/after start; inclusive length is 1–14 days. Past dates are allowed.
- Travelers: decimal digits representing a safe integer from 1–20.
- Budget: positive ordinary USD decimal notation, at most two decimal places,
  from $0.01 through $1,000,000 per person for the entire trip. Scientific/hex
  notation, grouping, currency symbols, trailing decimal points, nonfinite values,
  and excessive precision are rejected. `.50` is accepted as 50 cents.
- Interests: at least one unique ID from the frontend options.
- Constraints: optional, at most 4,000 UTF-16 code units, including whitespace.
  This matches the HTML input limit and stays within the 4,000-character storage
  bound. Whitespace-only optional text normalizes to null.

Only successful validation trims destination/constraints and surrounding numeric
whitespace for the draft, copies interests, and converts numeric text. Editable
input stays unchanged. Dollars become cents by assembling decimal digits, without
float multiplication or rounding. UTC calendar-day arithmetic avoids DST offsets;
manual calendar checks prevent JavaScript rollover and reject malformed dates.

## Feedback and milestone boundary

`Review trip details` validates on submit. Errors appear beside the fields with
`aria-invalid` and `aria-describedby`; a summary announces failure and focus moves
to the first invalid control after rendering. Interest errors describe the group
and its checkboxes; focus goes to the first checkbox when interests are first.
Subsequent edits revalidate without moving focus or losing other entries.
Only successful validation may leave the form for review.

Milestone 8 retains an initially empty atomic alert region so changes to the
current error count can be announced. Review heading focus describes the not-saved
notice. Actual assistive-technology announcements remain a manual verification
requirement; ARIA/unit checks alone do not prove them. See the
[trip form guide](../trip-creation-form.md) for measurements and remaining limits.

Milestone 5 originally created only a local draft and confirmation. Milestone 6
replaces that confirmation with a local summary and an Edit details action.
The container retains original editable strings independently of the normalized
draft, so going back preserves whitespace, numeric entry text, and selections.
Review renders strings as text, local dates without timezone conversion, and
budget as USD for the entire trip per person. Empty optional text has an explicit
fallback. Review heading receives focus on entry; editing focuses Destination.

The optional `onDraftSubmit: (draft: TripDraft) => void` prop on the container
is a synchronous handoff called only from a valid explicit form submission, never
from render/effects or edits. The landing page supplies no callback. PR #11 can
attach a parent handler that maps the draft into generated API types; it must
add actual pending/error states, server validation, and canonical saved results.
This milestone implements no asynchronous save lifecycle or success claim.
The UI explicitly states that the trip is not saved; refreshing clears memory.

Client validation is bypassable. Future backend Pydantic/domain validation must
independently enforce these rules plus ownership, title/timezone resolution,
authorization, and other server invariants. A client draft is not a trusted API
request or proof of persistence.

## Alternatives and verification

A schema/form library could centralize a larger dynamic form, but adds a dependency
without simplifying this small fixed feature. Reconsider when conditional rules
or repeated forms make the pure validator difficult to maintain. Native browser
validation alone cannot express all cross-field rules or produce a normalized
typed result, so `noValidate` leaves error presentation to React.

Pure tests cover calendar/numeric/text boundaries and normalization. UI tests
cover error associations, first-invalid focus, correction, preservation, and stale
success. Browser checks verify failure/success behavior and mobile error layout.
Exact local results and runtime limitations are in [memory](../memory.md).
