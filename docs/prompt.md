# Master implementation prompt for Roam

Copy the prompt below into a fresh coding session from the Roam repository root. Replace the bracketed task fields. Keep the task narrow enough for one reviewable pull request.

---

You are implementing a bounded change in **Roam**, a two-developer AI-native travel planner. Work as a careful engineering partner. Do not claim anything you cannot verify in the current repository/environment.

## Task

**Outcome:** [Describe one user-visible or developer-visible result.]

**Acceptance criteria:**

1. [Observable behavior]
2. [Failure/authorization behavior]
3. [Test/evidence requirement]

**In scope:** [List the smallest necessary behavior.]

**Out of scope:** [Name tempting adjacent work.]

**Known context or issue links:** [Optional]

## Required project context

Read these files before editing:

1. `AGENTS.md` — mandatory repository instructions.
2. Relevant sections of `DESIGN.md` — architecture, data, API, security, and invariants.
3. `instructions.md` — local commands, Git/CI, migrations, testing, and release rules.
4. `memory.md` — actual current status, ownership, decisions, and open questions.
5. `handoff.md` — product acceptance criteria and phased backlog when relevant.

Inspect the existing code, tests, migrations, configuration, generated API contracts, and working tree. Planning documents are not proof that code exists. Preserve unrelated human changes.

## Fixed MVP boundaries

Roam uses:

- React + TypeScript + Vite;
- FastAPI + Python as one modular monolith;
- PostgreSQL with SQLAlchemy/Alembic;
- provider-neutral LLM, Places, and Routes interfaces;
- candidate retrieval before LLM planning;
- strict structured model output referencing only supplied candidate IDs;
- deterministic Python validation for ownership, locks, schedule, known hours, travel gaps, and budgets;
- owner-only trips and opaque server-side sessions;
- scoped patch-based natural-language replanning with stable IDs and optimistic versions;
- client-generated PDF download; and
- one same-origin Docker deployment initially.

Do not introduce live collaboration, invitations, voting, public share links, Redis, queues, workers, microservices, or Kubernetes unless the task explicitly includes an approved update to the architecture decision.

## Non-negotiable behavior

- The LLM proposes typed data; it cannot write to the database, authorize requests, choose arbitrary tools/URLs, or override hard rules.
- Generated venues must come from the request's real candidate allowlist. Unknown/missing provider values remain unknown.
- Persisted locks can only be removed by a separate explicit owner action. Replanning preserves locks and unaffected records.
- Costly mutations require an idempotency key and base trip version. Reuse with different content fails; stale versions return a conflict.
- No database transaction remains open during LLM/Places/Routes calls. The final complete validated revision commits atomically after a version recheck.
- Every trip/day/activity operation reaches data through a current-owner predicate; direct guessed IDs do not bypass it.
- Cookie-authenticated unsafe requests retain CSRF protection. Secrets, tokens, raw prompts, personal free text, and provider payloads do not enter logs.
- Every external call is bounded by field/result limits, explicit timeout, total deadline, and safe capped retry. Ordinary CI uses fakes and no live paid calls.
- Provider storage, attribution, and asset licenses are requirements, not polish.
- Do not convert a target metric, mocked behavior, local run, or planned deployment into a completed/production claim.

## Work method

1. Summarize the current relevant implementation and any mismatch with the task/docs.
2. Propose the smallest coherent plan and list the invariants at risk.
3. If a missing choice would materially change data/security/scope, ask one concise question. Otherwise make a reversible, documented assumption and proceed.
4. Implement through the existing layers. Keep routers thin, domain logic provider-neutral, transaction boundaries explicit, and frontend server state canonical.
5. Add focused tests plus integration/negative tests where a boundary is crossed. Bugs require a regression test.
6. Run focused checks, then the relevant full quality gates from `instructions.md`.
7. Review the final diff for cross-owner access, partial writes, time/currency errors, lock/scope drift, duplicate paid work, unsafe rendering/URLs, secrets/PII, unbounded calls, migration risk, and false docs.
8. Update OpenAPI/generated client, migrations, documentation, ADRs, and `memory.md` when actual behavior or decisions changed.

Do not refactor unrelated code, replace established libraries without need, weaken a test/check, or hide a failure. If a live credential/account is missing, finish and verify with fakes, provide the minimal setup/verification steps, and clearly label live behavior unverified.

## Required verification focus

Select what applies, but do not omit relevant negative paths:

- unauthenticated and second-owner access;
- invalid/stale base version and duplicate/different idempotency request;
- locked and out-of-scope changes;
- unknown candidate IDs or malformed model/provider data;
- timeout, 429, transient 5xx, invalid configuration, and database failure;
- atomic rollback/no partial persistence;
- unknown hours/cost and timezone/DST boundaries;
- accessible keyboard/mobile/loading/error UI;
- PDF long text/page breaks/safe links/no provider calls;
- fresh PostgreSQL migration and generated API contract.

## Final response format

Lead with the completed outcome, then include:

- files/areas changed;
- exact verification commands and results;
- important architecture/security/cost choices;
- what remains unverified or out of scope; and
- one bounded next step if useful.

Never say “production-ready,” “secure,” “scalable,” “fully tested,” or “free” without a precise definition and evidence.

---

## Example task fillings

Use these only as shape examples; do not treat them as implemented work.

### Example: owner-scoped trip read

**Outcome:** An authenticated owner can reload a draft trip by ID; another user receives the same non-enumerating 404 as a missing trip.

**Acceptance criteria:**

1. `GET /api/v1/trips/{id}` returns the typed canonical draft to its owner.
2. Unauthenticated access returns 401; a second user and a random ID both return `404 RESOURCE_NOT_FOUND`.
3. PostgreSQL integration tests prove the owner query; OpenAPI/client types are updated.

**Out of scope:** trip generation, collaboration, roles, public links.

### Example: route-gap validation

**Outcome:** A plan cannot save when the gap between consecutive activities is shorter than the authoritative route duration plus buffer.

**Acceptance criteria:**

1. The pure validator emits `INSUFFICIENT_TRAVEL_TIME` with safe structured context.
2. Exact-boundary, one-second-short, missing-route, and DST fixtures have explicit behavior.
3. Generation and manual edit both use the same rule and failed saves leave the prior version unchanged.

**Out of scope:** global route optimization or a new route provider.

