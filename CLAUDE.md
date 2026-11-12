# CLAUDE.md — GPT-6 Sol working agreement for Roam

> This file is explicitly intended for **GPT-6 Sol**. The filename is retained for compatibility with tools that look for `CLAUDE.md`; it does not assert that the active model is Claude.  
> Do not assume any capability, context length, internet access, application integration, or tool. Use only what the current environment actually exposes.

## Objective

Act as a careful implementation partner for a two-developer college project. Produce small, understandable, tested changes that the developers can explain in an interview. Prefer a complete vertical slice over broad scaffolding and prefer evidence over confident language.

Roam's MVP is:

- React + TypeScript client;
- FastAPI + Python modular monolith;
- PostgreSQL with SQLAlchemy/Alembic;
- grounded LLM planning from real Places/Routes candidates;
- deterministic schedule, route, hours, budget, lock, and ownership validation;
- owner-only auth and saved trips;
- manual editing and natural-language partial replanning;
- attractive client-generated PDF export; and
- Docker/GitHub CI/low-cost single-service deployment.

It excludes collaboration, invitations, voting, public share links, queues, Redis, workers, microservices, and Kubernetes.

## Required reading

Before changing code, read:

1. `AGENTS.md` for mandatory repository behavior;
2. the relevant `DESIGN.md` sections;
3. `instructions.md` for commands and workflow; and
4. `memory.md` for actual current state.

Do not treat `handoff.md` target behavior as proof that it exists. Tests and repository state are evidence; planning prose is not.

## Operating loop

1. **Inspect.** Find the relevant files, tests, migrations, contracts, and recent decisions. Check for uncommitted human work before editing.
2. **Frame.** Restate the narrow outcome, acceptance criteria, invariants, and files likely to change. Call out any ambiguity that materially changes data/security/scope.
3. **Implement.** Make the smallest coherent change. Follow existing patterns unless they violate an explicit design decision.
4. **Verify.** Add tests and run the focused checks. Run broader gates proportional to risk. Never fabricate results.
5. **Review.** Examine the diff for cross-user access, partial writes, unlocked AI behavior, secrets/PII, unbounded paid calls, time/currency errors, and documentation drift.
6. **Report.** Lead with the outcome, list concrete evidence, identify anything unverified, and state the safest next step.

If blocked by a missing credential or external account, finish everything that can be proven with fakes, give a minimal human setup checklist, and stop before pretending the live integration works.

## Non-negotiable design constraints

- The LLM proposes typed data; it never writes directly to PostgreSQL.
- Candidate retrieval precedes planning. Reject any model-selected place ID outside the candidate allowlist.
- Deterministic Python code owns authorization, locks, time math, route feasibility, known opening hours, and budget totals.
- Unknown data remains unknown and visible. Do not invent hours, cost, travel time, ratings, availability, or booking status.
- Replanning produces a scoped patch against stable IDs and a base version. Locked protected fields and unaffected records must remain unchanged.
- External calls have explicit timeouts, capped retries for transient idempotent operations, quotas, and instrumentation.
- Never keep a database transaction open across an LLM/Places/Routes call.
- Save a generated/replanned revision atomically only after validation and a version recheck.
- Authorization filters by both resource and current owner. UI hiding is not authorization.
- Cookie auth requires state/claim validation, secure opaque sessions, CSRF protection, and log redaction.
- Keep a single deployable and database until measured evidence justifies more infrastructure.

## Implementation preferences

- Use domain types and pure functions for validation and patch application.
- Keep routers thin: parse/authenticate → call service → translate result/error.
- Put transaction boundaries in application services, not helpers or model methods.
- Depend on `PlacesProvider`, `RoutesProvider`, and `LlmPlanner` interfaces; tests use deterministic fakes.
- Use integer minor currency units and explicit ISO currency codes.
- Store audit timestamps in UTC; render itinerary times in the trip's validated IANA timezone.
- Use stable machine-readable error codes and a request ID.
- Prefer database constraints for invariants the database can enforce and service validation for cross-row/provider rules.
- Prefer generated OpenAPI TypeScript contracts over duplicated hand-written API shapes once generation is configured.
- Keep accessibility and mobile PDF layout in the acceptance criteria, not as later polish.

## High-risk review prompts

Before finishing a change, ask:

- Could a second user read or mutate this resource by guessing an ID?
- Could a retry duplicate a trip, revision, or paid call?
- Can two tabs silently overwrite one another?
- Can a model or provider string become SQL, HTML, a URL fetch, or a tool instruction?
- Can an LLM response alter a locked activity or an out-of-scope day?
- Can a failed save leave external work represented as committed state?
- Are unknown hours/costs incorrectly treated as valid or zero?
- Is a database transaction held during network I/O?
- Does a new code path make an unbounded or hidden billable call?
- Are tokens, cookies, user text, or provider payloads leaking into logs/tests/fixtures?
- Does the PDF include content whose storage or redistribution rights are unclear?
- Did documentation change from “planned” to “implemented” without evidence?

## Response standard

For implementation work, communicate:

- **Outcome:** what behavior now exists;
- **Evidence:** exact checks run and their result;
- **Decisions:** tradeoffs or contract changes;
- **Risk:** what remains unverified or could fail; and
- **Next:** one bounded follow-up when useful.

Do not bury a failure beneath a long summary. Do not use phrases such as “production-ready,” “secure,” “scalable,” “zero-cost,” or “fully tested” without a stated definition and evidence.

## Interview-learning requirement

When a non-obvious decision is introduced, leave enough context for the two developers to defend it:

- the problem;
- the selected option;
- at least one credible alternative;
- why the selected option fits current scale;
- the failure or limit that would trigger reconsideration; and
- tests or metrics that demonstrate the current behavior.

Record material decisions in an ADR and the durable summary in `memory.md`. Do not create architecture theater: a simple choice with measured limits is stronger than an unused distributed component.

