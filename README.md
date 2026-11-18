# Roam

Roam is a planned AI-native travel planner built by two student developers.
See the [product handoff](docs/handoff.md) and [technical design](docs/DESIGN.md)
for the MVP scope and architecture.

Current code includes FastAPI liveness, PostgreSQL/SQLAlchemy migrations, the
React trip form with local unsaved review, and Google OIDC with database-backed
Roam sessions and account controls. PR #9 Milestones 1–8 are reported reviewed;
Milestone 9 documents authentication and awaits human local Google verification.
Trip CRUD, ownership enforcement, AI planning and production deployment remain
planned. No released version or live Google login result is claimed.

Follow the [backend setup instructions](backend/README.md) to install
dependencies, start the local server, and run the available checks. Use the
[frontend guide](frontend/README.md), [authentication setup and architecture](docs/AUTH.md),
and [manual login/logout checklist](docs/auth-manual-checklist.md) to run the full
local authentication flow. Keep actual credentials in the ignored root .env;
never share them in chat or Git. [Automated auth tests](docs/auth-testing.md)
use synthetic provider responses and isolated PostgreSQL databases.
