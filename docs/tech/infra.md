# Plantbase — infrastruktúra

> `ddd-audit` skill tartja karban (`docs/dev-workflow.md`). Első létrehozás: F2
> (`docs/implementation/05-rag-pipeline.md`) — a pgvector-kiterjesztés volt az első valódi
> trigger, de a fájl a **teljes meglévő** infrastruktúrát leírja, nem csak a RAG-deltát.

## Lokális Postgres (docker-compose)

- `docker-compose.yml` egyetlen szolgáltatása: `postgres`, image `pgvector/pgvector:0.8.5-pg17`
  (verzió-rögzített, a `pgvector` extension miatt cserélve `postgres:17-alpine`-ról F1-ben).
- OrbStack futtatja lokálisan, nincs felhő-DB.
- Host port `5433` → konténer `5432` (az 5432-t más projekt foglalja a gépen).
- Adat: named volume (`plantbase-pgdata`), tehát `docker compose down` (volume nélkül) nem
  törli az adatot; `docker compose down -v` vagy `prisma migrate reset` igen (utóbbi csak a
  `public` sémát dobja el és hozza létre újra, ld. lentebb).
- `docker/postgres/initdb/01-readonly-role.sql` a `docker-entrypoint-initdb.d`-be van mountolva
  — **csak friss volume-on fut le automatikusan** (első konténer-indításkor).

## Két DB-kapcsolat, két jog (`docs/architektura.md`, 2. döntés)

| Kapcsolat  | Env var                 | Szerepkör      | Jog                         | Ki használja                                                                                                                                                                           |
| ---------- | ----------------------- | -------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-write | `DATABASE_URL`          | `plantbase`    | teljes (séma/migráció/seed) | Prisma (`packages/db`); F5-től a RAG-ingest RW poolja is (`packages/core/src/db-pool.ts` `getWritePool()`, `packages/core/src/rag/knowledge-store.ts` `insertChunks`/`clearKnowledge`) |
| Read-only  | `DATABASE_URL_READONLY` | `plantbase_ro` | csak `SELECT`               | agent `runSql` tool (`packages/core`), F6-tól a `searchKnowledge` tool is                                                                                                              |

A `plantbase_ro` szerepkör fizikailag képtelen írni (nem csak app-szinten korlátozott) —
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE` az összes táblán. A pontos SQL és a
provisioning-lépések: `.claude/skills/db-role-setup/SKILL.md`.

A `getWritePool()` a Prisma-val megegyező `DATABASE_URL`-t használja, de attól **különálló** `pg`
pool — nem a Prisma-kliensen ír. Kizárólag az ingest-script (`packages/core/src/rag/ingest.ts`)
hívja `insertChunks`/`clearKnowledge`-en keresztül; az agent (`askAgent`, `searchKnowledge` tool)
sosem éri el, csak a RO poolt (`getPool()`) — ez tartja meg az NFR1 elvet (docs/architektura.md, 2. döntés) a RAG tudásbázisra is.

### Fontos csapda: `prisma migrate reset` törli a RO-jogokat

A `prisma migrate reset` eldobja és újra létrehozza a teljes `public` sémát — ezzel a
`plantbase_ro` szerepkör `USAGE`/`SELECT` jogai is elvesznek, mert az initdb-script nem fut le
újra egy már létező volume-on. Minden reset után a `db-role-setup` skill 3. lépését (a
`01-readonly-role.sql` kézi újrafuttatása) el kell végezni, különben a `runSql`/`searchKnowledge`
tool minden lekérdezése `permission denied` hibával fut el. Ld. `docs/dev-workflow.md`
"Manuális DB-ellenőrzés és migrációs drift" szakasza.

## pgvector

A `vector` PostgreSQL-kiterjesztés a RAG tudásbázis (`knowledge_chunks` tábla,
`docs/implementation/05-rag-pipeline.md` F2) embedding-oszlopához. A `pgvector/pgvector:0.8.5-pg17`
image tartalmazza; a kiterjesztés engedélyezése (`CREATE EXTENSION vector`) a Prisma migráció
része (`datasource.extensions = [vector]`, `previewFeatures = ["postgresqlExtensions"]` a
`schema.prisma`-ban), nem külön kézi lépés.

## Környezeti változók

- `.env` (repo gyökér, sosem commitolva) — futásidejű változók (`CLAUDE.md`): `DATABASE_URL`,
  `DATABASE_URL_READONLY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY` (F1-től, a
  RAG embedding/rerank hívásokhoz). Sablon: `.env.example`.
- `.env.agent` — Agent/tooling változók (`CLAUDE.md`), sablon: `.env.agent.example`.
