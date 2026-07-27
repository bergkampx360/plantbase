# Plantbase — automata tesztelési stratégia

> Kurzus-melléklet. A `docs/konvenciok.md` "Tesztelés" szakasza **projekt-független** elveket ír le
> (TDD, unit/integration/E2E szintek, 80%+ lefedettségi cél). Ez a fájl teszi ezt
> **plantbase-specifikussá és operatívvá**: mit jelent itt konkrétan egy-egy szint, mikor kötelező
> teszt, és mi a coverage-cél jelenlegi (nem teljes) kikényszerítettségi állapota.

## Teszt-piramis, plantbase-ben konkrétan

- **Unit** (`packages/core`, később `apps/cli`) — az alapértelmezett, minden új logikánál elvárt
  szint. Minden külső függőség mockolva: `vi.mock('./db-pool')` a Postgres-hez, `vi.mock('ai')`
  (+ a megfelelő `@ai-sdk/*` provider) az LLM-hívásokhoz (G1 óta az `askAgent` is ezen megy, ld.
  lent). Nincs valódi hálózati/DB hívás.
- **Integration** — valódi, futó Postgres (docker-compose) ellen: pl. migráció+seed idempotencia
  (`packages/db`), a read-only szerepkör tényleges write-tiltása. Ma ez csak a `db-role-setup` skill
  kézi `psql` lépéseként létezik, nincs automatizálva — ez tudatos, dokumentált állapot, nem
  felejtés (ld. "Kimarad" lent).
- **E2E** — a `plantbase` bináris tényleges elindítása (build + spawn), csak kritikus flow-ra
  (`konvenciok.md` elve). Ma egy sincs — ez a legritkábban elvárt szint, nem blokkoló hiány.

## Réteg-elvárások (mikor KÖTELEZŐ teszt)

- **`packages/core`**: minden új tool / minden `askAgent`-ág (siker, hiba, több-tool iteráció) unit
  teszttel érkezik **ugyanabban a fázisban/PR-ban**, nem utólag pótolva. (Ez a jelenlegi E3 fázis
  — `docs/implementation/04-runsql-guard-refinements.md` — nyitott adósságát fogalmazza meg
  szabállyá a jövőre nézve: az `askAgent` maga már B3 óta él, de tesztje csak E3-ban készül el.)
- **Egyszeri, valós API/DB-hívást végző adat- és kiértékelő szkriptek** (`rag/ingest.ts`, F5;
  `rag/golden-set.ts`, F7) **kivétel a fenti szabály alól**: nincs saját `.spec.ts`-jük — a bennük
  hívott épületkövek (`chunkArticle`, `embedTexts`, `insertChunks`, `searchChunks`,
  `rerankChunks` stb.) már önmagukban unit tesztelt, a szkript saját szekvenciáját pedig a valós
  futtatás (és a PR-leírásba/docs-ba kerülő, tényleges kimenet) ellenőrzi, nem egy mockolt vitest
  spec. Ez eddig csak az `ingest.ts`-nél volt hallgatólagos gyakorlat; a `golden-set.ts` második
  előfordulásként mintává emeli, innentől explicit szabály, nem esetleges kivétel.
- **`packages/db`**: séma/migráció-változásnál legalább egy integration teszt VAGY a
  `db-role-setup` skill futtatásának eredménye dokumentálva a PR leírásban.
- **`apps/cli`**: minden CLI-szintű viselkedés-változás (flag, output-formázás, interaktív mód)
  unit teszttel a saját rétegén, mockolt `askAgent`-tel. Ma nulla lefedettség (nincs
  `apps/cli/vitest.config.mts`, így Nx sem generál `test` targetet ide) — ez az elsődleges, explicit
  néven nevezett adósság (`apps/server`/`apps/web`-től eltérően, ld. lent, ahol G7 pótolta).
- **`apps/server`**: minden route (`GET /api/threads(/:id)`, `POST /api/chat`) unit/integration
  teszttel, `supertest`-tel az Express `app`-példányra (G7-től, `apps/server/src/app.spec.ts`).
- **`apps/web`**: minden komponens, aminek van elágazó renderelési/interakciós logikája (nem a
  puszta smoke-teszt szintjén) — `Vitest` + `@testing-library/react` (G7-től, ld. lent).

## Coverage-cél és a kikényszerítés jelenlegi állapota

A `konvenciok.md`-ben rögzített **80%+** irányszám marad érvényben. Itt explicit kimondva: ez
**jelenleg nem technikailag kikényszerített** — egyik `vitest.config.mts`-ben sincs
`coverage.thresholds` bekötve. Tudatos, dokumentált adósság, amit egy külön, ezt a stratégiát
követő kód-PR zár le (ld. "Kimarad" lent) — nem hallgatólagos hiány.

## Mikor kell lefuttatni (kapuk)

- **`Edit` után automatikusan**: a `vitest related` hook (`docs/dev-workflow.md`) minden
  szerkesztésnél lefut.
- **Minden PR push előtt**: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld. Ez eddig is
  gyakorlat volt minden implementation-plan fázisnál, itt explicit szabállyá emelve.
- **CI (GitHub Actions)**: tudatosan később (4. óra, `docs/dev-workflow.md`) — itt megismételve,
  hogy ez ütemezett, nem elfelejtett hiány.

## Mockolási konvenció

A meglévő minta (`run-sql.spec.ts`, `list-categories.spec.ts`) a rögzített konvenció:

- `vi.mock('./db-pool')` minden DB-függő unit teszthez (mindkét exportált függvényt,
  `getPool`-t ÉS `getWritePool`-t is mockolni kell, ha a tesztelt modul bármelyiket használja —
  ld. `packages/core/src/rag/knowledge-store.spec.ts`, F5).
- `vi.mock('ai')` + `vi.mock('@ai-sdk/openai')` az AI SDK-alapú RAG-hívásokhoz (F5-től:
  `embedMany`/`embedTexts`, ld. `packages/core/src/rag/embed.spec.ts`; F6-tól: `generateObject`/
  `rerankChunks`, ld. `packages/core/src/rag/rerank.spec.ts`) — a mock-factory-n belüli top-level
  `vi.fn()` változókat `vi.hoisted()`-del kell deklarálni, különben a vitest-hoisting miatt
  "Cannot access before initialization" hibát dob.
- `vi.mock('ai')` + `vi.mock('@ai-sdk/anthropic')` a HyDE-generáláshoz (F6-tól: `generateText`/
  `generateHypotheticalAnswer`, ld. `packages/core/src/rag/hyde.spec.ts`).
- `vi.mock('ai')` (a `streamText`, `tool`, `stepCountIs` exportokra) + `vi.mock('@ai-sdk/anthropic')`
  az `askAgent`-hez (G1-től, `packages/core/src/ask-agent.spec.ts`) — **nem** kellett az `ai/test`
  csomag `MockLanguageModelV2`-jét bevezetni (a G-terv ezt még nyitott kérdésként hagyta): a
  meglévő, közvetlen `vi.mock('ai', () => ({ streamText: mockFn, ... }))` minta — ugyanaz a család,
  mint a fenti két pontnál — egyszerűen kiterjed `streamText`-re, a `tool()` pedig identitás-
  mockként (`vi.fn((config) => config)`) elég, mert a teszt a `streamText`-nek átadott
  argumentumokat és a mockolt visszatérési értéket (`text`/`totalUsage`/`response`/`steps`)
  ellenőrzi, nem az AI SDK belső tool-végrehajtását.
- Determinisztikus, izolált tesztek — nincs külső/globális állapot- vagy időzítés-függés
  (`konvenciok.md` elve, itt plantbase-specifikus példával).
- **`vi.mock('@plantbase/db')` a Prisma klienshez** (G7-től, `apps/server/src/app.spec.ts`) — új
  minta, mert a meglévő `db-pool`-mock egy MÁSIK modult takar (nyers `pg.Pool`, agent-facing
  RO-olvasás), nem a Prisma klienst. A mock-factory `thread`/`message` modellenként külön
  `vi.fn()`-t ad minden használt metódushoz (`findMany`, `findUnique`, `create`, `update`),
  `vi.hoisted()`-del deklarálva.
- **`supertest` az Express-route-tesztekhez** (G7-től) — `request(app)` közvetlenül az Express
  `app`-példányra megy, `app.listen()` nélkül (Context7-vel megerősítve: a supertest saját maga
  kezeli a szerver-életciklust). Ez megkövetelte az `apps/server/src/main.ts` szétválasztását
  `app.ts`-re (az Express-app felépítése, export, `.listen()` NÉLKÜL) és egy vékony `main.ts`-re
  (`.env` betöltés + `app.listen(...)`) — enélkül egy teszt-import valódi portot nyitott volna.
- **`apps/web` komponens-tesztek**: `Chat`/`ThreadSidebar` moduljai belekódolt API-URL-eket
  használnak (nincs dependency injection), ezért a tesztek globális `fetch`-stubot
  (`vi.stubGlobal('fetch', ...)`, `afterEach`-ben `vi.unstubAllGlobals()`) és/vagy
  `vi.mock('@ai-sdk/react')`-ot (a `useChat` hookhoz) használnak, valós hálózati hívás nélkül.
  `@testing-library/jest-dom` (`import '@testing-library/jest-dom/vitest'`, `vitest-setup.ts` a
  `vite.config.mts` `test.setupFiles`-ában) és `@testing-library/user-event` hozzáadva (G7).

## "Tesztileg kész" kritérium a fázis-státuszhoz

Egy `docs/implementation/NN-*.md` fázis csak akkor jelölhető **✅ Kész**
(`docs/implementation/STATUS.md`), ha az általa érintett logikához tartozó tesztek is megvannak és
zöldek — nem elég, hogy a kód fut.

## Kimarad (tudatosan, ebben a körben NEM)

- `coverage.thresholds` tényleges beállítása a `vitest.config.mts`-ekben.
- `apps/cli/vitest.config.mts` létrehozása és az első CLI-szintű tesztek megírása.
- Automatizált integration-teszt a read-only DB-szerepkörre (ma kézi `db-role-setup` lépés).
- CI (GitHub Actions) — már korábban is "4. órára" ütemezve, ez a döntés nem változik.

Ezek egy külön, jövőbeli kód-PR-ban valósulnak meg, amit ez a stratégia mint elfogadott terv fog
majd vezetni.
