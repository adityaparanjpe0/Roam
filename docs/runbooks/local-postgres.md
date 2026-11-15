# Local PostgreSQL

## Milestone 2 verification — 2026-11-15

Configuration under test: commit `f715de3` on `feat/postgres-docker-setup`, using
the root [Compose file](../../docker-compose.yml). This section records observed
results; the full developer setup and troubleshooting guide is Milestone 3.

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
