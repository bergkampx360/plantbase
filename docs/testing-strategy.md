# Plantbase — automata tesztelési stratégia

> Kurzus-melléklet. A `docs/konvenciok.md` "Tesztelés" szakasza **projekt-független** elveket ír le
> (TDD, unit/integration/E2E szintek, 80%+ lefedettségi cél). Ez a fájl teszi ezt
> **plantbase-specifikussá és operatívvá**: mit jelent itt konkrétan egy-egy szint, mikor kötelező
> teszt, és mi a coverage-cél jelenlegi (nem teljes) kikényszerítettségi állapota.

## Teszt-piramis, plantbase-ben konkrétan

- **Unit** (`packages/core`, később `apps/cli`) — az alapértelmezett, minden új logikánál elvárt
  szint. Minden külső függőség mockolva: `vi.mock('./db-pool')` a Postgres-hez,
  `vi.mock('@anthropic-ai/sdk')` az LLM-hívásokhoz. Nincs valódi hálózati/DB hívás.
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
- **`packages/db`**: séma/migráció-változásnál legalább egy integration teszt VAGY a
  `db-role-setup` skill futtatásának eredménye dokumentálva a PR leírásban.
- **`apps/cli`**: minden CLI-szintű viselkedés-változás (flag, output-formázás, interaktív mód)
  unit teszttel a saját rétegén, mockolt `askAgent`-tel. Ma nulla lefedettség (nincs
  `apps/cli/vitest.config.mts`, így Nx sem generál `test` targetet ide) — ez az elsődleges, explicit
  néven nevezett adósság.

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

- `vi.mock('./db-pool')` minden DB-függő unit teszthez.
- `vi.mock('@anthropic-ai/sdk')` minden LLM-függő unit teszthez (szükséges lesz E3-hoz és minden
  jövőbeli `askAgent`-tesztez).
- Determinisztikus, izolált tesztek — nincs külső/globális állapot- vagy időzítés-függés
  (`konvenciok.md` elve, itt plantbase-specifikus példával).

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
