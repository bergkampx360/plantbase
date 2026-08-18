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
- `docker/postgres/initdb/01-readonly-role.sql` és `docker/postgres/initdb/02-handoff-role.sql`
  a `docker-entrypoint-initdb.d`-be vannak mountolva — **csak friss volume-on futnak le
  automatikusan** (első konténer-indításkor).

## Három DB-kapcsolat, három jog (`docs/architektura.md`, 2. döntés)

| Kapcsolat   | Env var                 | Szerepkör           | Jog                                                        | Ki használja                                                                                                                                                                                                                                                                                  |
| ----------- | ----------------------- | ------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-write  | `DATABASE_URL`          | `plantbase`         | teljes (séma/migráció/seed)                                | Prisma (`packages/db`); F5-től a RAG-ingest RW poolja is (`packages/core/src/infra/db-pool.ts` `getWritePool()`, `packages/core/src/rag/knowledge-store.ts` `insertChunks`/`clearKnowledge`); J1-től `apps/server` a `Thread`/`Message`/`CustomerHandoff.status` írásokhoz (staff jóváhagyás) |
| Read-only   | `DATABASE_URL_READONLY` | `plantbase_ro`      | csak `SELECT`, **`customer_handoffs`-ra kifejezetten nem** | agent `runSql` tool (`packages/core`), F6-tól a `searchKnowledge` tool is                                                                                                                                                                                                                     |
| Insert-only | `DATABASE_URL_HANDOFF`  | `plantbase_handoff` | csak `INSERT` a `customer_handoffs`-ra                     | J1-től (`docs/implementation/09-customer-facing-poc.md`) a `requestHumanHandoff` tool (`packages/core`) — az EGYETLEN hely, ahová a customer-facing agent valaha ír                                                                                                                           |

A `plantbase_ro` szerepkör fizikailag képtelen írni (nem csak app-szinten korlátozott) —
`REVOKE INSERT, UPDATE, DELETE, TRUNCATE` az összes táblán. J1-től emellett a `customer_handoffs`
táblára a `SELECT`-je is explicit `REVOKE`-olva van (`02-handoff-role.sql`), mert a
`plantbase_ro`-t létrehozó `ALTER DEFAULT PRIVILEGES` (nincs explicit `FOR ROLE`) különben
automatikusan SELECT-et adott volna rá minden, a migrációkat futtató role által ezután
létrehozott táblára — a belső, szabad-SQL-es `runSql` tool enélkül olvashatná az ügyfelek
kérdéseit/panaszait. A `plantbase_handoff` szerepkör pedig fizikailag képtelen visszaolvasni,
amit beszúrt — csak `INSERT`-et kapott a `customer_handoffs`-ra (plusz `USAGE`-t az `id`
autoincrement-sequence-én, ami külön grant nélkül a `nextval()`-t is megakadályozná), semmi
mást. A pontos SQL és a provisioning-lépések mindhárom szerepkörre:
`.claude/skills/db-role-setup/SKILL.md`.

A `getWritePool()` a Prisma-val megegyező `DATABASE_URL`-t használja, de attól **különálló** `pg`
pool — nem a Prisma-kliensen ír. Kizárólag az ingest-script (`packages/core/src/rag/ingest.ts`)
hívja `insertChunks`/`clearKnowledge`-en keresztül; az agent (`askAgent`, `searchKnowledge` tool)
sosem éri el, csak a RO poolt (`getPool()`) — ez tartja meg az NFR1 elvet (docs/architektura.md, 2. döntés) a RAG tudásbázisra is. A `getHandoffPool()` (J1) hasonlóan **külön** `pg` pool a
`DATABASE_URL_HANDOFF`-on — kizárólag a `requestHumanHandoff` tool hívja.

### Fontos csapda: `prisma migrate reset` törli a RO/insert-only jogokat

A `prisma migrate reset` eldobja és újra létrehozza a teljes `public` sémát — ezzel mind a
`plantbase_ro`, mind a `plantbase_handoff` szerepkör jogai elvesznek, mert az initdb-scriptek
nem futnak le újra egy már létező volume-on. Minden reset után a `db-role-setup` skill 3. és 3b.
lépését (a `01-readonly-role.sql` és a `02-handoff-role.sql` kézi újrafuttatása, ebben a
sorrendben — a 02-es a 01-es által létrehozott `plantbase_ro`-t módosítja) el kell végezni,
különben a `runSql`/`searchKnowledge`/`requestHumanHandoff` tool minden hívása `permission
denied` hibával fut el. Ld. `docs/dev-workflow.md` "Manuális DB-ellenőrzés és migrációs drift"
szakasza.

## pgvector

A `vector` PostgreSQL-kiterjesztés a RAG tudásbázis (`knowledge_chunks` tábla,
`docs/implementation/05-rag-pipeline.md` F2) embedding-oszlopához. A `pgvector/pgvector:0.8.5-pg17`
image tartalmazza; a kiterjesztés engedélyezése (`CREATE EXTENSION vector`) a Prisma migráció
része (`datasource.extensions = [vector]`, `previewFeatures = ["postgresqlExtensions"]` a
`schema.prisma`-ban), nem külön kézi lépés.

## Környezeti változók

- `.env` (repo gyökér, sosem commitolva) — futásidejű változók (`CLAUDE.md`): `DATABASE_URL`,
  `DATABASE_URL_READONLY`, `DATABASE_URL_HANDOFF` (J1-től), `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, `OPENAI_API_KEY` (F1-től, a RAG embedding/rerank hívásokhoz). Sablon:
  `.env.example`.
- `.env.agent` — Agent/tooling változók (`CLAUDE.md`), sablon: `.env.agent.example`.
