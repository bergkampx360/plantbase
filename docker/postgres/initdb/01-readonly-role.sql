-- Read-only Postgres szerepkör az agent runSql toolja számára (docs/architektura.md, 2. döntés).
-- Csak lokális, docker-compose-os fejlesztői DB — a docker-compose.yml maga is így,
-- hardcode-olt jelszóval kezeli a plantbase (RW) felhasználót, ugyanez a minta itt is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plantbase_ro') THEN
    CREATE ROLE plantbase_ro LOGIN PASSWORD 'plantbase_ro';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE plantbase TO plantbase_ro;
GRANT USAGE ON SCHEMA public TO plantbase_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO plantbase_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plantbase_ro;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM plantbase_ro;
