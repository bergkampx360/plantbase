-- Insert-only Postgres szerepkör a customer-facing agent requestHumanHandoff toolja
-- számára (docs/implementation/09-customer-facing-poc.md, J1, 2. döntés). Csak lokális,
-- docker-compose-os fejlesztői DB — hardcode-olt jelszóval, a 01-readonly-role.sql
-- mintáját követve.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'plantbase_handoff') THEN
    CREATE ROLE plantbase_handoff LOGIN PASSWORD 'plantbase_handoff';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE plantbase TO plantbase_handoff;
GRANT USAGE ON SCHEMA public TO plantbase_handoff;
GRANT INSERT ON customer_handoffs TO plantbase_handoff;
-- Az id (autoincrement, Prisma @default(autoincrement())) egy Postgres sequence-re épül;
-- INSERT-hez a role-nak a sequence-en is USAGE kell (nextval()), a tábla-szintű INSERT
-- grant önmagában nem elég.
GRANT USAGE ON SEQUENCE customer_handoffs_id_seq TO plantbase_handoff;
-- Explicit, defense-in-depth: a role sosem kapott SELECT-et sehol, de ez itt kimondja,
-- hogy a customer_handoffs-ra sem olvashat vissza, még saját maga sem.
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON customer_handoffs FROM plantbase_handoff;

-- Kritikus kiegészítés a plantbase_ro szerepkörhöz (01-readonly-role.sql): az ottani
-- "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO plantbase_ro" sor
-- (nincs explicit FOR ROLE) automatikusan SELECT-et adott plantbase_ro-nak a
-- customer_handoffs táblára is, amint a migráció lefutott (a migrációt futtató role
-- hozta létre a táblát). Enélkül a belső, szabad-SQL-es runSql tool olvashatná az
-- ügyfelek kérdéseit/panaszait és a staff válasz-vázlatait — ez visszavonja azt.
REVOKE SELECT ON customer_handoffs FROM plantbase_ro;
