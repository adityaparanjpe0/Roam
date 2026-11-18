# Changelog

All notable changes to **Roam — AI-Powered Travel Planner** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions and uses [Semantic Versioning](https://semver.org/) for releases.

## [Unreleased]

### Added
- PR #9 Google OIDC authorization-code authentication using Authlib/joserfc,
  state/nonce and PKCE, verified issuer/subject user persistence, hashed opaque
  PostgreSQL sessions, current-user lookup, CSRF-protected logout and React
  account controls. Automated tests use synthetic Google responses; live Google
  and deployed HTTPS verification remain pending. This is unreleased work.
- [Authentication architecture, setup, contracts and troubleshooting](docs/AUTH.md),
  [manual end-to-end checklist](docs/auth-manual-checklist.md), and
  [automated authentication coverage guide](docs/auth-testing.md). Trip ownership
  authorization remains planned for PR #10.
- PR #8 trip creation form: controlled destination, dates, travelers, total
  per-person USD budget, eight interests, and optional multiline preferences.
- Typed client validation/normalization and a local review/edit flow that preserves
  entered values and explicitly states the trip is not saved. No trip API or
  persistence is implemented.
- Automated trip validator/component tests and [field, draft-contract, validation,
  accessibility, and PR #11 integration documentation](docs/trip-creation-form.md).
- Responsive form/review polish, keyboard focus and selection feedback, atomic
  error-count announcements, and an emphasized not-saved review notice.
- PR #3 Milestone 1 backend foundation: minimal FastAPI application, Python 3.12
  runtime selection, uv dependency declarations/lockfile, and local setup instructions.
- PR #3 Milestone 2: dependency-free `GET /health` liveness endpoint returning
  HTTP 200 with `{"status":"ok"}`, using a router and typed response schema.
- PR #3 Milestone 3: pytest discovery/import configuration and three health
  endpoint tests covering HTTP status, exact response body, and JSON content type.
- Initial project directory structure for frontend, backend, and documentation.
- Project architecture, development guidelines, and AI coding agent instructions.
- Environment variable template (`.env.example`).
- Git ignore configuration (`.gitignore`).

## [0.1.0] — Planned

**Development Foundation**

- Initialize React and TypeScript frontend.
- Initialize Python and FastAPI backend.
- Configure PostgreSQL for local development.
- Set up Docker-based development environment.
- Configure GitHub Actions for automated testing and linting.

## [0.2.0] — Planned

**Core AI Itinerary Planning**

- Implement authentication and trip management.
- Integrate real-world Places and routing APIs.
- Generate structured itineraries using an LLM.
- Validate schedules, budgets, and travel constraints.
- Display and save generated itineraries.

## [0.3.0] — Planned

**Intelligent Replanning**

- Enable activity editing and itinerary updates.
- Implement locked activities.
- Support natural-language itinerary modifications.
- Validate proposed modifications before saving.

## [1.0.0] — Planned

**Initial MVP Release**

- Implement visually polished PDF itinerary exports.
- Complete automated and integration testing.
- Deploy the application.
- Finalize architecture documentation and project README.
