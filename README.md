# Roam

Roam is a planned AI-native travel planner built by two student developers.
See the [product handoff](docs/handoff.md) and [technical design](docs/DESIGN.md)
for the MVP scope and architecture.

Current code includes FastAPI trip CRUD with owner-scoped queries,
PostgreSQL/SQLAlchemy migrations, Google OIDC/database-backed sessions, the
authenticated creation form, My Trips dashboard and individual saved metadata
details. See [Saved trips](docs/SAVED_TRIPS.md) for implemented contracts,
launch instructions, verification and limitations. AI planning/maps/editing/PDF
controls and production deployment remain planned. Automated frontend fixtures
do not prove live authentication or backend ownership; real-service verification
and current blockers are recorded separately in [project memory](docs/memory.md).

Follow the [backend setup instructions](backend/README.md) to install
dependencies, start the local server, and run the available checks. Use the
[frontend guide](frontend/README.md), [authentication setup and architecture](docs/AUTH.md),
and [manual login/logout checklist](docs/auth-manual-checklist.md) to run the full
local authentication flow. Keep actual credentials in the ignored root .env;
never share them in chat or Git. [Automated auth tests](docs/auth-testing.md)
use synthetic provider responses and isolated PostgreSQL databases.
