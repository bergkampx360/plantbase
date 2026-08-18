---
name: db-role-setup
description: Use when creating or changing the Prisma schema/migrations in packages/db, or when the local Postgres container is (re)started — provisions and verifies the strictly read-only Postgres role that the agent's runSql and searchKnowledge tools connect through, so the agent can never mutate data (see docs/architektura.md decision #2), plus the insert-only role for the customer-handoff escalation queue (docs/implementation/09-customer-facing-poc.md, J1).
---

# DB role setup (Prisma + read-only agent role + insert-only handoff role)

Plantbase uses **three DB connections with three different roles** (docs/architektura.md, docs/stack.md; third one added in J1, HF5):

- `DATABASE_URL` — read-write, used only by Prisma (schema, migrate, seed) in `packages/db`.
- `DATABASE_URL_READONLY` — used only by the agent's `runSql` and `searchKnowledge` tools in `packages/core`
  (`searchKnowledge`'s `rag/knowledge-store.ts` `searchChunks()` reads `knowledge_chunks` on this same
  connection, F6). This role must be physically incapable of writing, not just conventionally restricted
  by app code.
- `DATABASE_URL_HANDOFF` — used only by the customer-facing agent's `requestHumanHandoff` tool in
  `packages/core`. INSERT-only on the `customer_handoffs` table — can't even read back what it wrote.
  Provisioned by `docker/postgres/initdb/02-handoff-role.sql`, applied the same way as step 3 below.
  That same file also **revokes** the `plantbase_ro` role's SELECT on `customer_handoffs`, closing a gap
  where `plantbase_ro`'s blanket `ALTER DEFAULT PRIVILEGES` (step 3 below) would otherwise silently grant
  the internal, free-form-SQL `runSql` tool read access to customer escalations the moment the table
  was created by a migration.

## When to run this

- First time setting up the local DB (docker-compose Postgres is empty).
- After adding/changing a table or column in `packages/db/prisma/schema.prisma`.
- After recreating the docker volume (`docker compose down -v`).
- After `prisma migrate reset` (or any drift-triggered reset) on an existing volume — it drops
  and recreates the entire `public` schema, which wipes the RO role's `USAGE`/`SELECT` grants
  even though the role itself survives. The `docker-entrypoint-initdb.d` script does NOT rerun
  in this case (it only runs once, on a genuinely fresh volume), so step 3 below must be applied
  manually every time. Verify with step 5 before assuming the agent's `runSql`/`searchKnowledge`
  tools still work after a reset.

## Steps

1. **Start Postgres** if it isn't running:

   ```bash
   docker compose up -d
   ```

2. **Apply the Prisma migration** (read-write connection, from `packages/db`):

   ```bash
   pnpm --filter @plantbase/db exec prisma migrate dev
   ```

   If `packages/db` doesn't exist yet, use the `scaffold-nx-package` skill first to create it, then write/extend
   `prisma/schema.prisma` to match the `products` table in `docs/stack.md` before migrating.

3. **Create or refresh the read-only role.** Put the SQL in
   `docker/postgres/initdb/01-readonly-role.sql` (this directory is mounted as Postgres `docker-entrypoint-initdb.d`,
   so it only auto-runs on a fresh volume — re-run it manually after schema changes on an existing volume):

   ```sql
   DO $$
   BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plantbase_ro') THEN
       CREATE ROLE plantbase_ro LOGIN PASSWORD '<from .env, never hardcode>';
     END IF;
   END
   $$;

   GRANT CONNECT ON DATABASE plantbase TO plantbase_ro;
   GRANT USAGE ON SCHEMA public TO plantbase_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO plantbase_ro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plantbase_ro;
   REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM plantbase_ro;
   ```

   Apply it manually against a running container with:

   ```bash
   docker compose exec -T postgres psql -U "$POSTGRES_USER" -d plantbase -f - < docker/postgres/initdb/01-readonly-role.sql
   ```

3b. **Create or refresh the insert-only handoff role**, only relevant once `customer_handoffs` exists
(J1). SQL in `docker/postgres/initdb/02-handoff-role.sql` — same auto-run-once-on-fresh-volume
caveat as step 3, so re-apply manually after schema changes on an existing volume:

    ```bash
    docker compose exec -T postgres psql -U "$POSTGRES_USER" -d plantbase -f - < docker/postgres/initdb/02-handoff-role.sql
    ```

    This file grants `plantbase_handoff` `INSERT` (and `USAGE` on the table's `id` sequence — a plain
    table-level `INSERT` grant is not sufficient for a `SERIAL`/`autoincrement()` column, `nextval()`
    needs its own sequence grant) on `customer_handoffs` only, and revokes `plantbase_ro`'s
    default-privilege SELECT on that same table.

4. **Point env vars at the right role.** In `.env` (never commit):

- `DATABASE_URL` → app/Prisma role (read-write, `plantbase`).
- `DATABASE_URL_READONLY` → `plantbase_ro`.
- `DATABASE_URL_HANDOFF` → `plantbase_handoff` (only once J1 has run).
  These variable names are already documented in `.env.example` (no real values/passwords there).

5. **Verify the roles actually have exactly the access they should** — these are the checks that matter:

   ```bash
   psql "$DATABASE_URL_READONLY" -c "INSERT INTO products (name) VALUES ('should fail');"
   ```

   Expect `ERROR: permission denied for table products`. If it succeeds, stop and fix the grants before
   wiring `runSql` to this connection.

   Once J1 has run, also verify the handoff role's INSERT-only, can't-read-back guarantee, and that the
   RO role's default-privilege SELECT on the new table was actually revoked:

   ```bash
   psql "$DATABASE_URL_HANDOFF" -c "INSERT INTO customer_handoffs (question, reason) VALUES ('teszt', 'weak_knowledge');"   # should succeed
   psql "$DATABASE_URL_HANDOFF" -c "SELECT * FROM customer_handoffs;"                                                        # should fail: permission denied
   psql "$DATABASE_URL_READONLY" -c "SELECT * FROM customer_handoffs;"                                                       # should fail: permission denied
   ```

6. Confirm `packages/core`'s `runSql` and `searchKnowledge` tools read their connection string from
   `DATABASE_URL_READONLY`, never from `DATABASE_URL`; and (once J1 has run) that `requestHumanHandoff`
   reads from `DATABASE_URL_HANDOFF`, never from `DATABASE_URL` or `DATABASE_URL_READONLY`.
