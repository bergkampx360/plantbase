---
name: db-role-setup
description: Use when creating or changing the Prisma schema/migrations in packages/db, or when the local Postgres container is (re)started — provisions and verifies the strictly read-only Postgres role that the agent's runSql tool connects through, so the agent can never mutate data (see docs/architektura.md decision #2).
---

# DB role setup (Prisma + read-only agent role)

Plantbase uses **two DB connections with two different roles** (docs/architektura.md, docs/stack.md):

- `DATABASE_URL` — read-write, used only by Prisma (schema, migrate, seed) in `packages/db`.
- `DATABASE_URL_READONLY` — used only by the agent's `runSql` tool in `packages/core`. This role must be
  physically incapable of writing, not just conventionally restricted by app code.

## When to run this

- First time setting up the local DB (docker-compose Postgres is empty).
- After adding/changing a table or column in `packages/db/prisma/schema.prisma`.
- After recreating the docker volume (`docker compose down -v`).

## Steps

1. **Start Postgres** if it isn't running:
   ```bash
   docker compose up -d
   ```

2. **Apply the Prisma migration** (read-write connection, from `packages/db`):
   ```bash
   pnpm --filter db exec prisma migrate dev
   ```
   If `packages/db` doesn't exist yet, use the `scaffold-nx-package` skill first to create it, then write/extend
   `prisma/schema.prisma` to match the `products` table in `docs/stack.md` before migrating.

3. **Create or refresh the read-only role.** Put the SQL in
   `docker/postgres/initdb/01-readonly-role.sql` (this directory is mounted as Postgres `docker-entrypoint-initdb.d`,
   so it only auto-runs on a fresh volume — re-run it manually after schema changes on an existing volume):
   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plantbase_readonly') THEN
       CREATE ROLE plantbase_readonly LOGIN PASSWORD '<from .env, never hardcode>';
     END IF;
   END
   $$;

   GRANT CONNECT ON DATABASE plantbase TO plantbase_readonly;
   GRANT USAGE ON SCHEMA public TO plantbase_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO plantbase_readonly;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plantbase_readonly;
   REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM plantbase_readonly;
   ```
   Apply it manually against a running container with:
   ```bash
   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d plantbase -f - < docker/postgres/initdb/01-readonly-role.sql
   ```

4. **Point env vars at the right role.** In `.env` (never commit):
   - `DATABASE_URL` → app/Prisma role (read-write).
   - `DATABASE_URL_READONLY` → `plantbase_readonly`.
   Update `.env.example` with the variable names (no real values/passwords).

5. **Verify the role actually can't write** — this is the one check that matters:
   ```bash
   psql "$DATABASE_URL_READONLY" -c "INSERT INTO products (name) VALUES ('should fail');"
   ```
   Expect `ERROR: permission denied for table products`. If it succeeds, stop and fix the grants before
   wiring `runSql` to this connection.

6. Confirm `packages/core`'s `runSql` tool reads its connection string from `DATABASE_URL_READONLY`, never from
   `DATABASE_URL`.
