# Roam durable project memory

> Purpose: preserve verified context across developers and AI sessions  
> Last updated: 2026-11-17
> Rule: this file records decisions and evidence; it must not turn plans into facts

## 1. Current snapshot

### Verified facts

- PR #8 Milestone 6 (2026-11-17), owner: user with Codex assistance, on
  `feat/trip-creation-form`: [the container](../frontend/src/features/trip/TripCreation.tsx)
  validates on submit and only successful results enter
  [local review](../frontend/src/features/trip/TripReview.tsx). An optional typed
  `onDraftSubmit(draft)` callback receives normalized `TripDraft` values only from
  valid explicit submissions. The landing page supplies no callback. The review
  shows all fields, USD budget per person for the entire trip, readable interest
  labels, and optional-text fallback. It explicitly says the trip is not saved
  and refresh clears details. Editable strings remain in the container separately
  from the reviewed snapshot; Edit details preserves raw values and selections.
  Focus moves to the review heading, then back to Destination on edit. Text is
  rendered literally and multiline preferences retain line breaks. This
  supersedes Milestone 5's check-only confirmation and review-planned status.
  Milestone 5 completion is human-reported; Milestone 7 has not begun. Backend
  integration, save lifecycle, storage, auth, database changes, and generation
  remain out of scope. [ADR 0002](adr/0002-trip-form-validation.md) records the
  callback boundary and future PR #11 responsibilities.
  Verification: lint, strict typecheck, **115 tests in 5 files**, production build,
  and `git diff --check` passed using Node **24.11.1** / npm **11.6.2**. Required
  Node **24.22.3** verification remains outstanding. Tests prove no callback on
  invalid submission, one call per valid explicit review under Strict Mode, exact
  normalized payloads, edit/review updates, literal rendering, and no network or
  browser-storage writes from the production form/review flow. Browser checks
  confirmed invalid → review → edit → invalid transitions and focus destinations;
  all raw fields and interests survived edit. No page overflow at 320/375/768/1440px.
  Full screen-reader/cross-browser review remains outstanding. No dependency was
  added, and no commit, push, or merge was performed.

- PR #8 Milestone 5 (2026-11-17), owner: user with Codex assistance, on
  `feat/trip-creation-form`: adds [pure typed validation](../frontend/src/features/trip/tripValidation.ts)
  returning either field errors or a complete local draft. Checks include real
  calendar dates, 1–14 inclusive days, 1–20 whole travelers, positive USD decimals
  up to $1,000,000 with at most two decimal places, nonblank destination up to
  200 UTF-16 code units, unique allowlisted interests, and optional constraints
  up to 4,000 UTF-16 code units. Decimal digits become safe integer cents without
  rounding. Invalid results never contain a draft. Normalization preserves editable
  state, trims draft text/numeric whitespace, copies interests, and represents
  blank optional constraints as null. The human's positive-budget requirement
  supersedes earlier PR #8 zero-budget decisions; database storage is unchanged.
  [ADR 0002](adr/0002-trip-form-validation.md) records rules and alternatives.
  The local check action shows associated errors, announces failure, and focuses
  the first invalid control after submit. Corrections revalidate without moving
  focus or discarding data. Valid checks show an honest local success; any edit
  clears success. Milestone 4 completion is human-reported; Milestone 6 review UI
  and all backend integration remain unimplemented. No dependency was added.
  Verification: lint, strict typecheck, **112 tests in 5 files**, production build,
  and `git diff --check` passed on existing Node **24.11.1** / npm **11.6.2**.
  Required Node **24.22.3** verification remains outstanding. In the browser,
  empty submission showed six field errors and focused destination; all invalid
  inputs described their error. Valid Lisbon details (March 27–30 2027, two
  travelers, $750.50, Food) showed success. Changing budget to zero removed
  success, showed only a budget error, and focused budget on recheck while
  preserving the destination text. Error layout had no overflow at 320px.
  Screen-reader and cross-browser review remain outstanding. No API request,
  persistence, commit, push, or merge was performed by this milestone.

- PR #8 Milestone 4 (2026-11-17), owner: user with Codex assistance, on
  `feat/trip-creation-form`: adds eight native controlled interest checkboxes
  and an optional multiline constraints field to the
  [existing form](../frontend/src/features/trip/TripCreationForm.tsx). The
  [options and derived Interest type](../frontend/src/features/trip/tripCreationModels.ts)
  share one definition; selected IDs stay in `Interest[]`. Labels are Food,
  Sightseeing, Nature, Nightlife, Shopping, Art and culture, Adventure, Relaxation.
  Nature retains `outdoors` and Art and culture retains `culture`; the initial
  unused `other` option is replaced by the requested expanded vocabulary. This
  supersedes the initial frontend tags only; backend semantics remain deferred.
  Changes replace the interest array without mutating previous state and preserve
  other fields. Native checkmarks and selected borders indicate selection; a
  fieldset/legend names the group. The textarea starts empty and retains newlines,
  with the existing 4,000-character storage-aligned limit. No validation messages,
  API/persistence, recommendations, search, or dependencies were added. Milestone
  5 has not begun; Milestone 3 completion is human-reported.
  Verification: lint, strict typecheck, **44 tests in 4 files**, production build,
  and `git diff --check` passed using existing Node **24.11.1** / npm **11.6.2**.
  Required Node **24.22.3** verification remains outstanding. Browser checks proved
  Space selects/deselects and Tab reaches the next checkbox; multiline input was
  retained. No page overflow at 320/375/768/1440px; interests were one column on
  mobile and two on wider screens. Full screen-reader/cross-browser review remains
  outstanding. No commit, push, or merge was performed.

- PR #8 Milestone 3 (2026-11-17), owner: user with Codex assistance, on
  `feat/trip-creation-form`: [the core form](../frontend/src/features/trip/TripCreationForm.tsx)
  now contains five labeled controlled inputs, with native date/number controls
  and [responsive token-based CSS](../frontend/src/features/trip/TripCreation.css).
  [The landing page](../frontend/src/routes/LandingPage.tsx) mounts it at
  `#create-trip` and adds an entry link while preserving existing navigation/content.
  Defaults remain blank and numeric editing values remain strings. Required/min/
  max/step attributes provide input hints; `noValidate` prevents native submit
  validation, and submission still only prevents navigation. No submit button,
  interests/constraints UI, custom validation, normalized draft creation, review,
  API request, or persistence was added. Milestone 2 was reviewed per the user;
  Milestone 4 has not begun. This supersedes Milestone 2's isolated/unmounted status.
  Windows verification: lint, strict typecheck, **40 tests in 4 files**, production
  build, and `git diff --check` passed. Existing Node **24.11.1** / npm **11.6.2**
  were used; verification on required Node **24.22.3** remains outstanding.
  Browser measurements at 320/375/768/1024/1440px found no page overflow or clipped
  form inputs; mobile had one column and wider screens two. All five fields accepted
  values in the browser. Sampled keyboard focus outlines were visible; native dates
  have internal tab stops. Full keyboard/screen-reader and cross-browser review
  remain outstanding. The existing development health check showed expected HTTP
  502 with FastAPI stopped; it did not block the form. No dependencies were added,
  and no commit, push, or merge was performed.

- PR #8 Milestone 2 (2026-11-17), owner: user with Codex assistance, on
  `feat/trip-creation-form`: adds [editable/draft types and fresh defaults](../frontend/src/features/trip/tripCreationModels.ts),
  [local state](../frontend/src/features/trip/TripCreation.tsx), and an isolated
  [controlled form foundation](../frontend/src/features/trip/TripCreationForm.tsx).
  Numeric editing values remain strings; the target normalized draft uses integer
  USD cents and nullable optional constraints. No normalization or validation
  function is implemented yet. Only the destination field is rendered in isolation;
  the landing page is unchanged. Remaining fields, validation, review, and PR #11
  request integration remain planned. This supersedes the no-trip-form-foundation
  status only; no completed form, persistence, or API contract is claimed.
  Verification on Windows: focused tests **5 passed**; full Vitest suite **37
  passed in 4 files**; `npm run lint`, `npm run typecheck`, and `npm run build`
  passed. Editor diagnostics reported no errors in the new feature, and
  `git diff --check` passed. Checks used existing Node **24.11.1** / npm
  **11.6.2**, not the required Node **24.22.3**, which was not installed.
  Verification with the pinned runtime remains outstanding. No dependency
  installation, browser visual review, commit, push, or merge was performed.

- Local Git reconciliation (2026-11-17): this branch includes database-foundation
  merge `3fbf770` and verification commit `2a159bc`. This supersedes older
  uncommitted/unmerged PR #7 statements below for local Git history only; hosted
  CI execution and teammate review are not inferred.

- PR #7 Milestone 3 (2026-11-17), on `feat/database-foundation`: extends the
  existing [backend CI job](../.github/workflows/backend-ci.yml) with an independent
  PostgreSQL 18.7 service and a separate opt-in database/migration test step.
  The check name, permissions, timeout, action pins, and other gates are preserved.
  [Local workflow](../backend/README.md#complete-local-database-workflow--pr-7-milestone-3)
  and [CI instructions](CI.md#postgresql-and-migrations) are updated. Locally,
  **35 database-free tests passed** (47 skipped), and **47 database tests passed**
  (35 deselected) using a separate disposable container. Static workflow validation
  and env-file migration commands passed. Hosted execution, teammate schema review,
  merge, and deployment remain unverified. Milestone 3 changes are uncommitted.
- PR #7 Milestone 2 (2026-11-17), on `feat/database-foundation`: adds four typed
  ORM models and Alembic **1.20.1**, locked with Mako **1.4.3** and MarkupSafe
  **3.0.4**. Revision `0001` creates users, trips, trip days, and user-entered
  activities. [ADR 0001](adr/0001-database-foundation.md) records exact initial
  constraints and deferred fields/validation. PostgreSQL verification:
  **82 passed**; default suite **35 passed / 47 skipped**. Milestone 1 was
  committed by the developer as `9930403`; Milestone 2 was subsequently committed
  by the developer as `4b6bdd7` before Milestone 3.
  This supersedes the earlier models/Alembic-planned status below. No business
  API, frontend, Compose, or CI workflow change is included in this milestone.
- PR #7 Milestone 1 (2026-11-16), on `feat/database-foundation`: adds validated
  environment configuration, synchronous SQLAlchemy/psycopg engine/session
  infrastructure, shutdown disposal, and safe opt-in PostgreSQL tests. Installed
  versions: SQLAlchemy **2.1.9**, psycopg / psycopg-binary **3.3.9**, locked by uv.
  Existing `/health` remains independent. No ORM models, Alembic, business
  endpoints, frontend changes, or CI workflow changes are included yet.
- Local `main` / GitHub `main` were verified at `0fe36a5` before starting PR #7.
  This includes the integration merge (actual GitHub PR #5) and CI merge
  `80e3d3a` (actual GitHub PR #4). These records supersede the prior pending
  merge statements below. Hosted workflow execution and teammate approval are
  not inferred from source history.

- Merge reconciliation (2026-11-16): `origin/main` at `80e3d3a` includes PR #4's
  CI workflows and guide. The in-progress merge preserves those changes and
  PR #6's integration work. Historical CI branch-only/unmerged statements below
  are superseded for merge status; hosted execution and teammate approval remain
  unverified. No workflow or application source was changed during resolution.
- Post-resolution local checks (2026-11-16): the workflow-equivalent locked
  installs, backend Ruff format/lint, mypy, and pytest passed (3 tests, existing
  Starlette/HTTPX warning). Frontend clean install, ESLint, typecheck, Vitest
  (32 tests), and production build passed with pinned Node 24.22.3. Both complete
  CI and integration evidence sections were retained verbatim. These macOS
  results do not verify hosted Ubuntu execution. The merge commit is pending
  developer review; Codex did not commit or push.

- PR #4 Milestone 5: user with Codex assistance added the [CI guide](CI.md)
  and necessary documentation links/status corrections on 2026-11-16.
  All 14 workflow command lines are present in the guide. Both packages' local
  installs and checks passed again; detailed evidence is below. This supersedes
  the earlier Milestone-5-not-started status. No hosted run, merge, deployment,
  or Milestone 6 work is claimed.

- PR #4 Milestone 4: user with Codex assistance reviewed both package CI
  workflows on 2026-11-16. Added explicit Bash shell defaults, backend runtime
  logging, and comments preserving all-path triggering. Existing read-only
  permissions, locked installs, supported action SHA pins, unique names,
  ten-minute limits, separate cancellation groups, and disabled caches were
  retained. Local package checks and Bash failure propagation passed; evidence
  is below. This supersedes the earlier Milestone-4-not-started status.
  Milestone 5 has not begun; hosted CI evidence remains unverified.

- PR #4 Milestone 3: user with Codex assistance added the separate
  [frontend CI workflow](../.github/workflows/frontend-ci.yml) on
  `chore/github-actions-ci`. On 2026-11-16, clean `npm ci`, ESLint, TypeScript,
  all three existing Vitest tests, and the production build passed on Windows
  with Node 24.22.3/npm 11.19.1. Exact evidence is below. No hosted CI run or
  merge is claimed. This supersedes the Milestone 2 frontend-CI-planned status;
  Milestone 4 has not begun.

- PR #4 Milestone 2: user with Codex assistance added the
  [backend CI workflow](../.github/workflows/backend-ci.yml) on
  `chore/github-actions-ci`. Local locked sync, Ruff, mypy, and all three health
  tests passed on 2026-11-16; exact evidence is below. No commit, hosted CI run,
  teammate review, or merge is claimed. Frontend CI remains planned for
  Milestone 3. This supersedes only the earlier claim that no CI workflow exists.

- Backend foundation: `b829d9b` (Python/uv/app setup), `9cc6424` (typed health
  endpoint), and `8f2115c` (tests/documentation) are included in local `main` via
  merge `e08a3f0`. Frontend foundation is included via merge `2281737`.
  These local Git records supersede the earlier uncommitted/unmerged status
  statements. Teammate approvals and CI remain unverified. Historical workstream
  labels PR #2 (frontend) and PR #3 (backend) are retained here; actual merge
  messages number them #1 and #2 respectively.
- PR #5 local PostgreSQL work includes configuration `f715de3`, verification
  record `6bb7bea`, and documentation `7cf6e1f`, merged into local `main` via
  `2e4fa6f` (actual GitHub merge message #3). This supersedes its earlier
  documentation-in-progress and unverified-merge status.
  PostgreSQL 18.7 was healthy on localhost; authenticated host access and
  restart/recreation persistence were verified on 2026-11-15. No backend database
  integration, application schema, or migration was added. Owner: user with Codex
  assistance; teammate review is not verified.
- PR #6 health integration is on `feat/front-back-int`: `d66391a` adds the
  validated fetch client/proxy, `ab6e482` adds the development-only status panel,
  and documentation/live verification are recorded below. Real HTTP success,
  backend-down failure, and restart/retry recovery were verified locally.
  PR #6 is not claimed merged, reviewed, deployed, or verified in CI.

- The product concept and scoped MVP have been agreed in planning conversation.
- This documentation package contains `handoff.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, `DESIGN.md`, `instructions.md`, `prompt.md`, and `memory.md`, plus an index README.
- The intended builders are two college developers seeking AI-native/full-stack experience, stronger technical depth, and evidence for resume discussions.
- The documentation explicitly targets a low-volume USD $0–$5/month demo and does not guarantee that price.
- Frontend work includes strict React/TypeScript/Vite tooling, a responsive static landing page, and three behavior tests. Source commits: `613b8af`, `af4a50e`, `2f49eb8`, and documentation `53250ec`. Merge evidence is recorded above; CI and teammate approval are not claimed.
- Node is pinned to **24.22.3** in [`.nvmrc`](../.nvmrc); npm **11.5.1** was used for local verification. Setup, including the path without nvm, is in the [frontend README](../frontend/README.md).
- Resolved frontend versions: React/React DOM **19.3.1**, TypeScript **6.0.3**, Vite **8.3.8**, React plugin **6.3.0**, ESLint **10.14.0**, Vitest **5.1.0**, Testing Library React **16.3.3** / DOM **10.4.2**, jest-dom **7.0.1**, and jsdom **31.0.0**. Exact transitive versions are in the [npm lockfile](../frontend/package-lock.json).

### Not yet verified or implemented

- The original documentation-only and backend-placeholder snapshots are superseded by the foundation merge records above and the PR #5 database verification. Production deployment remains planned.
- Beyond the foundations, HTTP health integration, and PR #7's four-table
  schema/migration above, no authentication, LLM/Places/Routes integration, validation/replanning
  engine, PDF generator, production application image, deployment, benchmark, or
  production run is claimed. Backend/frontend CI workflow files are present;
  hosted CI execution remains unverified.
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
| D-002 | 2026-11-07 | IN_PROGRESS | React/TypeScript/Vite frontend, built into the production FastAPI image and served same-origin. | Frontend is merged locally; PR #6 uses a health-only development proxy. Production image/static serving remain planned. |
| D-003 | 2026-11-07 | PLANNED | Use synchronous SQLAlchemy/httpx/FastAPI paths initially. | Easier to reason about; strict timeouts; queue/async reconsidered from measurements. |
| D-004 | 2026-11-07 | IN_PROGRESS | PostgreSQL with SQLAlchemy 2 and Alembic. | Local PostgreSQL/Compose, connections/sessions, four ORM models, and Alembic revision 0001 are verified. See ADR 0001. Database CI is configured; hosted proof/review and business APIs remain outstanding. |
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
| O-003 | Exact Python/Node versions and dependency versions? | Node 24.22.3/npm lockfile and Python 3.12/uv lockfile recorded; local PostgreSQL image pinned to `18.7-bookworm` on PR #5. Application CI/container runtime pins remain open. | Phase 0 owner | Scaffold merge |
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
| Repository scaffold and CI | IN_PROGRESS | User with Codex assistance; user reports Milestone 2 reviewed | [Backend workflow](../.github/workflows/backend-ci.yml), [frontend workflow](../.github/workflows/frontend-ci.yml); local Milestone 2/3 checks below | Hosted CI failure/success proof; broader gates remain planned |
| Backend foundation / historical PR #3 | IMPLEMENTED | User with Codex assistance; reviewer not recorded | Local `main` merge `e08a3f0`; `8f2115c`; [backend setup](../backend/README.md); historical verification below | Test-client warning follow-up; CI and reviewer evidence not recorded |
| Frontend foundation / historical PR #2 | IMPLEMENTED | Frontend contributor; reviewer not recorded | Local `main` merge `2281737`; [tests](../frontend/src/App.test.tsx); historical verification below | CI and reviewer evidence not recorded |
| Local PostgreSQL / historical PR #5 | IMPLEMENTED | User with Codex assistance; reviewer not recorded | Local `main` merge `2e4fa6f`; `f715de3`, `6bb7bea`, `7cf6e1f`; [runbook](runbooks/local-postgres.md) | Production hardening remains planned; reviewer evidence not recorded |
| Frontend/backend health integration / PR #6 | IN_PROGRESS | User with Codex assistance; reviewer not recorded | `d66391a`, `ab6e482`; [client](../frontend/src/api/health.ts), [UI](../frontend/src/features/connection/ConnectionStatus.tsx), live verification below | Documentation review, teammate review, and merge evidence |
| Trip schema/migrations/CRUD | IN_PROGRESS | User with Codex assistance; reviewer pending | [Models](../backend/app/db/models/), [initial revision](../backend/migrations/versions/0001_create_users_trips_days_and_activities.py), PostgreSQL tests | CRUD and cross-owner authorization remain planned |
| PostgreSQL foundation / PR #7 | IN_PROGRESS | User with Codex assistance; reviewer not recorded | [Settings](../backend/app/core/config.py), [sessions](../backend/app/db/session.py), [ADR 0001](adr/0001-database-foundation.md), [CI](../.github/workflows/backend-ci.yml), evidence below | Milestone 3 review, hosted Backend checks success, and teammate schema walkthrough before merge |
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
| 2026-11-15 | PR #5 local PostgreSQL | User with Codex assistance; name not recorded | Teammate walkthrough/review pending | Compose/environment setup, authenticated SQL, lifecycle persistence checks, and runbook | Image vs container, volume vs backup, loopback publishing, database health vs application liveness, and local vs production security |
| 2026-11-15 | PR #6 frontend/backend health integration | User with Codex assistance; name not recorded | Teammate review pending | Fetch boundary, runtime validation, status/retry UI, deterministic tests, live HTTP verification, and developer docs | HTTP vs network errors, same-origin proxy vs CORS, cancellation/races, and liveness vs readiness |

For each meaningful PR, capture design, code, tests, debugging, and review work separately. Do not equate lines changed with ownership.

## 7. Evidence ledger

### PR #7 Milestone 3 verification — 2026-11-17

- Owner: user with Codex assistance; teammate review pending. Branch verified as
  `feat/database-foundation`, clean at developer commit `4b6bdd7` before changes.
  This milestone changes the existing backend workflow and relevant documentation/
  environment-example comments only. No application, test, migration, Compose,
  dependency, frontend, or production infrastructure change was needed.
- Ran workflow-equivalent `uv sync --locked --all-groups`, Ruff format/lint,
  strict `mypy app`, and default pytest. All passed; pytest **35 passed, 47
  skipped**, with the existing Starlette/HTTPX deprecation warning. The regular
  Compose database remained stopped throughout this verification.
- An independent `postgres:18.7-bookworm` container reproduced CI's health
  options, test administrator, and random loopback-only published port, without
  mounting the development volume. `uv run --no-sync pytest --run-db-tests
  -m database`: **47 passed, 35 deselected**, including the fresh Alembic
  upgrade/check/downgrade/upgrade test, ORM constraints, and transaction tests.
  The existing test-client warning was also emitted during collection.
- On another independent container, an owner-only temporary env file exercised
  `uv run --env-file <temporary-file> --locked alembic upgrade head`, `current`,
  and `check`; all returned zero, `current` reported `0001 (head)`, and no scratch
  database remained. A temporary verification query initially mishandled a literal
  percent sign; it was corrected to a bound SQL parameter and the CLI/cleanup
  rehearsal passed. No repository code change was needed for that script issue.
- Both temporary containers, their anonymous volumes, temporary env files, and
  scratch databases were removed. The development container ID, stopped state,
  mount information, and original Docker volume-name inventory matched before/
  after. No development credentials were read or copied for these rehearsals.
- A checksum-verified temporary actionlint **1.7.12** validated the backend
  workflow successfully after the port context key was changed to a quoted
  string. Optional ShellCheck/Pyflakes integration was disabled; this proves
  static workflow/expression validity, not hosted GitHub execution. No validator
  dependency or binary was added to the repository.
- CI deliberately uses publicly derived disposable test credentials, never
  repository/application secrets. Only the database-test step receives its
  maintenance URL; database-free checks receive no application database URL.
  Existing default local pytest behavior and fixture safety guards are preserved.
- Still required before merge: hosted `Backend checks` success and teammate
  schema/migration walkthrough. Hosted Ubuntu behavior, Windows database testing,
  production TLS/roles/backups, and deployment remain unverified. No commit,
  push, merge, PR creation, or destructive development-database action by Codex.

### PR #7 Milestone 2 verification — 2026-11-17

- Owner: user with Codex assistance; teammate schema walkthrough/review pending.
  Branch `feat/database-foundation`, based on developer commit `9930403`.
  Models and migration live on this branch; no commit/push/merge by Codex.
- Python **3.12.16**, uv **0.13.8**, existing PostgreSQL **18.7**. Alembic
  **1.20.1** added without upgrading existing packages. No new endpoint or
  FastAPI startup database requirement. No application schema change was applied
  to the regular development database.
- PostgreSQL opt-in suite: **82 passed**, including 39 model cases and a fresh
  migration round trip, alongside prior connection/session/config/health tests.
  Default pytest: **35 passed, 47 deliberately skipped**. One existing
  Starlette/HTTPX deprecation warning remains. Tests prove ORM graph round trips,
  defaults/UTC audits, integer costs and unknown-vs-zero semantics, JSON shape
  bounds, identity/day uniqueness, orphan rejection, and database delete rules.
- Frozen all-group dependency sync, lock check, Ruff format/lint, and strict
  `mypy app` passed (16 source files). Editor diagnostics reported no errors in
  the database source, migrations, or integration tests.
- Migration tests apply revision 0001 to an empty independent database, compare
  metadata including server defaults, downgrade to base, then upgrade/check
  again. Actual CLI `upgrade head`, `current`, `check`, `downgrade base`, and
  second `upgrade head` also returned zero on a separate owned scratch database.
  A missing `DATABASE_URL` failed explicitly before connection.
- Test credentials were derived in memory from existing local Compose settings;
  no secrets were printed, tracked, or copied to `.env`. Scratch databases were
  removed. Database catalog and development public-table lists matched before
  and after the test run. Tests do not use SQLite or application `create_all()`.
- Remaining: Milestone 3's PostgreSQL-backed CI/full developer workflow,
  hosted/Windows verification, production roles/TLS/backups/deployment, and all
  business API validation/authorization. `locked` and `version` are storage fields;
  no mutation protection or optimistic concurrency is claimed yet. Revision
  0001's downgrade destroys app data and is rehearsed only on disposable databases.

### PR #7 Milestone 1 verification — 2026-11-16

- macOS, Python **3.12.16**, uv **0.13.8**, PostgreSQL **18.7** from the existing
  Compose service. Source/dependency changes are on `feat/database-foundation`;
  no commit, push, merge, application migration, or cloud deployment is claimed.
- Ruff formatting/lint and strict `mypy app` passed (10 source files). Default
  pytest: **35 passed, 7 skipped**; PostgreSQL opt-in: **42 passed**. One existing
  Starlette/HTTPX test-client deprecation warning remains unsuppressed.
- Real tests exercised connection, rejected credentials, a test-only FastAPI
  dependency, explicit commit visibility in another session, rollback on close
  and exception, constraint failure rollback, and returned pool connections.
- Independent CLI probes confirmed that `--run-db-tests` fails with no admin
  URL even when `DATABASE_URL` exists, and rejects the development database as
  its admin target. Unit tests cover cleanup registration/name guards and
  connection-identity query overrides. Test URLs must be local and point to the
  postgres maintenance database; local routing cannot be redirected by PGHOSTADDR.
- Credentials for live verification were constructed in process memory from the
  existing Compose configuration, never displayed, written to tracked files,
  or copied into the local `.env`. The test-created database was removed; the
  original database catalog and development public-table list were unchanged.
- Engine creation and shutdown are database-independent until first DB use;
  tests verify liveness without configuration, redaction, TLS query preservation,
  shared engine initialization, and pool disposal. Remote TLS handshakes, cloud
  roles, production readiness, Windows DB tests, and database CI remain unverified.
- Alembic and the approved schema remain Milestone 2; full workflow/CI database
  verification remains Milestone 3. The probe table exists only inside the
  disposable test database; it is not an application schema-management mechanism.

### PR #6 integration verification — 2026-11-15

- Branch: `feat/front-back-int`; source commits `d66391a` and `ab6e482`.
  Owner: user with Codex assistance. Merge, review, CI, and deployment not verified.
- macOS, Node **24.22.3**, Python **3.12.16**, uv **0.13.8**. A previously missing
  Python runtime and ignored backend `.venv` were prepared with `uv python install
  3.12` and `uv sync --frozen --all-groups`. No source/dependency/lockfile changes
  were required for this setup.
- Frontend: `npm run lint`, `npm run typecheck`, `npm run test -- --run`, and
  `npm run build` passed. **32 tests**: 16 client, 11 connection UI, and 5 App tests.
  Tests mock network/client boundaries; deadline and race checks use fake timers.
- Backend: `uv lock --check`, Ruff format/check, `mypy app`, and `pytest` passed;
  **3 tests, 1 existing Starlette/HTTPX deprecation warning**. Warning was not
  suppressed and dependencies were not changed. Backend checks used uv 0.13.8
  at its installed absolute path and the same committed lockfile.
- Real, non-mocked Chrome verification started the existing FastAPI app at
  `127.0.0.1:8000` and Vite at `127.0.0.1:5173`. Direct and proxied `/health`
  returned HTTP **200**, `application/json`, and `{"status":"ok"}`.
- Browser status: **Backend connected.** → FastAPI stopped → **The backend
  returned HTTP 502. Check FastAPI and try again.** → FastAPI restarted and
  **Retry connection** clicked → **Backend connected.** without reloading.
- Observed browser health requests all used the frontend origin:
  `http://127.0.0.1:5173/health`, with statuses **200 → 502 → 200**. No browser
  page errors were reported. Backend unavailability is expected to cause a
  proxy HTTP error; its exact status is not a universal contract.
- Verification used temporary Playwright tooling, not an installed project
  dependency or committed e2e suite. Each quality-check subprocess had a
  60-second timeout; the live lifecycle script had a 45-second deadline and
  automatically stopped the servers it created. It neither read local database
  credentials nor controlled PostgreSQL.
- Milestone 2 Chrome checks with simulated responses also verified layout at
  320, 375, 768, and 1440 pixels, visible keyboard focus, and Enter-to-retry.
  Production rendering issues no diagnostic requests; the built JavaScript was
  checked for absence of diagnostic strings and the health URL.
- Developer instructions and manual stop/start/retry steps are in the
  [frontend README](../frontend/README.md#run-the-frontend-and-backend-together).
  Only health liveness is connected. No CORS middleware, backend feature,
  database query, auth, CI, new project dependency, or production serving was added.
- Remaining limits: no Windows live integration, cross-browser/screen-reader
  audit, committed e2e suite, database readiness check, or production deployment
  verification. Historical dependency advisory notes remain in the frontend README.

### PR #4 Milestone 5 CI documentation and verification — 2026-11-16

- Owner: user with Codex assistance, on `chore/github-actions-ci`; user reports
  Milestone 4 complete. Added `docs/CI.md` with the PR flow, workflow/job map,
  exact local commands, lockfiles, troubleshooting, GitHub log navigation,
  security/verification limits, and the reason deployment remains deferred.
  Updated only affected documentation; workflow/application/dependency files
  are unchanged. No commit, push, merge, PR creation, or Milestone 6 work.
- Compared the guide against both workflow files: all 14 `run` command lines
  match. Local Windows execution used existing Python 3.12.16/uv 0.13.8 and
  portable Node 24.22.3/npm 11.19.1. Absolute Python/uv paths and `npm.cmd`
  selected those runtimes; process-local temporary cache paths were used.
  Unlike earlier offline verification, no offline/no-cache command flags were
  added in this milestone. Commands are the ones in the guide and YAML.
- Backend: `uv sync --locked --all-groups` passed (29 resolved, 28 installed
  packages checked); Ruff formatting passed (8 files), Ruff lint passed, mypy
  passed (6 files), pytest passed (3 tests). The existing Starlette/HTTPX
  deprecation warning remains visible and unresolved.
- Frontend: `npm ci --no-audit --no-fund` passed (223 packages), ESLint and
  TypeScript passed, Vitest passed (3 tests in 1 file), and production build
  passed (`tsc -b` followed by Vite 8.3.8). These used existing local downloads
  and an existing backend environment, not a fresh hosted Ubuntu installation.
- `git diff --check` passed. Reviewed documentation changes for credentials,
  generated files, and misleading claims; checked local Markdown link targets.
  Git confirms dependency directories, backend virtual environment, and
  frontend build outputs remain ignored. No credentials or generated files
  were found in the intended diff; this is not a dedicated secret-scanner pass.
- Hosted workflow runs, triggers, cancellation, timeout/required-check
  enforcement, fresh Ubuntu installs, and deployment remain unverified.
  `actionlint` remains unavailable; no dependency security audit was run.

### PR #4 Milestone 4 CI reliability review — 2026-11-16

- Owner: user with Codex assistance, on `chore/github-actions-ci`. User reports
  Milestones 2/3 complete. No commit, push, merge, deployment, application code,
  dependency, lockfile, or infrastructure change made in this milestone.
- Reviewed both workflows against current package/runtime configuration:
  `contents: read`; ordinary PRs targeting `main` and pushes to `main`; no path
  filters, `pull_request_target`, matrices, job dependencies, error suppression,
  application secrets, or production environment variables. Workflow/job names
  remain distinct and stable. Both run for frontend-only or backend-only changes
  by configuration; hosted event execution has not been observed.
- Rechecked upstream latest release pages: checkout v7.0.1, setup-python
  v7.1.0, setup-node v7.1.0, and setup-uv v10.3.3. Existing SHA pins retained.
  Retained `uv sync --locked --all-groups` and `npm ci --no-audit --no-fund`.
  No hosted timing evidence justifies adding cache complexity yet; ten-minute
  limits and workflow-specific concurrency cancellation remain unchanged.
- Added explicit `shell: bash` to both jobs and Python/uv version logging to
  backend CI. [GitHub's shell documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#defaultsrunshell)
  specifies Bash invocation with `-e` and `-o pipefail`. Local Git Bash executed
  `false | true` and `false; exit 0` with `--noprofile --norc -eo pipefail`;
  both exited 1 as expected. No application test was deliberately changed.
- Windows verification: Python 3.12.16/uv 0.13.8; portable Node 24.22.3/npm
  11.19.1 from Milestone 3 with process-local PATH. From `backend/`, ran the
  same five Milestone 2 local commands (`uv --no-cache`, locked sync and
  `run --no-sync`, all with `--offline`): sync passed, Ruff format passed for
  8 files, Ruff lint passed, mypy passed for 6 files, pytest passed 3 tests.
  The existing Starlette/HTTPX deprecation warning remains unsuppressed.
- From `frontend/`, `npm ci --no-audit --no-fund --offline` passed using the
  temporary npm download cache (223 packages), then `npm run lint`,
  `npm run typecheck`, `npm run test -- --run` (3 tests), and `npm run build`
  all passed. Local offline installs do not prove a fresh online Ubuntu install.
- Editor diagnostics for both workflows and `git diff --check` passed.
  `actionlint` is unavailable. Hosted event/action execution, cancellation,
  timeout enforcement, and required-check settings remain unverified.

### PR #4 Milestone 3 frontend CI verification — 2026-11-16

- Owner: user with Codex assistance, on `chore/github-actions-ci`. User approved
  and reported Milestone 2 reviewed before this work. No commit, push,
  deployment, or Milestone 4 work performed by Codex for this milestone.
- Added `Frontend CI` / `Frontend checks` on Ubuntu 24.04 for PRs targeting
  `main` and pushes to `main`, independently of backend CI. Uses root `.nvmrc`
  (Node 24.22.3), bundled npm, `contents: read`, no persisted checkout
  credentials/cache, a ten-minute timeout, and cancellation of superseded runs.
  No application secrets or paid APIs are required.
- Official [setup-node v7.1.0 release](https://github.com/actions/setup-node/releases/tag/v7.1.0)
  and commit `949feb2413d6458794dcd2491c4babbbce0c15c1` verified upstream;
  checkout uses the same v7.0.1 commit as backend CI.
- Node/npm were not on PATH. Downloaded the official portable Windows Node
  24.22.3 archive into a temporary tools directory, checked its SHA-256 against
  the distribution's `SHASUMS256.txt`, and used its bundled npm 11.19.1.
  No global runtime installation or persistent PATH change was made.
- From `frontend/`, with the temporary runtime directory prepended to the
  process PATH, these commands all exited 0 (Windows invoked `npm.cmd`):

  ```text
  node --version
  npm --version
  npm ci --no-audit --no-fund
  npm run lint
  npm run typecheck
  npm run test -- --run
  npm run build
  ```

- Clean installation added 223 packages. Sandbox registry requests initially
  failed with EACCES; the approved network-enabled retry passed. Lint and strict
  TypeScript checks passed; Vitest 5.1.0 passed 3 tests in 1 file; Vite 8.3.8
  built production assets after `tsc -b`. No application source, test framework,
  dependency declarations, lockfiles, or backend workflow changed.
- Workflow editor diagnostics and `git diff --check` passed. `actionlint` was
  unavailable. No fresh Ubuntu/GitHub run, trigger/cancellation test, required
  check enforcement, deployment, or current dependency audit is claimed.
  Generated dependencies and build assets remain ignored. Historical frontend
  advisory results below remain dated observations.

### PR #4 Milestone 2 backend CI verification — 2026-11-16

- Owner: user with Codex assistance, on `chore/github-actions-ci`; no commit,
  push, PR creation, teammate review, merge, or GitHub run performed.
- Workflow: `Backend CI` / `Backend checks`, Ubuntu 24.04, PRs targeting `main`
  and pushes to `main`. Python comes from `backend/.python-version` (3.12),
  uv is pinned to 0.13.8, and dependency installation uses
  `uv sync --locked --all-groups`. No application logic/dependencies changed.
- Official action release tags and full commits were checked against upstream:
  [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1),
  [setup-python v7.1.0](https://github.com/actions/setup-python/releases/tag/v7.1.0),
  [setup-uv v10.3.3](https://github.com/astral-sh/setup-uv/releases/tag/v10.3.3).
  The workflow pins immutable commits, grants only `contents: read`, disables
  persisted checkout credentials and dependency caching, cancels superseded
  runs, and limits the job to ten minutes. It needs no application secrets,
  PostgreSQL, Docker, deployment, or paid provider calls.
- Local environment: Windows, existing Python 3.12.16 virtual environment,
  uv 0.13.8, Ruff 0.17.5, mypy 1.20.2, pytest 9.2.0. From `backend/`, the
  installed `C:/Users/rohan/.local/bin/uv.exe` executable ran these commands:

  ```text
  uv --no-cache sync --locked --all-groups --offline
  uv --no-cache run --no-sync --offline ruff format --check .
  uv --no-cache run --no-sync --offline ruff check .
  uv --no-cache run --no-sync --offline mypy app
  uv --no-cache run --no-sync --offline pytest
  ```

- All commands exited 0. Sync resolved 29 packages and checked 28 installed
  packages; Ruff reported 8 files already formatted and no lint errors; mypy
  passed for 6 source files; pytest passed all 3 tests. One existing
  Starlette/HTTPX deprecation warning remains visible, with no suppression.
- Offline/no-cache flags avoided network and persistent uv-cache access during
  local verification; the workflow uses normal online dependency installation.
  This is not fresh Linux installation evidence.
- Editor diagnostics found no errors in the workflow; `git diff --check`
  passed. `actionlint` was unavailable, so no actionlint pass is claimed.
  Event triggering, action execution, fresh Ubuntu dependency installation,
  hosted success/failure reporting, concurrency cancellation, and required-check
  settings remain unverified. The broader CI plan remains incomplete.

### PR #5 local database verification — 2026-11-15

- Configuration `f715de3`; verification record `6bb7bea`. Docker Engine **28.1.1**,
  Compose **2.35.1**, official `postgres:18.7-bookworm`; measured server **18.7**.
- Named volume `roam_postgres_data` mounted at `/var/lib/postgresql`; actual
  data directory `/var/lib/postgresql/18/docker`. Host port **55432** was chosen
  only in ignored local configuration because an unrelated host PostgreSQL used
  5432. No unrelated service was stopped.
- Compose validation and health wait passed. Live binding was only
  `127.0.0.1:55432`; correct host password succeeded and incorrect password failed.
- Exact marker row survived both restart (same container ID) and `down`/`up`
  recreation (new container ID, unchanged volume). The disposable verification
  database was removed; the application database had zero public tables.
- Generated local credentials were not printed or committed. `.env` was ignored,
  untracked, and owner-readable/writable only on macOS. Existing application code
  and dependency files were unchanged.
- Security inspection: external-client authentication uses SCRAM-SHA-256;
  internal socket/loopback rules use `trust`; development role is a superuser;
  TLS is off. No container vulnerability scan, backup/restore, upgrade, Windows
  runtime, production deployment, or backend integration was verified.
- Full commands, image digest, container lifecycle evidence, setup, and known
  limitations are in the [local PostgreSQL runbook](runbooks/local-postgres.md).
  This is development infrastructure, not a production security certification.

### PR #3 Milestone 3 local verification — 2026-11-13

- Owner: user with Codex assistance on `feat/backend-foundation`; teammate
  review, merge, and deployment are not verified. No Git commit made by Codex.
- Added [health endpoint tests](../backend/tests/test_health.py) and pytest
  test discovery/import settings in [pyproject.toml](../backend/pyproject.toml).
  The in-process `TestClient` exercises the registered app and separately
  checks HTTP 200, exact JSON body, and JSON content type. No server is required.
- Windows, Python **3.12.16**, pytest **9.2.0**: focused command
  `.venv/Scripts/python.exe -m pytest tests/test_health.py -v` passed **3 tests**.
- Full check commands used `C:/Users/rohan/.local/bin/uv.exe` by absolute path:
  `uv --no-cache sync --frozen --all-groups --offline` and
  `uv --no-cache lock --check --offline` passed. With the prefix
  `uv --no-cache run --locked --offline`, `ruff format --check .` passed
  (8 files already formatted), `ruff check .` passed, `mypy app` passed
  (6 source files), and `pytest` passed **3 tests**.
- Both pytest runs emitted one `StarletteDeprecationWarning`: the installed
  Starlette test client deprecates HTTPX usage and suggests `httpx2`. No warning
  suppression or dependency change was applied. Review compatibility in a
  separate dependency update before relying on a future test-client release.
- Editor diagnostics reported no errors in the test file or dependency
  configuration. No dependency lockfile change, external paid calls, or
  frontend changes were needed. macOS/Linux and CI execution remain unverified.
- This supersedes the earlier pending-endpoint-test status. The three local
  implementation milestones are delivered; PR #3 remains `IN_PROGRESS` pending
  user inspection/commit and team review/merge evidence. Phase 0 is incomplete.

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

The frontend documentation milestone was committed as `53250ec` and included in local `main` via `2281737`. This supersedes the earlier documentation-in-progress note. No new architecture decision supersedes D-002; same-origin production serving remains planned.

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
| 2026-11-15 | Local database failed to bind port 5432 | An existing host PostgreSQL already listened there | Port availability was discovered at startup | Changed only ignored `POSTGRES_PORT` to 55432; authenticated SQL and persistence checks passed; [evidence](runbooks/local-postgres.md) | User with Codex assistance | Document port overrides and preserve unrelated services |

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

