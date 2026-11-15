# Local PostgreSQL

This is a **local development** database, not a production deployment. Each
developer runs their own database and chooses their own password. No cloud
account, API key, backend change, or host PostgreSQL installation is required.

## First-time setup

1. Install and open Docker Desktop with Linux containers enabled. Use Docker
   Engine **28.0.0 or newer** and Compose v2 with `up --wait` support. The observed
   versions are recorded below. Older Docker engines have a documented
   [localhost publishing limitation](https://docs.docker.com/engine/network/port-publishing/).
2. Open a terminal at the repository root. Check `docker --version`,
   `docker compose version`, and `docker info`. A daemon connection error means
   Docker Desktop is not ready.
3. If `.env` already exists, preserve it and add only missing settings. Otherwise
   copy the [example](../../.env.example):

   macOS/Linux:

   ```sh
   cp -n .env.example .env
   chmod 600 .env
   ```

   Windows PowerShell:

   ```powershell
   if (Test-Path .env) { throw '.env already exists; preserve it.' }
   Copy-Item .env.example .env
   ```

   On Windows, keep the file in your own user directory and review its filesystem
   permissions; `chmod 600` is a macOS/Linux permission setting.
4. Edit `.env`, retaining the example's database/user names unless you need to
   change them. Set `POSTGRES_PASSWORD` to a unique, randomly generated local
   password. A password manager's generator is suitable. Alternatively, generate
   a 32-byte hexadecimal value locally:

   macOS/Linux:

   ```sh
   openssl rand -hex 32
   ```

   Windows PowerShell:

   ```powershell
   $roamDbBytes = New-Object byte[] 32
   $roamDbRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $roamDbRng.GetBytes($roamDbBytes)
   $roamDbRng.Dispose()
   [System.BitConverter]::ToString($roamDbBytes).Replace('-', '').ToLowerInvariant()
   ```

   These generator commands display the new secret in your terminal. Paste it
   only into your local `.env`; do not share the output, screenshot it, or commit
   it. Never put a real password in `.env.example`.

| Variable | Purpose |
|---|---|
| `POSTGRES_DB` | Database initialized on first startup; example: `roam_dev`. |
| `POSTGRES_USER` | Development bootstrap user; example: `roam_dev`. This is a superuser, not the future restricted application role. |
| `POSTGRES_PASSWORD` | Required local password; no shared/default value is supplied. |
| `POSTGRES_PORT` | Host port, default 5432. Use 55432 if 5432 is occupied. The container still listens on 5432. |

The root `.env` supplies Compose interpolation; only the explicitly listed
variables are passed to the container. Exported shell variables can override the
file, so check your terminal environment if settings appear inconsistent. Do not
source `.env` as a shell script. A `DATABASE_URL` is not needed yet: the current
FastAPI app does not connect to PostgreSQL.

## Start and verify

Run from the repository root:

```sh
docker compose config --quiet
docker compose up -d --wait --wait-timeout 90 db
docker compose ps
docker compose port db 5432
```

Expected: `db` is healthy and the published address is `127.0.0.1:5432` or your
chosen local port, never `0.0.0.0` or `[::]`. The first start pulls the image and
creates the project-scoped volume. The wait timeout bounds readiness after
startup; image download time is additional. `pg_isready` checks whether the
server accepts connections; it does not prove authentication, application
readiness, or correctness of queries.

Use the bundled client to verify authentication without installing `psql` on the
host. With the example database/user names:

```sh
docker compose exec db psql -h db -U roam_dev -d roam_dev -W
```

Enter the password when prompted; it is not echoed. Replace the database/user
arguments if you changed them. Inside `psql`:

```sql
SELECT current_database(), current_user;
SELECT 1;
\q
```

Repeat with an incorrect password and expect authentication failure. The `db`
hostname exercises the container-network authentication rule; internal loopback
connections may be trusted by the image. If `psql` is already installed on the
host, verify the published port too (substitute your port):

```sh
psql -h 127.0.0.1 -p 55432 -U roam_dev -d roam_dev -W
```

The backend's `GET /health` remains a separate, dependency-free liveness check.
Starting or stopping this database does not configure backend database access.
See the [backend instructions](../../backend/README.md).

## Stop, resume, and inspect

| Command | Effect |
|---|---|
| `docker compose stop db` | Stop PostgreSQL; preserve its container and volume. |
| `docker compose start db` | Resume the existing container. |
| `docker compose up -d --wait --wait-timeout 90 db` | Start/apply configuration and wait for health. |
| `docker compose restart db` | Restart the existing container; use the preceding command to wait for health afterward. |
| `docker compose down` | Remove this project's containers/network; preserve the named volume. |
| `docker compose logs --tail=50 db` | Inspect recent logs locally; review/redact before sharing. |

Do not share raw `docker compose config` or unrestricted `docker inspect`
output: they can include credentials. Prefer `config --quiet` and narrow
inspection fields. Do not commit database dumps or local credentials.

## Repeat the persistence check

Use a disposable database, not application tables. In the authenticated `psql`
session connected to `roam_dev`, create the following only if that database name
is not already in use. If it exists, choose a new verification name; do not
delete an unknown database to make the test pass.

```sql
CREATE DATABASE roam_persistence_check;
\connect roam_persistence_check
CREATE TABLE persistence_probe (id integer PRIMARY KEY, marker text NOT NULL);
INSERT INTO persistence_probe VALUES (1, 'local-persistence-check');
TABLE persistence_probe;
\q
```

1. Run `docker compose restart db`, then the health-wait command above.
2. Connect with `docker compose exec db psql -h db -U roam_dev -d roam_persistence_check -W`.
   Run `TABLE persistence_probe;` and verify the exact row; quit with `\q`.
3. Record the container ID using `docker compose ps -q db`. Run
   `docker compose down`, then the health-wait command. The new container ID
   should differ, while querying the probe should return the same row.
4. After verification, reconnect to `roam_dev` and run
   `DROP DATABASE roam_persistence_check;` to remove **only your disposable test**.

PostgreSQL 18 stores data beneath `/var/lib/postgresql/18/docker`; the volume
mount is its parent `/var/lib/postgresql`. Keep the Compose project name stable
to reuse its volume. For this checkout, the default project is `roam` and the
volume is `roam_postgres_data`. A different checkout/project name may create a
different volume; it does not mean the original data was deleted.

## Troubleshooting and destructive reset

- **Port already occupied:** change only `POSTGRES_PORT` in `.env`, then run the
  health-wait command to apply it. Do not stop an unrelated database. Changing
  the port does not require deleting the volume.
- **Missing variable:** fill the required settings in `.env`. An empty password
  is intentionally rejected. Do not use the example unchanged as credentials.
- **Changed password/user/database has no effect:** initialization variables
  only apply to an empty volume. Change existing credentials using authenticated
  PostgreSQL administration; editing `.env` alone does not rotate a password.
- **Unhealthy/startup failure:** check Docker Desktop, `docker compose ps`, and
  recent logs. Diagnose before resetting anything.
- **Database version upgrade:** do not simply switch major image versions against
  the existing data. Plan and test `pg_upgrade` or dump/restore separately.

`docker compose down -v` is an **intentional data-deletion operation**. It removes
this project's named database volume. Never use it for ordinary stop/restart or
as a default troubleshooting step. Only reset disposable data after explicitly
accepting its loss and backing up anything needed. A named volume is not a backup.

## Local security boundary and future deployment

Observed on 2026-11-15: published access is loopback-only, external-client rules
use SCRAM-SHA-256, the development user is a superuser, internal socket/loopback
rules use `trust`, and PostgreSQL TLS is off. The password is plaintext in the
ignored local file and is injected into the container environment. Host/Docker
administrators can access it. Store only synthetic development data here.

This Compose file must not be deployed unchanged. Production work remains:
restricted application credentials, managed PostgreSQL with verified TLS and
network restrictions, deployment secret storage, tested backups/restores,
image/dependency scanning and patching, and application authorization/security.
No vulnerability-free, production-ready, or disaster-recovery claim is made.
See the [deployment design](../DESIGN.md#16-deployment-and-release-design).

Runtime verification below was on macOS only. PowerShell instructions are
provided for the teammate, but Windows runtime and filesystem behavior have not
been tested here.

## Milestone 2 verification — 2026-11-15

Configuration under test: commit `f715de3` on `feat/postgres-docker-setup`, using
the root [Compose file](../../docker-compose.yml). This section records observed
results; setup and troubleshooting instructions are above.

### Environment

- macOS with Docker Desktop; Docker Engine **28.1.1**, Compose **2.35.1**.
- Image: `postgres:18.7-bookworm`; SQL reported **18.7 (Debian 18.7-1.pgdg12+2)**.
- Pulled image digest: `postgres@sha256:ece55f7868da684e400f82f1030a050718adbdd65c23aa500c486f6e2950dc0f`.
- Host connection: **127.0.0.1:55432**. A pre-existing host PostgreSQL service
  occupied 5432, so only the ignored local `.env` was changed to use 55432.
  The shared example still defaults to 5432. The existing service was untouched.
- Docker-managed volume: `roam_postgres_data`, mounted at `/var/lib/postgresql`.
  PostgreSQL reported its data directory as `/var/lib/postgresql/18/docker`.
- A random local password was generated without displaying it. `.env` is ignored,
  untracked, and has owner-only permissions (`-rw-------`) on this machine.

### Results

| Check | Observed result |
|---|---|
| `docker compose config --quiet` | Passed. |
| `docker compose up -d --wait --wait-timeout 90 db` | Reached healthy after using free host port 55432. |
| `docker compose port db 5432` | Reported `127.0.0.1:55432`; live container inspection showed only this published binding. |
| Authenticated SQL from the host | Correct password allowed a query against `roam_dev`; incorrect password was rejected with password authentication failure. |
| Incorrect password through container network hostname `db` | Rejected. |
| Container restart | Exact marker row survived; container ID remained unchanged. |
| Container removal and recreation | Exact marker row survived; container ID changed; named-volume name and creation timestamp remained unchanged. |
| Verification cleanup | Disposable test database removed; `roam_dev` contains zero public application tables. |

Authentication was tested using the host's existing `psql` client through the
published port. Credentials were passed in process environment variables without
being printed or included in command arguments. Tests inside the container used
`-h db`: the image's internal loopback connections can use trusted initialization
rules, so an internal `-h 127.0.0.1` query alone does **not** prove password enforcement
for external clients.

### Persistence evidence

A separate disposable database, `roam_persistence_check`, contained only:

```sql
CREATE TABLE persistence_probe (id integer PRIMARY KEY, marker text NOT NULL);
INSERT INTO persistence_probe VALUES (1, 'roam-persistence-20261115');
```

After each lifecycle operation, SQL asserted that exactly one row still matched
both the ID and marker; a mismatch would raise an exception with
`ON_ERROR_STOP=1`. The query returned the same row both times.

1. Ran `docker compose restart db`, then
   `docker compose up -d --wait --wait-timeout 90 db` to wait for health.
   Container ID remained `fe3ce6899c70…`; the marker survived.
2. Ran `docker compose down` **without `-v`**, then
   `docker compose up -d --wait --wait-timeout 90 db`.
   New container ID: `59624384603b…`; the marker survived.
3. The volume remained `roam_postgres_data`, created at `2026-11-15T19:18:48Z`.
4. Dropped only the disposable verification database and confirmed its absence.

No application models, migrations, backend integration, or frontend changes were
introduced. Persistence across container replacement is verified; backups,
disaster recovery, PostgreSQL upgrades, and Windows runtime behavior are not.

### State at handoff

The database is running and healthy on `127.0.0.1:55432`. The named volume and
ignored local credentials remain for subsequent development. Use
`docker compose stop db` to stop it without removing the container or volume.
Do not use `docker compose down -v` for routine shutdown: it deletes the database
volume. Keep the Compose project name stable to reuse the same project-scoped
volume.
