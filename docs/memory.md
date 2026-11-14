# Roam durable project memory

> Purpose: preserve verified context across developers and AI sessions  
> Last updated: 2026-11-13
> Rule: this file records decisions and evidence; it must not turn plans into facts

## 1. Current snapshot

### Verified facts

- PR #3 Milestone 1 is committed as `b829d9b` on `feat/backend-foundation`:
  a minimal FastAPI app, Python 3.12 runtime selection, uv lockfile, and backend
  setup instructions. Owner: user with Codex assistance; teammate review and merge
  are not verified. Milestone 2 adds an uncommitted `GET /health` router and
  Pydantic response schema, locally verified with HTTP 200 and `{"status":"ok"}`.
  Endpoint tests remain planned. See the local verification records below.

- The product concept and scoped MVP have been agreed in planning conversation.
- This documentation package contains `handoff.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, `DESIGN.md`, `instructions.md`, `prompt.md`, and `memory.md`, plus an index README.
- The intended builders are two college developers seeking AI-native/full-stack experience, stronger technical depth, and evidence for resume discussions.
- The documentation explicitly targets a low-volume USD $0–$5/month demo and does not guarantee that price.
- PR #2 frontend work is present on `feat/frontend-foundation`: strict React/TypeScript/Vite tooling, a responsive static landing page, and three behavior tests. Branch commits: `613b8af` (tooling), `af4a50e` (landing page), and `2f49eb8` (design simplification and CTA hover). Merge, CI, and teammate review are not verified; status remains `IN_PROGRESS`.
- Node is pinned to **24.22.3** in [`.nvmrc`](../.nvmrc); npm **11.5.1** was used for local verification. Setup, including the path without nvm, is in the [frontend README](../frontend/README.md).
- Resolved frontend versions: React/React DOM **19.3.1**, TypeScript **6.0.3**, Vite **8.3.8**, React plugin **6.3.0**, ESLint **10.14.0**, Vitest **5.1.0**, Testing Library React **16.3.3** / DOM **10.4.2**, jest-dom **7.0.1**, and jsdom **31.0.0**. Exact transitive versions are in the [npm lockfile](../frontend/package-lock.json).

### Not yet verified or implemented

- The original documentation-only snapshot is superseded by the frontend branch evidence above and the minimal backend foundation recorded on 2026-11-13. The backend-placeholder status is superseded; PR #3 is still in progress.
- No backend endpoint test suite, database schema, migration, authentication, LLM integration, Places/Routes integration, validation engine, replanning engine, PDF generator, CI workflow, Docker image, deployment, benchmark, or production run is claimed.
- No provider credentials, billing account, quotas, hosting account, domain, or OAuth consent configuration is claimed.
- Local frontend checks are recorded below. No performance, reliability, security certification, user-satisfaction, cost, or ATS outcome has been measured.
- No resume bullet should use past-tense implementation claims based only on these documents.

### Status legend

- `PLANNED` — documented but no merged evidence.
- `IN_PROGRESS` — branch/PR exists; not yet merged and verified.
- `IMPLEMENTED` — merged with tests/evidence.
- `DEPLOYED` — running in the named environment with a recorded release.
- `MEASURED` — result recorded with date, configuration, method, and raw evidence.
- `SUPERSEDED` — replaced by a later decision with a link.

## 2. Agreed product boundary

### MVP capabilities — `PLANNED`

- Authenticated owner accounts and server sessions.
- Create, edit, save, list, reopen, archive/delete trips.
- LLM itinerary planning grounded in real Places/Routes candidates.
- Deterministic schedule, route, known-hours, budget, and structural validation.
- Manual editing and locks.
- Natural-language partial replanning that preserves locks and unaffected activities.
- Day timeline, map/route view, cost/warning presentation.
- Attractive client-generated PDF download for group-chat sharing.
- PostgreSQL migrations, tests, CI, Docker, low-cost deployment, logs, quotas, and runbook.

### Explicit non-goals

- Live collaboration, invitations, voting, comments, shared ownership, and concurrent collaborative editing.
- Public share links or anonymous trip access.
- Booking/payments/reservations or price/availability guarantees.
- Email/SMS notifications and scheduling.
- Redis, queues, workers, microservices, Kubernetes, or multi-region infrastructure.
- Exact/global route optimization.
- RBAC without an actual role-dependent use case.
- Native mobile/offline apps, live disruption/weather/location tracking.

## 3. Decision log

Material changes should receive an ADR under `docs/adr/` and a row here. Dates are decision dates, not implementation dates.

| ID | Date | Status | Decision | Rationale / consequence |
|---|---|---|---|---|
| D-001 | 2026-11-07 | PLANNED | Use a modular FastAPI monolith with one PostgreSQL database. | Fits two developers and atomic workflows; distribute only after measured pressure. |
| D-002 | 2026-11-07 | IN_PROGRESS | React/TypeScript/Vite frontend, built into the production FastAPI image and served same-origin. | Frontend exists on the PR #2 branch; production image and same-origin serving remain planned. |
| D-003 | 2026-11-07 | PLANNED | Use synchronous SQLAlchemy/httpx/FastAPI paths initially. | Easier to reason about; strict timeouts; queue/async reconsidered from measurements. |
| D-004 | 2026-11-07 | PLANNED | PostgreSQL with SQLAlchemy 2 and Alembic. | Relational ownership, ordered itinerary structure, constraints, transactions, indexing. |
| D-005 | 2026-11-07 | PLANNED | Retrieve real place candidates before LLM planning; model references allowlisted IDs only. | Prevents fabricated venue identity and bounds provider/model work. |
| D-006 | 2026-11-07 | PLANNED | Deterministic Python code is authoritative for authorization, locks, time, routes, known hours, and budget arithmetic. | Probabilistic output cannot enforce hard application invariants. |
| D-007 | 2026-11-07 | PLANNED | Replanning uses a typed scoped patch against stable IDs and a base trip version. | Preserves unaffected work, supports locks, costs less, and is explainable. |
| D-008 | 2026-11-07 | PLANNED | Google OIDC login plus opaque server-side session cookie. | Avoids password storage; supports revocation and same-origin security. |
| D-009 | 2026-11-07 | PLANNED | Authorization is owner-based; no RBAC/admin role in MVP. | There is only one meaningful permission model; avoid decorative complexity. |
| D-010 | 2026-11-07 | PLANNED | Browser generates PDF from canonical saved trip data. | No server renderer or per-export external cost; simple file sharing. |
| D-011 | 2026-11-07 | PLANNED | Planning is a bounded synchronous operation with idempotency and no queue/worker. | Appropriate to demo load; durable async is the measured scaling step. |
| D-012 | 2026-11-07 | PLANNED | Places, Routes, and LLM vendors are behind provider-neutral interfaces. | Fakes, cost/terms portability, and domain independence. |
| D-013 | 2026-11-07 | PLANNED | Describe routing as route-aware scheduling, not exact optimization. | The MVP validates adjacent route feasibility and uses heuristics; no optimizer proof. |
| D-014 | 2026-11-07 | PLANNED | Unknown hours/cost remain warnings/unknown; never infer a fabricated pass/zero. | Honest user communication and safer validation. |
| D-015 | 2026-11-07 | PLANNED | Store provider data only under current retention/attribution rights, with provenance/expiry. | Saved trips/PDF do not override provider terms; unclear fields block launch. |
| D-016 | 2026-11-07 | PLANNED | Use GitHub feature branches, peer PR review, required CI, and explicit ownership evidence. | Teaches team workflow and supports truthful contribution claims. |

## 4. Open decisions and launch blockers

Resolve through a dated decision/ADR before the dependent implementation ships.

| ID | Question | Default if needed for scaffolding | Owner | Due before |
|---|---|---|---|---|
| O-001 | Developer names and primary workstream split? | Use Developer A/B only in planning. | Both | First issue/PR |
| O-002 | Repository owner, name, visibility, and code license? | Private repository; no public license until agreed. | Both | Repository creation/public release |
| O-003 | Exact Python/Node versions and dependency versions? | Frontend Node 24.22.3 and npm lockfile recorded on PR #2; backend Python 3.12 selected and uv lockfile verified on PR #3 Milestone 1. CI/container pins remain open. | Phase 0 owner | Scaffold merge |
| O-004 | Initial LLM provider/model and data-retention setting? | Fake adapter; live model chosen from current structured-output support, cost, latency, and terms. | Planner owner | Live generation |
| O-005 | Exact Places/Routes SKUs and provider data fields allowed in saved trips/PDF? | Persist stable IDs only; do not launch unclear fields. | Provider owner | Live provider persistence |
| O-006 | Initial hosting and managed PostgreSQL vendors/current free limits? | Evaluate current Render-like hobby service and Neon-like Postgres; avoid vendor assumptions in domain. | Deployment owner | First deployment |
| O-007 | Is numeric budget a strict cap or preference? | Strict cap over known costs; unknown cost blocks a “within budget” claim and creates warning. | Product pair | Planner schema |
| O-008 | Trip permanent-deletion and account-deletion retention policy? | Archive for normal UX; design permanent deletion before public users. | Security owner | Public demo |
| O-009 | PDF visual identity, font, and icon licenses? | Text-first design with open-licensed assets only. | PDF owner | PDF merge |
| O-010 | Exact maximum trip days/activities/candidates and daily quotas? | Targets: 14 days and small demo quotas; set from cost/latency tests. | Planner/deploy owners | Live generation |

## 5. Implementation status

Update the evidence column with PR/commit/test/deployment links before changing status.

| Capability | Status | Owner | Evidence | Next acceptance gate |
|---|---|---|---|---|
| Repository scaffold and CI | PLANNED | Unassigned | None | Clean checkout and CI failure/success proof |
| Backend foundation / PR #3 | IN_PROGRESS | User with Codex assistance; reviewer not recorded | Milestone 1 commit `b829d9b`; uncommitted Milestone 2 health route; [backend setup](../backend/README.md); local verification below | Endpoint tests, teammate review, and merge evidence |
| Frontend foundation / PR #2 | IN_PROGRESS | Frontend contributor; reviewer not recorded | Branch commits `613b8af`, `af4a50e`, `2f49eb8`; [tests](../frontend/src/App.test.tsx); verification below | Documentation review, teammate review, and merge evidence |
| Trip schema/migrations/CRUD | PLANNED | Unassigned | None | PostgreSQL integration + cross-owner denial |
| Google OIDC/session/CSRF | PLANNED | Unassigned | None | Invalid state/claims and secure cookie tests |
| Provider-neutral Places/Routes | PLANNED | Unassigned | None | Fake + live opt-in normalization/failure proof |
| Grounded LLM generation | PLANNED | Unassigned | None | Unknown-ID rejection and atomic valid save |
| Deterministic validator | PLANNED | Unassigned | None | Unit/property/integration invariant suite |
| Editing/map/locks | PLANNED | Unassigned | None | Server lock rejection + accessible edit flow |
| Partial replanning | PLANNED | Unassigned | None | Golden scope/lock/version/idempotency tests |
| PDF export | PLANNED | Unassigned | None | Text/layout/link/no-provider-call verification |
| Observability/quotas/runbook | PLANNED | Unassigned | None | Failure drill and safe logs/cost report |
| Docker deployment | PLANNED | Unassigned | None | Repeatable release/rollback and recorded URL |
| Benchmarks/interview evidence | PLANNED | Unassigned | None | Dated measured report and walkthrough |

## 6. Ownership ledger

Both developers must understand the full architecture. This ledger identifies depth, not exclusive knowledge.

| Date | Workstream/PR | Primary implementer | Reviewer/pair | Personal contribution | What both can explain |
|---|---|---|---|---|---|
| — | Not assigned | Developer A | Developer B | — | — |
| — | Not assigned | Developer B | Developer A | — | — |
| 2026-11-12 | PR #2 frontend foundation | User with Codex assistance; name not recorded | Teammate review not verified | Tooling, landing page, tests, design refinements; documentation in progress | Strict TypeScript, component structure, CSS tokens, accessibility checks, and the static-concept boundary |

For each meaningful PR, capture design, code, tests, debugging, and review work separately. Do not equate lines changed with ownership.

## 7. Evidence ledger

### PR #3 Milestone 2 local verification — 2026-11-13

- Owner: user with Codex assistance, on `feat/backend-foundation`; no commit,
  teammate review, merge, or deployment claimed for this milestone.
- Added a synchronous [health router](../backend/app/api/health.py), registered
  in the application, and a [response schema](../backend/app/schemas/health.py)
  whose status is restricted to `ok`. No dependencies changed.
- Human-approved contract: `GET /health` is dependency-free liveness with
  HTTP 200 and `{"status":"ok"}`. This refines the earlier proposed separate
  health paths; readiness remains planned. See [DESIGN.md](DESIGN.md).
- Using the existing Windows Python 3.12.16 virtual environment:
  `.venv/Scripts/python.exe -m ruff format --check .` passed (7 files already
  formatted), `-m ruff check .` passed, and `-m mypy app` passed (6 source files).
  Editor diagnostics reported no errors in the application package.
- An ephemeral verification script started Uvicorn on loopback port 8765 and
  checked actual HTTP responses: `/health` returned **200**, content type
  **application/json**, and exactly `{"status":"ok"}`; `/openapi.json` returned
  **200**, listed `/health`, and described the response status as constant `ok`.
  The script stopped its verification server afterward.
- No pytest test files were created or executed; Milestone 3 remains pending.
  No frontend files, external provider integrations, or paid calls were involved.

### PR #3 Milestone 1 local verification — 2026-11-13

- Environment: Windows; uv **0.13.8**, CPython **3.12.16**, isolated
  `backend/.venv`. uv was installed into a temporary tools directory without
  modifying PATH; developers should follow the uv installation instructions
  in the [backend README](../backend/README.md).
- Runtime versions installed from [uv.lock](../backend/uv.lock): FastAPI
  **0.162.7**, Pydantic **2.14.3**, Uvicorn **0.54.0**. Development versions:
  HTTPX **0.28.1**, pytest **9.2.0**, Ruff **0.17.5**, mypy **1.20.2**.
- `uv sync --all-groups`: resolved dependencies and created the virtual environment.
  Subsequent `uv --no-cache sync --frozen --all-groups --offline` and
  `uv --no-cache lock --check --offline`: passed using the committed-file candidate
  lockfile. The temporary uv executable was invoked by its absolute path.
- `uv --no-cache run --locked --offline ruff format --check .`: passed
  (3 files already formatted); `ruff check .`: passed; `mypy app`: passed
  (2 source files). The same `uv run` flags were used for each tool.
- `.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`:
  application startup completed. Local HTTP checks returned **200** for `/docs`
  and `/openapi.json`; schema title was `Roam API` and custom path count was **0**.
  The verification server was stopped afterward.
- Editor diagnostics reported no errors in the application entry point or
  dependency configuration. `git diff --check` passed; `git check-ignore`
  confirmed virtual-environment and pytest/Ruff/mypy cache paths are ignored.
- No pytest tests were created or executed; endpoint testing belongs to Milestone 3.
  No macOS/Linux execution, CI, teammate review, merge, or deployment is claimed.

This record supersedes the earlier backend-placeholder snapshot only. It does
not mark the overall scaffold/CI milestone or backend foundation complete.

| Date | Claim | Evidence link/path | Environment/config | Limits/caveats | Approved wording |
|---|---|---|---|---|---|
| 2026-11-07 | Roam has a scoped architecture/documentation plan. | This documentation package | Documentation only at package creation | Historical snapshot; frontend status superseded on 2026-11-12 | “Designed a plan for…” only for unimplemented capabilities |
| 2026-11-12 | Frontend foundation works locally on the feature branch. | `613b8af`, `af4a50e`, `2f49eb8`; [test suite](../frontend/src/App.test.tsx); checks below | macOS, Node 24.22.3, npm 11.5.1 | No merge/CI/deployment claim; no planning functionality | “Built and locally verified a frontend foundation on a feature branch.” |

### PR #2 local verification — 2026-11-12

From `frontend/`, with the pinned runtime supplied using `npm exec --yes --package=node@24.22.3 --`:

- `npm ci`: passed using the committed lockfile.
- `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and `npm run build`: passed; the suite contains **3 passing tests**.
- `npm ls --depth=0`: no dependency conflicts reported during Milestone 1.
- Chrome checks during Milestone 2: no horizontal overflow at widths 320, 375, 768, 1024, and 1440; doubled-text reflow at width 640; visible skip-link focus; Enter focuses main content; next Tab reaches the CTA; CTA navigation works; no page errors reported. Desktop and mobile captures were visually inspected. Temporary Playwright tooling was used, not a committed e2e suite.
- Body, muted, and accent text on the paper background have calculated contrast ratios of **10.71:1**, **5.53:1**, and **5.62:1**. Screen-reader and cross-browser testing remain unverified.
- Full npm audit: **10 moderate findings** associated with the development lint toolchain's `minimatch` dependency. Production-only audit: **0 reported vulnerabilities**. No forced override/downgrade was applied; recheck upstream fixes before merge.

The landing page uses a static, explicitly labeled planner concept with generic activities. It performs no trip generation or backend/provider calls. React Router, TanStack Query, API clients, auth, maps, and PDF packages remain deferred. The original decorative postcard design was superseded by the user-approved simplification in `2f49eb8`.

Documentation milestone: frontend setup and these evidence records are being updated on the same branch. No new architecture decision supersedes D-002; same-origin production serving remains planned.

Examples of acceptable future evidence:

- merged PR and named test proving owner authorization;
- migration and integration test on PostgreSQL;
- CI run for a release commit;
- provider/model benchmark with prompt/model/date and raw summary;
- generated PDF fixture plus layout/text/link check;
- deployment URL, release commit, schema revision, and health output;
- cost dashboard snapshot/ledger with call/token counts; and
- issue/PR showing a failure, root cause, regression test, and fix.

## 8. Cost ledger

The goal is USD $0–$5/month for a low-volume demo. “Free” is not a permanent property.

| Review date | Component/provider | Plan/SKU/model | Free allowance assumption | Hard cap/quota | Actual spend | Evidence |
|---|---|---|---|---|---:|---|
| 2026-11-07 | GitHub | Free | Current pricing page indicates free repositories and Actions allowance | Cancel superseded CI | $0 claimed only for docs | Official pricing link in `handoff.md` |
| 2026-11-07 | Hosting | Unselected | Hobby free service may exist with cold starts | To configure | Not measured | Open O-006 |
| 2026-11-07 | PostgreSQL | Unselected | Managed free allowance may exist | Storage/compute monitor | Not measured | Open O-006 |
| 2026-11-07 | LLM | Unselected | Free/low-cost model may exist | App daily quota + token cap + provider budget | Not measured | Open O-004 |
| 2026-11-07 | Places/Routes | Unselected SKU set | Current per-SKU allowances vary | App counter + provider quota/alert | Not measured | Open O-005/O-010 |
| 2026-11-07 | PDF | Client library | No external call per export | No live provider in export | Not measured | D-010 |

Review pricing/terms before enabling billing and monthly while deployed. Record actual bill even when zero.

## 9. Benchmark ledger

No benchmark has been run.

| Date | Commit | Prompt/model/provider versions | Fixture set | Hard-valid rate | Lock preservation | p50/p95 latency | Cost/success | Notes |
|---|---|---|---|---:|---:|---:|---:|---|
| — | — | — | — | Not measured | Not measured | Not measured | Not measured | Do not invent values |

Benchmark results must separate unknown hours/cost from verified compatibility and state hardware/network/sample size.

## 10. Failure and learning log

Use this for real debugging stories suitable for retrospectives/interviews.

| Date | Symptom/impact | Root cause | Detection gap | Fix and regression evidence | Owner | Follow-up |
|---|---|---|---|---|---|---|
| — | No implementation incidents yet | — | — | — | — | — |

Do not manufacture a “biggest challenge.” Record one after it actually happens.

## 11. Interview notes

These are the planned answers; replace generalities with project evidence as implementation proceeds.

### Architecture in one minute

React talks to a same-origin FastAPI modular monolith. FastAPI authenticates the session and authorizes by trip owner. For planning it retrieves a bounded set of real place candidates, sends only those candidates and constraints to a structured-output LLM, obtains routes for consecutive activities, and runs deterministic validation. A complete valid itinerary saves atomically to PostgreSQL with a version/revision. Partial replanning applies a scoped patch and preserves locks. The client renders and exports the saved trip as a PDF.

### Key tradeoff

A modular monolith and synchronous bounded planning are intentionally simpler than microservices/queues for two developers and demo traffic. They make transactions, local debugging, and deployment easier. Measured request-lifetime/concurrency problems would trigger a durable operation queue and horizontal web scaling.

### AI reliability answer

The LLM is not the authority. Grounded candidate IDs, strict schemas, allowlisted patch operations, deterministic validation, locked-record comparison, quotas, and atomic persistence contain failures. Unknown external data remains a warning. This reduces hallucination impact; it does not claim the LLM cannot make mistakes.

### Auth answer

OIDC authenticates identity; Roam creates a revocable opaque session. Authorization is an owner predicate on every resource query. There is no RBAC because there are no roles in the MVP.

### Scaling answer

First measure external cost/latency and database connections/queries. Bound work and optimize queries. Then horizontally scale stateless web instances with pooling. Move planning to a durable queue when it must survive request lifetime or bursts. Add cache/Redis only for proven, license-permitted hot data/coordination. Extract services only for independent scaling/ownership pressure.

## 12. Update protocol

After every merged PR:

1. Update the capability status/evidence.
2. Add ownership details.
3. Add/change a decision only if one was actually made.
4. Update cost/benchmark/failure ledgers only from real measurements.
5. Mark a superseded entry rather than erasing useful history.
6. Remove resolved open questions or link to their ADR.
7. Keep this file concise enough to read at session start; move long reports to `docs/` and link them.

An AI assistant may propose memory edits, but a developer should verify claims and links during review.

