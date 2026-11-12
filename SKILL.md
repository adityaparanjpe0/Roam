---
name: roam-development
description: Implement, test, review, or document features in the Roam AI-native travel planner. Use for Roam trip CRUD, auth/ownership, grounded planning, deterministic validation, partial replanning, provider integration, PDF export, migrations, deployment, and related debugging. Do not use for unrelated travel advice or generic applications.
---

# Roam development

Build narrow, evidence-backed vertical slices that preserve Roam's AI safety boundary and remain understandable to its two student developers.

## Load context

Before acting:

1. Read `AGENTS.md` for repository-wide constraints.
2. Read the relevant section of `DESIGN.md` for contracts and invariants.
3. Read `memory.md` to distinguish implemented state from the plan.
4. Read `instructions.md` when commands, Git workflow, CI, migrations, or deployment are involved.

If a referenced file is missing, inspect the repository and state the limitation. Do not recreate an entire architecture from memory when the repository already contains a source of truth.

## Classify the task

Choose only the workflow that matches the request:

- **Product feature:** deliver the smallest end-to-end behavior through UI/API/domain/database as needed.
- **Planner or replan:** preserve grounding, typed proposals, validation, locks, versions, and cost bounds.
- **Validation rule:** implement a pure rule with explicit hard-error versus warning semantics and boundary tests.
- **Provider integration:** keep vendor behavior behind an interface and prove normalization/failure handling with fakes.
- **Schema or API change:** update migration/contract, compatibility behavior, generated client, tests, and docs together.
- **Auth/security:** threat-model identity, session, CSRF, ownership, redaction, and negative paths; fail closed.
- **PDF/UI:** use canonical saved data, accessibility, safe links, licensed assets, and representative layout fixtures.
- **Reliability/deployment:** use the existing single-service design; add infrastructure only for a measured need.
- **Diagnosis/review:** report evidence and root cause; do not implement a fix unless requested.

## Shared outcome rules

- Inspect before editing and preserve unrelated work.
- Keep the modular monolith, PostgreSQL, same-origin deployment, and provider-adapter boundaries unless an approved design change says otherwise.
- Treat user, LLM, and provider content as untrusted.
- Keep paid/network calls bounded and absent from ordinary automated tests.
- Never hold a database transaction open during external calls.
- Never let the LLM authorize, calculate authoritative totals, relax locks, or write directly to the database.
- Use stable IDs, an explicit base trip version, and an idempotency key for costly mutations.
- Preserve “unknown” for missing hours, cost, travel, or source data; do not invent a value to satisfy a schema.
- Add regression evidence for bugs and negative authorization/failure tests for boundary work.
- Update `memory.md` and design docs only with verified facts.

## Planner and replan workflow

When changing generation or replanning, preserve this stage order:

1. Authenticate and authorize the trip owner.
2. Validate input, base version, idempotency key, and daily quota.
3. Claim the operation without opening a long database transaction.
4. Retrieve a bounded set of real candidate places and normalize them.
5. Ask the LLM for strict structured output referencing only supplied candidate IDs.
6. Resolve authoritative route legs for consecutive scheduled activities.
7. Run deterministic hard checks and warning checks.
8. Optionally perform one bounded repair with machine-readable violations.
9. Recheck ownership/version and atomically save the complete revision.
10. Record safe planner metadata and return the canonical committed representation.

For replanning, first derive the affected scope and preserve set. Add every locked activity to the preserve set. Propose patch operations against stable activity IDs, apply them to an in-memory copy, compare protected records, and validate the affected schedule plus trip-level budget before saving.

Stop rather than commit when any hard invariant is unresolved.

## Validation workflow

For each rule, define:

- inputs and authoritative data source;
- stable error/warning code;
- hard failure or warning classification;
- behavior when data is unknown;
- time zone and currency semantics;
- whether it applies to manual edits, generation, replanning, or all three; and
- focused unit/property tests plus an integration test if persistence affects it.

Validation should return a collection of typed violations, not raise on the first ordinary business conflict. Unexpected programming/infrastructure failures remain exceptions and must not be disguised as validation results.

## Provider workflow

1. Define or update the provider-neutral model/interface first.
2. Implement a deterministic fake that can return success, timeout, rate limit, malformed data, and partial/unknown fields.
3. Implement the vendor adapter with field masks, allowlisted host, explicit deadlines, capped retry, and error mapping.
4. Store only permitted normalized fields with provenance/freshness. Do not persist unrestricted raw payloads.
5. Add sanitized contract fixtures and attribution/terms notes.
6. Confirm quotas and cost instrumentation before enabling live credentials.

Do not silently fall back from live data to invented sample data in a user request. A clearly labeled demo fixture is acceptable only in demo/test mode.

## Schema and API workflow

- Write the desired invariant and access path before adding a table/column/index.
- Use a new Alembic revision; do not rewrite an applied migration.
- Rehearse fresh upgrade and, when practical, rollback on a disposable PostgreSQL database.
- Keep request/response schemas separate from ORM models.
- Return the standard error envelope and non-enumerating ownership behavior.
- Update OpenAPI-generated frontend types and review the diff.
- Test old/stale version behavior, cross-owner behavior, database constraints, and atomic rollback.
- Document migration and rollback impact in the pull request.

## Auth and security workflow

For auth, session, ownership, or external-content changes, verify:

- OAuth state and required token claims;
- minimal scopes and safe redirect handling;
- opaque session hashing, expiry, rotation, revocation, and secure cookie attributes;
- CSRF defense for unsafe cookie-authenticated methods;
- owner predicate at the repository/query boundary;
- safe output rendering and URL allowlisting;
- secret/PII redaction in logs, errors, fixtures, and planner records; and
- negative tests that use a second authenticated user.

Do not claim RBAC: the MVP has owner-based authorization and no roles unless a real feature adds them.

## PDF and interface workflow

- Use the saved canonical trip; export must not call the LLM, Places, or Routes providers.
- Handle one-day, seven-day, long text, missing optional data, page breaks, and mobile viewing.
- Render all user/provider strings as text and allow only safe `https` links.
- Include estimate/unknown caveats and required provider attribution/source links.
- Do not embed provider tiles, photos, reviews, fonts, or icons without verified redistribution rights.
- Provide keyboard alternatives for drag/reorder and visible focus/error/loading states in the web UI.
- Verify PDF text extraction and visually inspect representative renders.

## Verification and handoff

Run focused tests first, then the relevant repository quality gates from `instructions.md`. A task is not complete when tests could not run; report it as implemented but unverified, or incomplete if the missing verification is safety-critical.

Finish with:

- the user-visible outcome;
- exact checks and results;
- schema/API/security/cost decisions;
- remaining unverified behavior or risk; and
- documentation/memory updates made.

Do not claim deployment, live-provider success, cost, scale, or performance from mocked tests.

