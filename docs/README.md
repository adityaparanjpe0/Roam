# Roam project documentation pack

> Status: planning package, not an implemented application  
> Package date: 2026-11-07  
> Intended audience: two college developers building and defending the project together

This directory is the source-of-truth documentation starter for **Roam**, an AI-native travel planner. Copy the directory contents into the root of the future Roam repository. Keep the filenames and links intact.

The package is deliberately scoped to an interview-defensible MVP: one React/TypeScript frontend, one modular FastAPI/Python backend, PostgreSQL, real Places/Routes data, constrained LLM planning, deterministic validation, owner-only authorization, partial replanning with locked activities, saved trips, and a downloadable PDF. It does **not** claim that any application code, deployment, tests, integrations, or performance results already exist.

## File index

| File | Primary audience | Purpose |
|---|---|---|
| [`handoff.md`](handoff.md) | Both developers | Product scope, phased backlog, acceptance criteria, risks, ownership, and handoff checklist |
| [`AGENTS.md`](AGENTS.md) | Any coding agent | Repository-wide constraints, truthfulness rules, architecture boundaries, and verification expectations |
| [`CLAUDE.md`](CLAUDE.md) | GPT-6 Sol | A concise working agreement for GPT-6 Sol; the filename is conventional and does not imply a different model |
| [`SKILL.md`](SKILL.md) | Codex-compatible assistants | Reusable Roam development workflows for features, migrations, providers, validation, PDF work, and pull requests |
| [`DESIGN.md`](DESIGN.md) | Developers and interviewers | Architecture, data model, APIs, flows, security, reliability, cost, licensing, and scaling decisions |
| [`instructions.md`](instructions.md) | Human contributors | Local setup target, engineering standards, GitHub workflow, CI, testing, migrations, and deployment practices |
| [`prompt.md`](prompt.md) | Future AI sessions | Copyable master prompt for bounded, evidence-based implementation work |
| [`memory.md`](memory.md) | Both developers and assistants | Durable decisions, current status, open questions, ownership log, evidence ledger, and change log |

## Reading order

1. Read `handoff.md` for the product and delivery plan.
2. Read `DESIGN.md` before changing architecture, schema, APIs, auth, provider behavior, or validation rules.
3. Read `instructions.md` before contributing code.
4. Let tools and coding assistants load `AGENTS.md`; use `CLAUDE.md` specifically with GPT-6 Sol.
5. Use `SKILL.md` when repeating a project workflow.
6. Update `memory.md` after every merged decision or milestone.
7. Use `prompt.md` to start a fresh implementation session without losing scope.

## Canonical decisions at a glance

- **Architecture:** modular monolith; React build and FastAPI API are deployed as one same-origin service initially.
- **Persistence:** PostgreSQL with SQLAlchemy and Alembic; SQL is favored because trips, days, activities, ownership, and revisions are relational.
- **AI boundary:** retrieve real candidate places first; the LLM may select only supplied candidate IDs and must return schema-valid JSON.
- **Authority:** deterministic Python code—not the LLM—enforces ownership, locks, schedule feasibility, opening-hour checks, route timing, and budget arithmetic.
- **Replanning:** produce and validate a patch against a trip version; change only the requested scope; reject any locked-activity mutation.
- **Authentication:** Google OpenID Connect/OAuth login plus server-side opaque sessions in secure cookies. Authorization is trip ownership, not premature RBAC.
- **Sharing:** a user downloads a polished PDF and sends the file. There are no public share links, invitations, votes, or live collaboration in the MVP.
- **Operations:** bounded synchronous planning requests, provider timeouts, careful retries, idempotency keys, structured logs, and database-backed usage caps. No Redis, queue, worker, or microservices initially.
- **Cost:** design for a low-volume demo on free allowances with a hard target of USD $0–$5/month. This is a target, not a guarantee; provider pricing must be rechecked before deployment.

## How to keep the pack truthful

- Use **proposed**, **planned**, or **target** until code and evidence exist.
- Move an item to **implemented** only after it is merged and verified.
- Record the exact test, log, screenshot, deployment URL, benchmark, or pull request in `memory.md`.
- Never turn target metrics or illustrative resume bullets into factual claims.
- When implementation changes a decision, update all affected documents in the same pull request.

## Initial repository target

```text
roam/
├── AGENTS.md
├── CLAUDE.md
├── DESIGN.md
├── SKILL.md
├── handoff.md
├── instructions.md
├── memory.md
├── prompt.md
├── README.md
├── frontend/
├── backend/
├── docs/
├── scripts/
├── docker-compose.yml
└── .github/workflows/
```

The code directories and automation files above are a target layout; they are not part of this documentation-only package.

