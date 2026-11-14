# Roam contributor instructions

> Audience: the two human developers and reviewers  
> Status: target workflow; commands become authoritative only after the repository is scaffolded and CI proves them

## 1. Working agreement

Roam is a learning project with professional engineering habits. The team optimizes for:

- merged, demonstrable vertical slices;
- code both developers can explain;
- explicit tradeoffs instead of fashionable infrastructure;
- negative-path and failure testing, not only a happy demo;
- reproducible local/CI/deployment behavior;
- cost and license awareness; and
- truthful status and resume claims.

The architecture source of truth is `DESIGN.md`. Repository-wide agent behavior is in `AGENTS.md`. Current facts and ownership are in `memory.md`. The delivery sequence is in `handoff.md`.

## 2. Planned repository layout

```text
roam/
├── frontend/
│   ├── src/
│   ├── package.json
│   └── package-lock.json
├── backend/
│   ├── app/
│   ├── migrations/
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock
├── docs/
│   ├── adr/
│   ├── runbooks/
│   └── benchmarks/
├── scripts/
├── .github/
│   ├── workflows/
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
└── the eight project Markdown files
```

Use a monorepo because changes often cross the frontend, API, migration, tests, and docs. Avoid Git submodules and independent versioning for the MVP.

## 3. Runtime and dependency policy

- Pin Python to a supported 3.12+ minor in `.python-version`/CI/container and review upgrades deliberately.
- Pin a current supported Node LTS in `.nvmrc`/CI/container; do not leave “latest” in automation.
- Use `uv` with `pyproject.toml` and committed `uv.lock` for Python.
- Use `npm` with committed `package-lock.json` for the frontend.
- Pin container base images by a clear version and consider a digest for releases.
- Add a dependency only when its purpose cannot be met clearly by the standard library/current stack.
- Review maintenance status, license, transitive size, security advisories, and bundle/runtime cost.
- Do not add both competing libraries for the same job without a migration plan.

Planned core libraries:

- Backend: FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg, httpx, maintained Google OIDC library, pytest, Hypothesis, Ruff, mypy.
- Frontend: React, TypeScript, Vite, React Router, TanStack Query, Testing Library/Vitest, Playwright, `@react-pdf/renderer`.
- API contract: OpenAPI-generated TypeScript types/client once the backend contract stabilizes.

The list is a proposal. Record actual packages/versions after installation in `memory.md`; do not claim they are present beforehand.

## 4. Environment configuration

Commit `.env.example` with placeholders and descriptions. Never commit `.env` or a downloaded OAuth credential file.

| Variable | Purpose | Secret? |
|---|---|---:|
| `APP_ENV` | `development`, `test`, `production` | No |
| `APP_BASE_URL` | Exact public/local origin used for redirects and links | No |
| `DATABASE_URL` | PostgreSQL connection URI | Yes |
| `OAUTH_STATE_SECRET` | Signs/binds short-lived OAuth state | Yes |
| `SESSION_TOKEN_PEPPER` | HMAC/pepper for stored session-token hashes | Yes |
| `GOOGLE_OIDC_CLIENT_ID` | Google sign-in client ID | Treat as config |
| `GOOGLE_OIDC_CLIENT_SECRET` | Google sign-in client secret | Yes |
| `GOOGLE_MAPS_API_KEY` | Server-restricted Places/Routes key | Yes |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Browser-restricted map key if JavaScript map is enabled | Exposed by design; restrict by origin/API |
| `LLM_PROVIDER` | Adapter selection such as `fake` or approved vendor | No |
| `LLM_MODEL` | Exact configured model identifier | No |
| provider-specific LLM key | Credential read only by the selected adapter | Yes |
| `MAX_GENERATIONS_PER_USER_DAY` | Cost quota | No |
| `MAX_REPLANS_PER_USER_DAY` | Cost quota | No |
| `PLANNING_TOTAL_TIMEOUT_SECONDS` | End-to-end bound | No |
| `LOG_LEVEL` | Structured log threshold | No |

Rules:

- Configuration is parsed and validated once at startup with typed settings.
- Production refuses insecure defaults or missing secrets.
- Fake providers are the default for tests; development may require an explicit opt-in to live calls.
- Browser-exposed keys are never treated as secrets; restrict them by exact origin and API. Server keys use API and network/application restrictions where supported.
- Rotate any credential immediately if it enters Git history or logs; deleting the file is insufficient.

## 5. Target local setup

**Current backend-only setup (PR #3, Milestone 2):** use Python 3.12 and uv
with the [backend README](../backend/README.md). The minimal FastAPI app needs
no database, Docker, credentials, or `.env`. `GET /health` returns HTTP 200
with `{"status":"ok"}`. Endpoint tests are deferred to Milestone 3.
The full-stack commands below remain planned.

**Current frontend-only setup:** the PR #2 branch has a standalone landing page. Follow the [frontend README](../frontend/README.md) for Node 24.22.3, installation, development, and checks, including an option without nvm. No backend, database, Docker, `.env`, or API proxy is needed for this page. This has been checked locally; CI is not yet configured.

The full-stack commands below remain a future target and cannot be used as a working setup yet.

After Phase 0 scaffolding, a new contributor should be able to run:

```bash
git clone <repository-url>
cd roam
cp .env.example .env
docker compose up -d db

cd backend
uv sync --frozen --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

The Vite server should proxy `/api`, `/auth`, and health routes to FastAPI. Tests use isolated configuration/database state. Document exact local URLs and ports after scaffolding; do not bake them into domain code.

Provide top-level convenience commands after the underlying commands work:

```bash
make dev
make verify
make test
make migrate
make build
```

Convenience commands must expose errors and match CI; they should not hide failing subprocesses.

## 6. GitHub workflow

### Branches

- Protect `main`; it represents the best deployable state.
- Branch from current `main` and keep branches short-lived.
- Suggested names: `feat/grounded-planner`, `fix/locked-replan`, `docs/auth-adr`, `chore/dependency-update`.
- Rebase or merge `main` according to the team's chosen policy; do not rewrite a teammate's published branch without agreement.

### Commits

- Each commit should have one understandable purpose and leave tests/build reasonably coherent.
- Use imperative subjects such as `Validate route gaps before saving plans`.
- Avoid commits containing only broad generated scaffolding without explanation.
- Never mix unrelated formatting, dependency upgrades, and feature behavior.

### Pull requests

Every change reaches `main` through a PR reviewed by the other developer. The author owns the full result even if an AI assistant wrote part of it.

PR description sections:

1. Problem/user outcome.
2. Approach and data flow.
3. Alternatives and tradeoffs.
4. API/schema/migration impact.
5. Security/privacy/authorization impact.
6. Provider/cost/license impact.
7. Tests and exact results.
8. UI screenshots/PDF sample where relevant.
9. Deployment, rollback, or operational notes.
10. Follow-ups/non-goals.

Reviewer checks:

- Can I explain this code and its failure behavior?
- Does every resource path enforce ownership?
- Is AI/provider input untrusted and output constrained?
- Are locks, versions, and idempotency preserved?
- Are network calls bounded and transactions short?
- Are unknown data and estimates labeled honestly?
- Are tests proving behavior rather than implementation details?
- Are docs/status/ownership updated without false claims?

Use squash merge if the branch history is exploratory; preserve meaningful commits when they teach a useful evolution. Pick one team convention and record it in `memory.md`.

## 7. Issue and backlog format

Each implementation issue should include:

- user/developer outcome;
- in-scope and out-of-scope behavior;
- acceptance criteria phrased as observable results;
- architecture links and invariants;
- API/schema/UI impact;
- failure/security/cost cases;
- test plan; and
- owner/reviewer.

Break work vertically. “Build backend” is not an issue. “Authenticated owner can create and reload a draft trip with cross-owner denial tests” is.

Use labels sparingly: `feature`, `bug`, `security`, `data`, `ai`, `frontend`, `backend`, `infra`, `docs`, `blocked`. A project board is useful only if both developers keep it current.

## 8. Backend standards

### Layers

- Routers deal with HTTP and call one application service/use case.
- Services orchestrate repositories/providers and own transaction timing.
- Domain functions are pure where practical and return typed results/violations.
- Repositories own SQLAlchemy queries and always expose owner-scoped methods for user resources.
- Adapters convert vendor data/errors into provider-neutral types.

Avoid “utils” dumping grounds. Name modules after domain purpose.

### Python

- Type all public functions and use strict-enough mypy settings to catch optional/shape errors.
- Pydantic validates external boundaries; dataclasses/domain classes represent internal behavior where clearer.
- Use explicit result/error types for ordinary domain conflicts; reserve exceptions for exceptional conditions.
- Never use broad `except Exception` without re-raising/mapping after safe logging and a clear boundary.
- Use timezone-aware datetimes only.
- Use `Decimal` only at provider conversion boundaries if needed, then integer minor units in the domain.
- Parameterize queries through SQLAlchemy; never construct SQL from user/model strings.
- Do not return ORM models from API endpoints.

### Transactions

- Do not start a transaction until needed and do not keep it open across external calls.
- Generation: short claim transaction → external work → final version-check/atomic save transaction.
- Use `UPDATE ... WHERE id = ? AND owner_id = ? AND version = ?` or equivalent and check affected rows.
- Convert expected uniqueness/version conflicts into stable API errors.

### External HTTP

- Fixed allowlisted base URLs and TLS.
- Explicit connect/read/write/pool or total timeouts.
- Capped jittered retry only for documented transient, idempotent calls.
- A total planning deadline and cancellation checks between stages.
- Field masks and bounded result counts.
- Safe error mapping; never return vendor bodies to users.

## 9. Frontend standards

- Enable TypeScript strict mode; avoid `any` and unchecked casts.
- Keep route components thin and organize behavior by feature.
- Use TanStack Query for server state and invalidation; use component/context state for short-lived UI state.
- Prevent duplicate submissions and send stable idempotency keys for planner operations.
- On `409 VERSION_CONFLICT`, preserve unsaved text where possible, reload canonical state, and explain the conflict.
- Map stable server codes to useful actions; do not parse English error strings.
- Render user/provider text normally; do not use raw HTML.
- Allowlist `https:` external links and add safe `rel` attributes.
- Provide visible labels, error associations, focus management, keyboard operation, reduced-motion respect, and sufficient contrast.
- Provide button/keyboard reorder controls in addition to drag-and-drop.
- Show source freshness and warnings next to affected content, not only in a hidden footer.

### Design language

Use a small token set for color, type, spacing, radius, shadow, and breakpoints. Aim for a calm travel-journal feel, not a dense admin dashboard. The PDF and web view should share typography/color decisions without sharing rendering implementation.

Do not use remote photos as structural UI dependencies. A strong layout, restrained color, icons with clear licenses, and real itinerary content are sufficient.

## 10. Database and migration workflow

1. Describe the domain change, constraints, access paths, and rollback.
2. Change ORM/domain/API deliberately; do not let one representation silently define all others.
3. Generate a migration, then inspect and edit it. Generated SQL is not automatically correct.
4. Test upgrade from an empty PostgreSQL database.
5. Test upgrade from the prior schema with representative rows.
6. Test downgrade when safe; document when data loss makes downgrade inappropriate.
7. Review locks/table rewrites/default backfills for production impact, even at small scale.
8. Merge migration with the code that uses it.

Never edit a migration that may have run on a shared/deployed database. Use expand/migrate/contract steps for destructive changes: add nullable/new structure, backfill in bounded form, switch code, then remove old structure later.

Use SQL constraints for local invariants such as nonnegative counts and uniqueness. Cross-row route/lock/provider rules live in the service/domain and are covered by transactions/tests.

## 11. API contract workflow

- Define request/response examples and error codes before implementing a new endpoint.
- Use `/api/v1`; prefer nouns and explicit action subresources only for generation/replan/lock behavior.
- Use consistent pagination and canonical ordering.
- Require `base_version` or `If-Match` for mutations and `Idempotency-Key` for billable operations.
- Return the canonical updated trip/version after mutations so the client does not synthesize state.
- Update OpenAPI snapshots/generated client in the same PR.
- Treat a generated-client diff as code requiring review.
- Make breaking meaning changes through a versioned migration, not silent field reuse.

## 12. AI, provider, and cost workflow

### Before enabling a live adapter

- Read current provider pricing, quotas, data-use terms, storage rules, attribution rules, and credential restrictions.
- Record the date, links, selected SKUs/model, free allowance assumptions, and hard/soft caps in `memory.md`.
- Implement fake adapter behavior and contract tests first.
- Set provider-console quota/budget alerts and the smallest practical application quota.
- Confirm logs do not capture prompts/provider payloads/secrets.

### Prompt changes

- Give each material prompt/schema a version.
- Keep prompts in reviewed source files, not inline strings scattered across services.
- Run the benchmark fixtures against the old/new version with the same stated model/provider configuration.
- Record validity, lock preservation, calls/tokens, latency, and cost estimate.
- Do not accept a change based on one attractive itinerary screenshot.

### Live testing

Live tests are opt-in, manual or scheduled under a small budget, and excluded from ordinary PR CI. Use synthetic trip data without sensitive personal details. Never send actual OAuth/session secrets or private notes to a model.

## 13. Test commands and policy

Planned commands after scaffolding:

```bash
# Focused backend
cd backend
uv run pytest tests/unit/test_schedule_validator.py -q

# Full backend
uv run ruff format --check .
uv run ruff check .
uv run mypy app
uv run pytest

# Frontend
cd frontend
npm run lint
npm run typecheck
npm run test -- --run
npm run build

# End-to-end (application + test database/fakes running)
npm run test:e2e

# Migrations and image through top-level scripts/CI
make verify-migrations
docker build -t roam:verify .
```

Test conventions:

- Arrange/act/assert with behavior-focused names.
- Freeze time and seed randomness.
- No sleep-based synchronization when a deterministic signal exists.
- Each test owns/cleans its rows; parallel tests must not share mutable identifiers.
- No live network in unit/integration/e2e CI.
- Use PostgreSQL for repository tests.
- Bugs get regression tests; authorization endpoints get second-user tests.
- Do not chase coverage percentage alone. Track critical invariants and uncovered branches.

## 14. CI design

On every pull request:

1. documentation/secret/basic repository checks;
2. backend format/lint/type/unit tests;
3. frontend lint/type/unit/build;
4. PostgreSQL integration tests and fresh migration upgrade;
5. deterministic e2e critical flow with fake providers;
6. production Docker image build;
7. dependency/license/security scanning configured to actionable thresholds.

Use concurrency cancellation for superseded commits to conserve minutes. Cache package downloads carefully using lockfile keys; never cache secrets or application state. Pin third-party GitHub Actions to trusted major versions or immutable commits according to the team's security policy.

Required checks cannot be bypassed casually. If a check is flaky, create/fix the issue; rerunning until green hides evidence.

## 15. Observability and debugging

For a production/demo issue:

1. Capture time, request ID, user-visible code, release commit, and exact safe reproduction.
2. Check whether failure is frontend, API, database, LLM, Places, Routes, quota, or deployment warm-up.
3. Follow the request ID through structured logs and planner-run stage timings.
4. Reproduce with fakes/fixtures when possible; do not repeatedly spend live quota.
5. Inspect database state read-only and verify trip version/revision/run status.
6. Add a regression test before/with the fix.
7. Record root cause, detection gap, and prevention action for material incidents.

Never debug by printing cookies, OAuth tokens, API keys, full prompts, emails, or provider payloads. Redaction is not optional in local screenshots or pasted issue text.

## 16. Release and deployment workflow

1. CI builds and verifies the exact production image.
2. Review migrations, backup/restore expectations, provider quota, environment, and current cost.
3. Apply migrations as a controlled release step against the target database.
4. Deploy the immutable image/commit.
5. Verify liveness/readiness, login, owner trip read, fake/demo generation strategy as appropriate, and static asset routing.
6. Watch error/latency/quota signals during a defined observation window.
7. Record release commit, schema revision, configuration version, and any known limitation.

Rollback:

- Roll back the image when schema is backward compatible.
- Do not run a destructive database downgrade without explicit review and backup.
- Disable planner endpoints or switch to a safe maintenance/degraded mode if provider cost/security is at risk; saved-trip reads/manual editing should remain available when possible.

Free service cold starts must be disclosed in the demo/readme. Do not rely on ephemeral container storage for PDFs, uploads, database, or logs.

## 17. Security review checklist

Before merging auth, data, AI/provider, or deployment changes:

- [ ] Authentication state/claims and redirect allowlist are validated.
- [ ] Every resource query includes current owner.
- [ ] CSRF and cookie behavior are covered.
- [ ] Inputs/lists/text/body/token output are bounded.
- [ ] User/provider/model strings cannot become raw HTML, SQL, arbitrary fetch URLs, or tool commands.
- [ ] Secrets and PII are absent from code, logs, errors, fixtures, screenshots, and PDFs.
- [ ] External calls use fixed hosts, TLS, timeouts, safe retry, quotas, and field masks.
- [ ] Model output uses strict schema and allowlisted IDs/operations.
- [ ] Locks, versions, and idempotency have negative tests.
- [ ] Dependencies/assets have acceptable licenses and known maintenance status.
- [ ] Provider storage/attribution rules are satisfied or the affected data is not shipped.

## 18. Definition of done for a feature

- Acceptance criteria work in the relevant UI/API path.
- Domain/security/cost failure cases are handled.
- Focused and boundary tests pass; exact commands/results are in the PR.
- API client, migration, fixtures, docs, and examples are updated.
- Accessibility and responsive behavior are checked for UI changes.
- No new secret, PII log, unbounded provider call, or license ambiguity exists.
- CI is green and the other developer approves.
- `memory.md` records the implemented fact, owner, evidence, and any decision.
- The author can explain data flow, alternatives, tradeoff, and failure behavior without reading generated prose.

## 19. Evidence and resume discipline

After each milestone, add to `memory.md`:

- merged PR/commit;
- personal role and reviewer;
- behavior implemented;
- tests/benchmark/deployment evidence;
- measured numbers with date/configuration;
- failure/debugging story; and
- remaining limitations.

Use results to draft resume bullets only after implementation. Prefer exact truthful verbs: “implemented owner-scoped authorization with negative integration tests” is stronger than “architected enterprise-grade RBAC” when the project has no roles.

