# AGENTS.md — Roam repository instructions

> Applies to the repository root and every descendant unless a deeper `AGENTS.md` narrows a rule.  
> Project status at creation: documentation only; do not describe planned code as implemented.

## 1. Mission

Help two college developers build Roam as a small, reliable, explainable AI-native travel planner. Optimize for completed vertical slices, learning, security, evidence, and architectural clarity—not feature count or infrastructure novelty.

Every change must preserve this product boundary:

- React/TypeScript frontend;
- FastAPI/Python modular monolith;
- PostgreSQL persistence;
- real Places/Routes data behind provider adapters;
- an LLM that returns typed proposals grounded in supplied candidates;
- deterministic backend validation and authorization;
- owner-only saved trips;
- partial natural-language replanning with locked activities;
- downloadable PDF sharing; and
- one low-cost Docker deployment initially.

Do not add live collaboration, voting, invitations, public share pages, Redis, queues, workers, microservices, or Kubernetes unless a human explicitly approves a documented change to `DESIGN.md`.

## 2. Source-of-truth order

When instructions conflict, use this order:

1. Current human request and repository safety requirements.
2. This file.
3. `DESIGN.md` for architecture, schema, API, validation, security, and operations.
4. `instructions.md` for contributor workflow and quality gates.
5. `memory.md` for current implemented state and recorded decisions.
6. `handoff.md` for backlog and product acceptance criteria.
7. Existing tests and executable contracts.

Do not silently choose between contradictory documents. Report the conflict and update the affected sources in the same change after the intended behavior is established.

## 3. Truthfulness and evidence

- Inspect the repository before proposing or changing files. Do not assume the target layout has been scaffolded.
- Never claim a feature, integration, deployment, security property, performance result, cost, or test pass without current evidence.
- Use “planned,” “target,” or “proposed” for unfinished work.
- Do not invent command output, provider behavior, environment variables, API fields, benchmark values, or model capabilities.
- Treat LLM and provider output as untrusted input.
- If a check cannot run, say exactly why and list what remains unverified.
- Update `memory.md` only with facts supported by the current diff, a merged pull request, a measured run, or an explicit human decision.
- Do not write resume bullets in the past tense until the underlying behavior exists and evidence is linked.

## 4. Work pattern

For every nontrivial task:

1. Read the relevant sections of `DESIGN.md`, `instructions.md`, and `memory.md`.
2. Inspect nearby code, tests, migrations, and generated contracts.
3. State a narrow plan and identify invariants at risk.
4. Implement the smallest coherent vertical slice.
5. Add or update tests at the appropriate levels.
6. Run focused checks, then the relevant full quality gates.
7. Review the diff for secrets, unrelated edits, schema/API drift, PII in logs, and false documentation claims.
8. Update docs, examples, generated clients, migrations, and `memory.md` when behavior or decisions changed.
9. Summarize outcome, evidence, and remaining risk.

Prefer correcting a root cause to adding a special case. Preserve unrelated human changes. Never delete or rewrite work merely to make a test pass without understanding it.

## 5. Planned repository boundaries

Use these boundaries after scaffolding; do not create alternate layers without a reason:

```text
frontend/src/
  api/           generated/client wrappers and error mapping
  components/    reusable presentational components
  features/      trip, planner, replan, auth, export feature modules
  routes/        route-level composition
  styles/        design tokens and global styles
  test/          test setup and fixtures

backend/
  app/
    api/          FastAPI routers and HTTP-only concerns
    core/         config, security, logging, errors
    db/           session, models, repositories, migrations integration
    domain/       provider-neutral entities and invariants
    services/     use cases and transaction orchestration
    providers/    LLM, Places, Routes, and fake adapters
    schemas/      external request/response models
  migrations/    Alembic revisions
  tests/          unit, integration, contract fixtures

docs/             ADRs, runbooks, diagrams, benchmark reports
scripts/          small repeatable project maintenance scripts
```

Dependency direction is HTTP/provider/database adapters → application services → domain. Domain validation must not import FastAPI, SQLAlchemy models, a vendor SDK, or frontend types.

## 6. Architecture rules

### Modular monolith

- Keep one backend deployable and one database.
- Modules may be logically separated but must not communicate through invented network calls.
- Use direct function calls and explicit interfaces inside the process.
- Add infrastructure only after a measured problem and a written decision.

### Same-origin deployment

- The production image builds React assets and serves them through the FastAPI origin.
- Keep API routes under `/api/v1`; frontend history fallback must never swallow `/api`, `/auth`, or health routes.
- Local Vite development may proxy to FastAPI.
- Do not loosen CORS to `*`, especially with credentials.

### Synchronous baseline

- Use synchronous SQLAlchemy and synchronous `httpx` in synchronous FastAPI route/service paths.
- Do not declare `async def` around blocking database or network calls.
- Time out every external call. Never hold a database transaction open while waiting on the LLM or map provider.
- Planning is a bounded synchronous operation initially. Do not use FastAPI in-process background tasks for durable work.

## 7. Domain invariants

The backend is authoritative for these rules:

- Every trip belongs to exactly one user in the MVP.
- Authorization queries filter by both resource ID and owner ID; use a non-enumerating `404` for someone else's resource.
- A trip's start date is not after its end date; trip length, party size, text lengths, and budgets are bounded.
- Activity start is before end; activities stay within their trip/day and use the trip's IANA timezone for display.
- Known opening hours must contain the activity interval. Unknown hours remain an explicit warning, not a fabricated pass.
- Consecutive activities have enough time for the authoritative route duration plus configured buffer.
- Known estimated cost totals use integer minor currency units. Unknown cost is not zero.
- Candidate and activity IDs are stable UUIDs or provider IDs, never array positions.
- An LLM may select only candidate IDs supplied for that run.
- Locked activities cannot have protected fields changed or be deleted by manual or AI-assisted mutations.
- Replan operations affect only the derived scope and preserve unaffected stable records.
- Mutations use the client's base trip version; stale writes return `409 VERSION_CONFLICT`.
- Generation/replan with the same owner, endpoint, idempotency key, and request hash returns the original outcome; key reuse with a different hash is rejected.
- A planning mutation commits the complete validated revision or nothing.

If a requested change weakens an invariant, stop and request an explicit architecture decision.

## 8. AI and provider safety

- Retrieve candidate places before asking the LLM to plan.
- Send the minimum data needed and delimit user/provider text as untrusted data.
- Use a versioned prompt and a strict Pydantic output schema.
- Reject unknown fields/IDs where practical; never execute model-produced code, SQL, URLs, or tool names.
- The LLM does not receive database credentials, provider secrets, session tokens, or unrestricted network tools.
- The LLM cannot write to the database. It returns a proposal; services validate and persist it.
- Bound candidates, prompt size, output tokens, attempts, repairs, provider calls, and total wall time.
- At most one repair attempt is the baseline. Return a useful failure rather than looping.
- Do not silently relax locked, date, ownership, route, hours, or budget rules to make a plan pass.
- Mock providers in tests. Live paid calls require an explicit integration-test switch and must not run in ordinary CI.
- Request only required provider fields and follow current storage, attribution, and refresh rules.
- Do not scrape websites or ingest copyrighted travel content without a documented license.

## 9. Authentication, authorization, and security

- Use a maintained OAuth/OIDC library; do not hand-roll token verification or cryptography.
- Validate state and all required token claims. Request only `openid email profile` unless a documented feature needs more.
- Store a hash of Roam's random opaque session token, not the raw token. Rotate on login and privilege-sensitive changes.
- Use `HttpOnly`, `Secure` outside localhost, `SameSite=Lax`, a narrow path/domain, expiry, and server-side revocation.
- Apply a CSRF token/header check to unsafe cookie-authenticated requests. SameSite alone is defense-in-depth, not the only check.
- Keep secrets in environment/secret storage. Provide placeholder names only in `.env.example`.
- Redact authorization headers, cookies, OAuth codes/tokens, API keys, raw prompts containing personal data, and provider payloads from logs.
- Validate all input on the server. Escape/render user content as text. Allowlist outbound hosts and safe URL schemes.
- Add security headers in the serving layer, including a tested Content Security Policy appropriate to the map/OAuth providers.
- Do not add a role column merely to claim RBAC. The MVP uses ownership authorization; document roles only when behavior needs them.

## 10. Database and migration rules

- PostgreSQL is the test and production database; do not use SQLite as a substitute for integration semantics.
- Use UUID primary keys, UTC `timestamptz` audit timestamps, integer minor units for money, explicit foreign keys, uniqueness, check constraints, and indexes justified by access paths.
- Keep provider-neutral domain data separate from vendor payloads. Do not persist unrestricted raw responses.
- Never edit an Alembic migration that may have been applied outside the branch; add a new migration.
- Make destructive/backfill migrations staged and reversible when practical. Document rollback limits.
- Migration CI must upgrade a fresh database to head. Before release, rehearse upgrade on a disposable database.
- Do not hold transactions across external network calls. Recheck trip version and commit in one final transaction.
- Avoid N+1 queries and unbounded list endpoints. Add ordering and pagination before data can grow without bound.

## 11. API rules

- All JSON APIs live under `/api/v1`; auth redirects may live under `/auth`; health routes are separate.
- Use Pydantic models for requests and responses. Do not return ORM objects directly.
- Use one documented error envelope with stable machine codes, human messages, request IDs, and safe field details.
- Use the correct status classes: `400/422` invalid input, `401` unauthenticated, non-enumerating `404` unauthorized/not found, `409` version/idempotency conflict, `429` quota, `502/503/504` safe upstream/unavailable cases.
- Require `Idempotency-Key` for generation and replan. Require `base_version`/`If-Match` for trip mutations.
- Version breaking contracts instead of silently changing meanings.
- Regenerate frontend API types/client after OpenAPI changes and review the generated diff.

## 12. Frontend and PDF rules

- Treat server responses as the source of truth; map server error codes to specific, recoverable UI states.
- Keep feature state local where possible and server state in TanStack Query. Do not introduce a global state library without a concrete need.
- Forms need labels, inline errors, keyboard operation, focus management, loading state, and duplicate-submit prevention.
- Drag-and-drop must have buttons or keyboard alternatives.
- Display provider attribution and freshness/warning information where required.
- Never say a place is open, a route is exact, a cost is guaranteed, or a reservation exists unless the data supports that claim.
- The PDF uses canonical saved trip data and makes no planning/provider calls.
- Sanitize text, allowlist `https` links, bundle only properly licensed fonts/assets, and avoid provider map screenshots/tiles unless the license is explicitly verified.
- Test one-day, seven-day, long-name, unknown-data, and page-break fixtures.

## 13. Testing expectations

Use the narrowest test that proves the behavior, then add higher-level coverage where boundaries matter.

- **Unit:** domain validator, currency/time calculations, lock comparison, replan scope, error mapping.
- **Property-based:** activity intervals, route gaps, budget totals, lock preservation, patch application.
- **Integration:** FastAPI + PostgreSQL repositories, transactions, constraints, ownership, versions, idempotency.
- **Contract:** fake/provider normalization and sanitized recorded fixtures; no ordinary live network calls.
- **Frontend:** form behavior, error/loading states, locks, accessible edit controls, export data mapping.
- **End-to-end:** login substitute/test session, create → generate with fakes → edit/lock → replan → reload → export.
- **PDF:** render without exceptions, extract expected text, verify safe links, and visually review representative fixtures.
- **Security:** cross-owner access, CSRF, invalid OAuth state/claims, unsafe URLs, log redaction, quota bypass attempts.

Every bug fix needs a regression test unless the reason is documented. Tests must be deterministic: freeze clocks, seed randomness, and use fake provider data.

## 14. Planned quality gates

Use repository scripts as the stable interface once they exist. The intended underlying checks are:

```bash
# Backend
cd backend
uv sync --frozen --all-groups
uv run ruff format --check .
uv run ruff check .
uv run mypy app
uv run pytest

# Frontend
cd frontend
npm ci
npm run lint
npm run typecheck
npm run test -- --run
npm run build

# Repository/release
docker compose config
docker build -t roam:verify .
```

Do not pretend these commands work before scaffolding. When scripts are added, document and prefer a top-level `make verify` or equivalent that invokes the same gates without hiding failures.

## 15. Git and pull-request behavior

- Work on a focused feature branch; do not commit directly to protected `main`.
- Keep commits reviewable and avoid unrelated formatting churn.
- Use migrations and API contract changes in the same pull request as their feature.
- PR descriptions must cover problem, approach, alternatives/tradeoffs, security/data/cost impact, tests/evidence, screenshots for UI, migration/rollback, and follow-up work.
- At least one teammate reviews every PR. Auth, schema, provider, and deployment changes require an explicit walkthrough.
- Never bypass CI or weaken a check to merge. Fix flaky tests rather than retrying until green.
- Do not commit `.env`, credentials, downloaded OAuth client secrets, real user data, generated PDFs with personal data, or vendor response dumps.

## 16. Documentation completion rule

When a change affects architecture, schema, endpoints, invariants, providers, cost, licenses, auth, operations, or scope:

- update `DESIGN.md` and any relevant examples;
- add an ADR under `docs/adr/` for a material decision;
- update `instructions.md` if contributor behavior changes;
- update `handoff.md` acceptance/backlog if scope changes; and
- update `memory.md` with status, evidence, date, owner, and superseded decision.

Documentation is part of the feature, not deferred cleanup.

