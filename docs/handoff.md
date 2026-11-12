# Roam MVP handoff

> Status: approved plan; implementation has not started in this package  
> Owners: two developers; assign names in `memory.md` before the first feature branch  
> Primary goal: build, deploy, measure, and deeply understand a credible AI-native full-stack project

## 1. Executive summary

Roam is an AI-native travel planner that converts a user's destination, dates, party size, budget, interests, and constraints into a realistic day-by-day itinerary. It uses a Places provider to find real venues and a Routes provider to obtain travel durations. An LLM chooses and arranges only grounded candidates and interprets natural-language change requests. Deterministic backend code verifies the result before it can be saved.

The MVP is intentionally small enough for two college developers to own end to end and deep enough to support a strong resume discussion. Its engineering value comes from the boundary between probabilistic AI and reliable application logic: the model proposes; typed schemas, ownership checks, route data, lock rules, budget arithmetic, and schedule validation decide whether a proposal is acceptable.

Users can authenticate, create and edit trips, generate an itinerary, lock important activities, request a partial replan in natural language, view the result on a dashboard and map, and download a concise, attractive PDF to share in a group chat. Sharing the exported file replaces public links and real-time collaboration for the MVP.

## 2. Outcomes and non-goals

### Product outcomes

A successful MVP lets an authenticated owner:

1. Create a trip with destination, local timezone, travel dates, party size, budget, interests, mobility/pace preferences, and free-text constraints.
2. Generate an itinerary whose places come from the configured Places provider.
3. See activities, travel legs, known opening-hour status, estimated per-person cost, warnings, and source links.
4. Edit, reorder, add, remove, and lock activities, with server-side validation after changes.
5. request a scoped natural-language change such as “replace Saturday afternoon with indoor options, but keep dinner.”
6. Keep locked activities unchanged during manual and AI-assisted edits.
7. Save and revisit owned trips without seeing another user's data.
8. Download a polished PDF containing the final itinerary, caveats, addresses, estimated costs, and clickable map links.

### Learning and career outcomes

Each developer should be able to:

- trace a request from React through FastAPI, provider adapters, validation, PostgreSQL, and back;
- explain why a modular monolith and SQL database fit this stage;
- describe exactly what the LLM receives and why it cannot directly mutate the database;
- distinguish authentication from ownership-based authorization;
- demonstrate failure handling, idempotency, optimistic concurrency, tests, logs, migrations, CI, and deployment;
- discuss measured bottlenecks and a responsible scaling path without pretending the app already serves large traffic;
- identify personal contributions using pull requests and the ownership ledger; and
- support every resume claim with merged code or measured evidence.

### Explicit MVP non-goals

- live multi-user editing, invitations, comments, voting, or group preference balancing;
- public share URLs or anonymous access to trips;
- booking, payment, reservation, ticket inventory, or price guarantees;
- real-time disruption handling, weather-driven replanning, or location tracking;
- mobile-native applications or offline mode;
- Redis, Kafka, Celery, message queues, background workers, Kubernetes, or microservices;
- a custom route-optimization solver or claims of globally optimal routes;
- roles or admin screens unless a real product requirement appears;
- training or fine-tuning a model; and
- production-grade high availability or a promise that free hosting is suitable for production.

## 3. Canonical technical baseline

| Area | MVP decision | Reason |
|---|---|---|
| Frontend | React, TypeScript, Vite, React Router, TanStack Query | Typed, common, and small enough to understand |
| UI styling | Plain CSS with design tokens and accessible components | Avoid a large component system while retaining visual control |
| PDF | `@react-pdf/renderer` in the browser | No server renderer or per-export API cost; easy file sharing |
| Backend | Python 3.12+, FastAPI, Pydantic v2 | Strong typed request/output validation and a good Python AI ecosystem |
| Data access | SQLAlchemy 2 in synchronous mode plus Alembic | Simpler failure model for a student team; avoid accidental blocking in `async` handlers |
| Database | PostgreSQL | Relational ownership, trip structure, constraints, transactions, and indexing |
| HTTP client | Synchronous `httpx` with explicit connect/read/total timeouts | Matches the synchronous service baseline and supports test transports |
| Auth | Google OIDC/OAuth authorization-code flow; opaque server session | No password storage; secure same-origin cookie; revocable sessions |
| Places/Routes | Provider interfaces with an initial Google Maps Platform adapter | Real IDs, place details, hours, coordinates, and route durations; adapters reduce lock-in |
| LLM | Provider interface; choose a low-cost structured-output-capable model at implementation time | Avoid hard-coding a model or stale pricing into domain logic |
| Deployment | One Docker image serving the built React app and FastAPI on one origin | Lower cost, simpler cookies/CORS, one demo service to operate |
| Database hosting | Managed PostgreSQL free allowance if still available | Avoid operating a database; recheck current limits and backups |
| CI | GitHub Actions on pull requests | Automatic lint, types, tests, migration check, frontend build, and container build |

The exact hosting vendor and LLM model are configuration decisions, not domain assumptions. Record the chosen versions and pricing snapshot in `memory.md` when implementation starts.

## 4. End-to-end product flow

### New itinerary

1. React validates basic form shape and submits the trip to FastAPI.
2. FastAPI authenticates the session and creates or loads a trip owned by that user.
3. The backend claims an `Idempotency-Key` and checks the user's daily generation allowance.
4. The destination is resolved to an IANA timezone and real provider identifier.
5. The Places adapter searches a bounded set of candidate venues using minimal required fields.
6. Roam normalizes candidates into its provider-neutral schema and sends only those candidates, trip constraints, and output schema to the LLM.
7. The LLM returns a proposed schedule referencing candidate IDs. It cannot insert arbitrary venue data or perform database writes.
8. Roam enriches consecutive activities with route durations and runs deterministic validation.
9. If the proposal is invalid, the backend may make at most one bounded repair attempt with validation errors. It must never silently weaken a hard constraint.
10. A valid plan is saved atomically with its route legs, revision record, planner-run metadata, and incremented trip version.
11. React renders the committed trip. If validation cannot produce a safe plan, the user receives a useful error or a draft with explicit warnings only where the policy permits unknown data.

### Partial natural-language replan

1. React sends the instruction, current trip version, and a new idempotency key.
2. FastAPI verifies ownership and loads the current itinerary, including persisted locks.
3. The LLM converts the instruction into a typed change intent: affected dates/time window, requested preferences, and preserve set.
4. Backend code expands the preserve set with every locked activity and rejects an intent that targets one.
5. New candidate and route calls are restricted to the affected gaps.
6. The LLM proposes patch operations against stable activity IDs; it does not return an unrestricted full replacement.
7. Roam applies the patch to an in-memory copy, validates the affected days and trip budget, and compares all locked records byte-for-byte on protected fields.
8. The save transaction succeeds only if the trip version is unchanged. Otherwise the API returns `409 VERSION_CONFLICT` and the client reloads.
9. The revision stores a compact before/after patch and human-readable summary for debugging.

### PDF export

1. The owner opens a saved trip and selects **Export PDF**.
2. The client uses the same canonical API data shown on screen; export triggers no LLM, Places, or Routes calls.
3. The PDF contains a title/summary page, day timelines, travel notes, addresses, cost estimates, warnings, and clickable provider links.
4. The file does not contain embedded provider map tiles, scraped photos, reviews, or unlicensed assets.
5. The user downloads and shares the file through any group chat. Roam does not host an anonymous share page.

## 5. Definition of the MVP

The MVP is complete only when all of the following are true:

- A fresh checkout can be started locally from documented steps using Docker for PostgreSQL.
- The production container builds the React frontend and serves it with FastAPI on one origin.
- Google login creates a local user and secure revocable session; logout invalidates it.
- Every trip query and mutation includes an owner predicate and has negative authorization tests.
- A user can create, list, open, edit, archive/delete according to the chosen UI, and revisit trips.
- Generation uses real provider IDs, structured LLM output, bounded provider calls, and deterministic validation.
- A generated activity that references an unknown candidate ID is rejected.
- Validation detects overlaps, infeasible travel gaps, known closed hours, invalid time ranges, locked changes, and budget overages.
- Replanning changes only the requested scope, never changes locked protected fields, and rejects stale versions.
- Manual edits run the same validation rules as AI-generated edits.
- The PDF is readable on mobile and desktop, contains no clipped text, and opens with valid clickable links.
- Provider failures, timeouts, rate limits, invalid model output, database errors, and version conflicts produce stable error codes and no partial itinerary write.
- CI runs linting, type checks, backend tests, frontend tests/build, migration checks, and the container build.
- A deployed low-volume demo, operating notes, cost snapshot, and rollback procedure are documented.
- `memory.md` links each completed claim to evidence; no target metric is presented as a result.

## 6. Phased backlog

Phases are vertical slices. Each should end with a merged, demonstrable behavior. Estimates are intentionally omitted; the team should size after the repository is scaffolded.

### Phase 0 — Repository and team operating system

**Deliverables**

- Initialize the monorepo, licenses, code owners/ownership ledger, issue templates, PR template, branch protection, and CI skeleton.
- Scaffold React/Vite and FastAPI packages with pinned runtimes and dependency lockfiles.
- Add Docker Compose for local PostgreSQL and a multi-stage production Dockerfile.
- Add environment validation, `.env.example`, secret scanning, formatting, linting, types, and a smoke test.
- Create a public issue/backlog board only if both developers will maintain it.

**Acceptance criteria**

- A clean checkout reaches a healthy frontend, backend, and database through documented commands.
- A deliberately failing test blocks a test pull request.
- No secret or provider key is committed.
- `memory.md` names both developers and records the first ownership split.

### Phase 1 — Data model, migrations, and trip CRUD

**Deliverables**

- Implement users, sessions, trips, trip days, activities, revisions, and migration infrastructure.
- Implement typed CRUD endpoints, uniform errors, timestamps, UUIDs, ownership query helpers, and trip versioning.
- Build the trip form, trip list, empty states, loading states, and itinerary shell.

**Acceptance criteria**

- Database constraints reject impossible dates, nonpositive party sizes, and duplicate day dates.
- CRUD integration tests use PostgreSQL, not SQLite.
- An unauthenticated request gets `401`; a different authenticated owner gets `404` for a trip they do not own.
- Two edits based on the same version cause exactly one success and one `409`.

### Phase 2 — Authentication and authorization

**Deliverables**

- Implement Google OIDC/OAuth authorization-code flow using a maintained library.
- Validate state, issuer, audience, nonce where applicable, verified email policy, and redirect URI.
- Store only the minimal local identity; store a hash of the opaque Roam session token.
- Add secure cookie, CSRF defense for unsafe methods, session expiry/rotation, logout, and cleanup.

**Acceptance criteria**

- State mismatch and invalid token claims fail closed.
- Session cookies are `HttpOnly`, `Secure` outside local development, `SameSite=Lax`, and appropriately scoped.
- Raw OAuth tokens, session tokens, and secrets never appear in logs.
- Authorization tests cover every trip and activity endpoint.

### Phase 3 — Provider adapters and grounded candidate retrieval

**Deliverables**

- Define provider-neutral `PlaceCandidate`, `PlaceDetails`, and `RouteLeg` models.
- Implement a fake deterministic adapter first, then the chosen Places/Routes adapter.
- Add request field masks, bounded search categories/counts, deadlines, retry policy, source attribution fields, and compliant persistence rules.
- Add database-backed usage counters and provider quotas/alerts.

**Acceptance criteria**

- All tests run without network access using fakes or recorded sanitized fixtures.
- The production adapter requests only fields the product uses.
- Retry occurs only for documented transient failures, is jittered and capped, and never multiplies non-idempotent work.
- A provider timeout returns a stable error and writes no partial itinerary.

### Phase 4 — LLM planning and deterministic validation

**Deliverables**

- Define the structured plan schema and prompt version.
- Send candidate IDs and normalized facts; prohibit invented candidates and free-form database commands.
- Implement schedule, route, hours, budget, duplicate, daily-boundary, and data-confidence validation.
- Add one bounded repair pass and a planner-run audit record with token/cost metadata when provided.

**Acceptance criteria**

- Unknown candidate IDs, malformed JSON, overlaps, impossible travel, and known-closed activities are rejected in tests.
- Unknown cost or hours are represented as unknown warnings, never converted into made-up facts.
- A generation either commits a complete valid revision or commits nothing.
- Benchmark fixtures report pass/fail metrics but do not become resume claims until run and recorded.

### Phase 5 — Interactive editing, route view, and locks

**Deliverables**

- Render day timelines, map markers, route legs, warnings, and cost summaries.
- Support manual edit/add/remove/reorder/lock with accessible keyboard alternatives to drag-and-drop.
- Revalidate affected days after every mutation.

**Acceptance criteria**

- The client never treats its own disabled state as authorization; server rules remain authoritative.
- Locking persists across reloads.
- A locked activity mutation is rejected even when sent directly to the API.
- Mobile and keyboard users can complete the core flow.

### Phase 6 — Natural-language partial replanning

**Deliverables**

- Implement typed intent extraction, affected-scope calculation, patch proposal, in-memory application, validation, optimistic save, and revision summary.
- Add a before/after preview or clear confirmation if the team finds it usable within scope; otherwise save only after full validation and show an undo-by-revision option as a stretch.

**Acceptance criteria**

- Golden tests cover “replace morning,” “make tomorrow indoor,” “cheaper dinner,” and “keep lunch/locked dinner.”
- All locked protected fields remain identical.
- Unaffected day activities retain the same IDs and fields.
- Stale-version replans return `409`; duplicate idempotency keys return the original result.

### Phase 7 — PDF export and product polish

**Deliverables**

- Build a branded PDF with accessible color contrast, page numbers, day sections, cost caveats, warnings, links, and fallback fonts.
- Add skeleton/loading/error/empty states, responsive layouts, and a concise first-run explanation of estimates.
- Review third-party assets and create a notices/attribution section where required.

**Acceptance criteria**

- The PDF renders a one-day and a seven-day fixture without overflow or blank pages.
- Text extraction finds the trip title, every day, and each activity.
- Links use safe `https` URLs; user text is rendered as text, not raw markup.
- Export makes zero billable planning/provider calls.

### Phase 8 — Reliability, deployment, and interview evidence

**Deliverables**

- Add health/readiness endpoints, structured request logs, request IDs, planner-stage timing, redaction, and an operating runbook.
- Deploy the same production image used in CI; apply migrations as a separate release step.
- Set provider budgets/quotas, validate backup/restore expectations, and document free-tier sleep behavior.
- Run a small benchmark suite and record actual latency, validation, and cost results with date/configuration.
- Record an architecture walkthrough and conduct reciprocal resume grillings.

**Acceptance criteria**

- Deployment from `main` is repeatable and rollback instructions have been exercised in a safe environment.
- A provider outage and malformed LLM response are demonstrated through fakes.
- The cost dashboard/ledger shows current spend and configured caps.
- Each developer can answer the interview checklist in `DESIGN.md` using project evidence.

## 7. Suggested two-developer ownership

Ownership should create depth without silos. Rotate reviewer duty and require both developers to understand every merged subsystem.

| Workstream | Primary owner A | Primary owner B | Required cross-review |
|---|---|---|---|
| Frontend trip workflow and accessibility | Lead | Support | B reviews API/error handling |
| Backend CRUD, schema, migrations | Support | Lead | A reviews contracts and queries |
| Planner/provider orchestration | Lead | Support | B reviews failure paths and cost bounds |
| Validator/replanning engine | Support | Lead | A reviews invariants and golden tests |
| Auth/security | Pair | Pair | Both explain threat model |
| PDF/design system | Lead | Support | B validates data/caveats |
| CI/deployment/observability | Support | Lead | A executes runbook |

Replace A/B with names and actual pull requests in `memory.md`. “Lead” means responsible for design and evidence, not sole author. Pair on auth, schema review, and the first provider integration because mistakes there cross the entire system.

## 8. Cost plan and guardrails

The USD $0–$5/month goal is feasible only for a low-volume educational demo and is not guaranteed. Prices, free allowances, eligibility, billing requirements, and data terms change. Recheck them immediately before enabling billing and monthly thereafter.

### Target budget

| Component | Target | Guardrail |
|---|---:|---|
| GitHub repository and CI | $0 | Keep workflows focused; cancel superseded runs |
| Single demo web service | $0 | Accept cold starts; do not describe free compute as production-grade |
| Managed PostgreSQL | $0 | Monitor storage/compute; export/backup important demo data |
| LLM | $0–$3 | Low-cost model, strict token/output caps, daily per-user quota, no LLM on PDF/manual reorder |
| Places/Routes/Map | $0–$2 | Quotas, field masks, bounded candidates, route only adjacent activities, billing alerts |
| Domain and email | $0 | Use provider subdomain; no transactional email in MVP |
| Total target | **$0–$5** | Disable or fail closed before uncontrolled paid overage where the provider supports caps |

### Pricing snapshot references

Checked on 2026-11-07; these links are authoritative starting points, not promises of continued free service:

- [GitHub plans and Actions allowances](https://github.com/pricing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Render free-service limitations](https://render.com/docs/free)
- [Neon pricing](https://neon.com/pricing)

### Cost circuit breakers

- Require authentication for billable endpoints.
- Allow a small configurable number of generations/replans per user per UTC day using an atomic PostgreSQL counter.
- Enforce maximum trip days, candidates per category/day, provider calls, prompt bytes, output tokens, and repair attempts.
- Set cloud/provider quotas and budget alerts. An alert is not a hard cap; configure both when available.
- Record call counts, model name, token usage, and estimated cost in `planner_runs` without storing secrets or unnecessary raw prompts.
- Use fake providers in all automated tests and development stories that do not specifically test the live integration.
- Do not call the LLM for CRUD, locking, reordering, validation, route display from saved data, or PDF export.

## 9. Principal risks and mitigations

| Risk | Impact | MVP mitigation |
|---|---|---|
| Model invents a venue or fact | Misleading trip | Candidate allowlist, structured IDs, schema checks, deterministic validation, source links |
| Opening hours/cost are unavailable or stale | Schedule surprises | Track observation time/confidence; label unknowns; never claim a guarantee |
| Provider outage or rate limit | Generation failure | Deadlines, capped retry for transient errors, stable errors, no partial write, manual editing remains available |
| Locked activity changes | Lost user trust | Persist locks; backend preserve set; protected-field comparison; invariant tests |
| Duplicate costly request | Cost and duplicate revisions | Idempotency key plus request hash; return stored result; stale in-progress recovery policy |
| Concurrent browser edits | Lost updates | Integer trip version and conditional update; return `409` and reload |
| Cross-user data access | Privacy breach | Owner predicate in repository queries, non-enumerating `404`, negative tests |
| OAuth/session bug | Account compromise | Maintained library, state/nonce checks, hashed opaque sessions, secure cookie, CSRF defense, token redaction |
| API pricing or terms change | Unexpected bill/noncompliance | Adapter boundary, monthly review, provider quotas, minimal stored content, attribution review |
| Free host sleeps or loses ephemeral disk | Slow demo/data loss | Warn about cold starts; use external managed Postgres; never rely on container disk |
| Team overbuilds | Unfinished project | Phase gates, explicit non-goals, one architecture-change record per exception |

## 10. Interview-readiness handoff

The team should prepare a 10-minute architecture walkthrough with this order:

1. State the user problem and explicit non-goals.
2. Draw the same-origin React/FastAPI service, PostgreSQL, LLM adapter, and Places/Routes adapter.
3. Trace generation, including grounding, structured output, validation, atomic persistence, and response.
4. Trace replanning, including stable IDs, locks, patch scope, full invariant checks, and optimistic concurrency.
5. Explain auth versus owner authorization and show a negative test.
6. Demonstrate a provider/model failure and the lack of partial writes.
7. Show CI, one migration, structured logs, a measured benchmark, and the current cost ledger.
8. Name a tradeoff: synchronous modular monolith now; queues/caching/horizontal scaling only when measured demand justifies them.
9. State personal ownership with pull requests and what the other developer implemented.
10. Say what is not built and what would change at 100,000 users.

Good evidence includes code links, test names, a migration, request logs with redaction, a failed validation fixture, an idempotency test, an authorization test, the generated PDF, CI history, and dated benchmark results. Screenshots alone are insufficient evidence of backend behavior.

## 11. Handoff checklist

Before coding:

- [ ] Replace Developer A/B with names in `memory.md`.
- [ ] Agree on repository visibility and an open-source license, if any.
- [ ] Recheck provider pricing, terms, student credits, billing caps, and data retention.
- [ ] Choose the initial LLM model based on current structured-output support, latency, data policy, and measured cost.
- [ ] Create provider projects with separate development/production credentials and least-privilege restrictions.
- [ ] Turn the phased backlog into issues with acceptance criteria and dependencies.
- [ ] Agree on a weekly budget review and a recurring architecture walkthrough.

Before calling the MVP complete:

- [ ] Satisfy every item in the MVP definition.
- [ ] Run security, accessibility, license, data-retention, and cost reviews.
- [ ] Update all status labels from proposed to implemented only where evidence exists.
- [ ] Record actual versions, deployment choices, limits, and metrics in `memory.md`.
- [ ] Remove illustrative resume wording that is not supported by real work.
- [ ] Freeze an interview demo fixture so live provider failures do not ruin the explanation.

