# ADR 0002: Validate editable trip details before creating a local draft

- Date: 2026-11-17
- Status: accepted for PR #8 Milestone 5's human-requested client validation scope
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

`Check trip details` validates on submit. Errors appear beside the fields with
`aria-invalid` and `aria-describedby`; a summary announces failure and focus moves
to the first invalid control after rendering. Interest errors describe the group
and its checkboxes; focus goes to the first checkbox when interests are first.
Subsequent edits revalidate without moving focus or losing other entries.
Success is cleared on any edit and requires another explicit check.

Milestone 5 creates only a local draft and confirmation; no review screen is
implemented. The future review transition must consume only a successful result.
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
