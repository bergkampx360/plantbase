# Plantbase — implementációs terv (proposal)

> Kurzus-melléklet. A `docs/brs-plantbase.md`, `docs/stack.md`, `docs/architektura.md`, `docs/konvenciok.md`, `docs/dev-workflow.md` és `docs/system-prompt.md` alapján összeállított implementációs terv. Minden fázis kicsi, önállóan tesztelhető increment, végén egy commit — utána megállok és kérem a tesztelést, mielőtt a következő fázisra lépnék.

## Git-workflow ehhez a tervhez

**Lezárt döntés:** mind a 12 rész (A1–A7, B1–B5) **külön feature branch → külön commit → külön PR** — nem vonunk össze részeket, a projekt már rögzített szabálya szerint (feature branch → PR → kizárólag squash merge). Lépésenként:

1. Feature branch létrehozása, implementáció, helyi commit.
2. **Megállok, kéred a tesztelést** (ahogy fent is szerepel).
3. A branch **push-olását (és PR nyitását) csak explicit jóváhagyás után végzem** — nem push-olok automatikusan a commit után, még akkor sem, ha a teszt sikeres volt.

## Kontextus és egy tisztázott feltevés

A repo teljes fájlrendszerét és git-történetét átnéztem: **nincs** `packages/`, `apps/`, `package.json`, `nx.json`, `pnpm-workspace.yaml`, seed-fájl, teszt vagy script — sem jelenleg, sem korábban. Csak a `docs/`-ban leírt **specifikáció** létezik (pl. a `products` séma és a "~30 növényes seed, valós fajnevekkel" elvárás a BRS-ben).

Ez alapján a "függőségek/seed/tesztek már megvannak" feltevést úgy oldom fel, hogy a **seed-adatot az A) rész részeként, egyszer hozom létre** a BRS specifikációja szerint (kb. 30 növény, valós fajnevek, reális attribútumok), és utána **fixnek kezelem** — a B) rész egyik fázisa sem generálja újra vagy módosítja.

## Átnézett library-dokumentáció (Context7)

Kódolás előtt minden érintett library aktuális dokumentációját Context7-ből olvastam be, nem memóriából dolgozom:

| Library                                 | Mire használom                                | Amit megerősítettem                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nx (`/websites/nx_dev`)                 | monorepo                                      | `npx create-nx-workspace --template nrwl/typescript-template` (pnpm), `nx g @nx/js:lib packages/X --bundler=tsc --unitTestRunner=vitest`, `nx g @nx/node:application apps/X`                                                                                                                                                                                                                                                                                                                    |
| Prisma (`/websites/prisma_io`)          | `packages/db` (séma+migráció+seed, ld. A2–A3) | Prisma **v7** mintája: `generator client { provider = "prisma-client", output = "../src/generated/prisma" }` (NEM `prisma-client-js`), `prisma.config.ts` a séma/migráció/seed úttal; idempotens seed = **upsert egyedi mezőn** (Prisma doksi: "an upsert operation is idempotent if the target table enforces unique... ensuring only one... created or an existing one updated") — nem `createMany({ skipDuplicates: true })`, mert az nem frissíti a meglévő sorokat, ha a fix lista módosul |
| Commander.js (`/tj/commander.js`)       | `apps/cli`                                    | `program.command().argument().action()` minta, TS/ESM-kompatibilis                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Vitest (`/websites/vitest_dev`)         | tesztek                                       | `.test.ts` fájlnév, natív TS-támogatás, `defineConfig`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| node-postgres (`/brianc/node-postgres`) | `runSql`                                      | `new Pool({ connectionString })`, paraméterezett `pool.query(sql, params)`, hibakezelés                                                                                                                                                                                                                                                                                                                                                                                                         |
| Zod (`/websites/zod_dev`)               | tool-input validáció                          | `z.object(...)`, `.parse()` dobja a hibát érvénytelen inputnál                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| pnpm (`/websites/pnpm_io`)              | `apps/cli` → `plantbase` bin (A6)             | a `pnpm link --global` **megszűnt pnpm v11-ben**; a jelenlegi hivatalos mód helyi csomag binárisának globális regisztrálására: `pnpm add -g .` a csomag könyvtárából, `bin` mező megléte esetén                                                                                                                                                                                                                                                                                                 |

Az Anthropic TypeScript SDK-t (kézi tool-use loop, `client.messages.create`, tool definíció formátum) a `claude-api` skill már ellenőrzött, aktuális dokumentációja alapján tervezem — nem memóriából.

## Rögzített technikai döntések

- **Modell (lezárt döntés, `docs/roi.md` alapján):** alapértelmezetten **`claude-sonnet-5`**. A `docs/roi.md` 5.2-es szakasza kizárólag Haiku 4.5-re ($0,52/hó) és Sonnet 5-re ($1,55/hó) számolt havi API-költséget — mindkettő elhanyagolható a kimutatott haszonhoz képest, tehát a költség nem megkülönböztető szempont. Emiatt a két ténylegesen költségzett modell közül a jobb minőségűt (Sonnet 5) választjuk alapértelmezettnek — ez közel Opus-szintű minőséget ad az NL→SQL fordításhoz és a tool-use loophoz, a Haiku-nál megbízhatóbban. `ANTHROPIC_MODEL` env-változóval felülírható (pl. vissza Haiku 4.5-re, ha valaha mégis a költség válna szemponttá).
- **Csomagnév:** a `packages/db` csomag `package.json`-jában a `name` mező `@plantbase/db` — ezt a nevet használja minden `pnpm --filter` parancs és workspace-import is (lásd A2/A3, korábban ez a terv `pnpm --filter db`-t és `@plantbase/db`-t vegyesen, egymással összeférhetetlenül használta).
- **Tool-use loop:** kézzel írt `while` ciklus (`client.messages.create`), NEM a beta `toolRunner()` helper — ez szándékos, hogy a mechanika látható maradjon (`architektura.md` 3. döntés).
- **`runSql` kapcsolat:** `pg` (`node-postgres`) `Pool`, `DATABASE_URL_READONLY`-val — NEM Prisma Clienten keresztül (Prisma csak `packages/db`-ben, séma/migráció/seedhez; `architektura.md` 2. döntés).

---

# A) rész — a környezet létrehozása

Mérföldkő: fut és tesztelhető a projekt — Nx workspace, `packages/db` sémával+migrációval+seeddel, `packages/core` és `apps/cli` váza, üres CLI elindul.

### A1 — Nx + pnpm workspace scaffold ✅ KÉSZ

- `pnpm`-alapú Nx workspace létrehozása a repo gyökerén (`create-nx-workspace` a `nrwl/typescript-template`-tel, vagy a meglévő gyökér-fájlok mellé illesztve manuálisan: `package.json`, `pnpm-workspace.yaml`, `nx.json`, gyökér `tsconfig.base.json`, ESLint+Prettier).
- Még nincs `packages/`/`apps/` tartalom.

**Teszt:** `pnpm install` hibamentes, `npx nx --version` válaszol, `npx nx graph` üres gráfot mutat.
**Commit:** `chore: scaffold Nx + pnpm workspace`

### A2 — `packages/db`: Prisma séma + migráció ✅ KÉSZ

- **Előfeltétel:** `.env`-ben `DATABASE_URL` kitöltése (jelenleg csak `DATABASE_URL_READONLY` van beállítva) — a `docker-compose.yml` szerint `postgresql://plantbase:plantbase@localhost:5433/plantbase`.
- `nx g @nx/js:lib packages/db --bundler=tsc --unitTestRunner=vitest`, `package.json` `name` mezője **`@plantbase/db`** (ezt a nevet használja minden további `pnpm --filter` parancs és workspace-import, konzisztensen).
- Prisma inicializálás a lib-en belül (`packages/db/prisma/schema.prisma`), a `products` tábla a `docs/stack.md` szerint (minden mező, kategorikus értékkészletek kommentben). **A modell neve `Product`** (PascalCase, egyes szám — `docs/konvenciok.md`: "PascalCase típus/osztály/komponens"), `@@map("products")`-szal a tényleges `products` táblanévre képezve. A Prisma Client accessor emiatt `prisma.product` (egyes szám), NEM `prisma.products`.
- **`latin_name` mezőre `@unique` constraint** — ez teszi lehetővé az A3-ban az idempotens `upsert`-alapú seedelést (a `docs/stack.md` séma-leírása eddig nem jelöl unique mezőt; ezt a terv adja hozzá).
- `generator client { provider = "prisma-client", output = "../src/generated/prisma" }`, `datasource db { provider = "postgresql" }`, `prisma.config.ts` a `DATABASE_URL`-lel.
- `pnpm --filter @plantbase/db exec prisma migrate dev --name init`.
- `package.json` scriptek: `db:generate`, `db:migrate`, `db:studio` (a Prisma pnpm-workspace mintája szerint).
- **README-frissítés tudatosan elhalasztva:** ez a fázis is elavulttá teszi a gyökér `README.md` "Állapot" szakaszát (megjelenik `packages/db`), de a frissítést szándékosan A6 végére halasztjuk, hogy egyben, koherensen írhassuk át az "A) rész mérföldköve" elérésekor (ld. A6).

**Teszt:** a migráció lefut hiba nélkül; `psql "$DATABASE_URL" -c "\d products"` mutatja az összes oszlopot, `latin_name`-en unique indexet is.
**Commit:** `feat: add packages/db with products schema and migration`

### A3 — Seed adat (~30 növény), `packages/db/prisma/seed/` alatt ✅ KÉSZ

A `packages/db` csomagon belül, a séma mellett — **3 fájl**:

```
packages/db/prisma/seed/
├── README.md   mit tartalmaz a mappa, hogyan fut, idempotencia-garancia, "ez a fix lista, nem generáljuk újra"
├── plants.ts   fix, kb. 30 elemű tömb (a Product Prisma-típusnak megfelelő alakban), valós fajnevekkel
└── seed.ts     a plants.ts-t upsert-eli a DB-be a packages/db Prisma Clientjén keresztül
```

Ez konzisztens `docs/architektura.md` 6. döntésével ("A Prisma [séma, migráció, kliens, **seed**] a `packages/db` libben él, NEM a repo gyökerében") és a `scaffold-nx-package` skill ugyanezen elvárásával.

- **`plants.ts`**: kb. 30 sor, valós fajnevekkel (pl. Monstera deliciosa, Sansevieria trifasciata, Ficus lyrata, Chlorophytum comosum, Zamioculcas zamiifolia, Epipremnum aureum, ...), reális ár/méret/gondozási attribútumokkal, a `docs/stack.md` értékkészletei szerint (category, light, watering, difficulty stb. csak a felsorolt értékekből). Ez a **fix, kanonikus lista** — a B) rész egyike sem módosítja vagy generálja újra.
- **`seed.ts`**: a saját csomagján belülről, **relatív importtal** éri el a generált Prisma Clientet (nincs szükség cross-package/workspace-függőségre, mert a seed és a séma ugyanabban a csomagban van) és a `plants.ts` tömböt; minden elemre `prisma.product.upsert({ where: { latin_name: p.latin_name }, update: p, create: p })` (a `Product` modell egyes számú accessora, ld. A2) — így többszöri futtatásra sem jönnek létre duplikátumok, és ha a `plants.ts` tartalma változik, a meglévő sorok frissülnek (nem csak beszúrás — ez a valódi idempotencia, nem csak `skipDuplicates`).
- **`README.md`**: rögzíti, hogy micsoda a mappa (kanonikus seed-adat + a betöltő script), hogyan kell futtatni (`pnpm --filter @plantbase/db run db:seed`), és hogy a `plants.ts` fix lista — módosítás esetén is csak a meglévő fájlt szerkesztjük, nem generálunk másikat mellé.
- `packages/db/prisma.config.ts`-ben `migrations.seed: "tsx prisma/seed/seed.ts"` (csomagon belüli relatív út), plusz egy `packages/db/package.json` script: `"db:seed": "prisma db seed"`.

**Teszt:** `pnpm --filter @plantbase/db run db:seed` kétszer egymás után lefuttatva sem hoz létre duplikátumot; `psql "$DATABASE_URL" -c "SELECT count(*) FROM products;"` → 30; néhány sor kézzel ellenőrizve (reális ár, létező faj).
**Commit:** `feat: add packages/db/prisma/seed with idempotent products seed data (~30 plants)`

### A4 — DB read-only szerepkör ✅ KÉSZ

- **Javítás ugyanebben a commitban:** `.claude/skills/db-role-setup/SKILL.md` 2. lépésében `pnpm --filter db exec prisma migrate dev` → `pnpm --filter @plantbase/db exec prisma migrate dev` — a skill jelenlegi bare `db` filtere nem találná meg az A2-ben `@plantbase/db`-re nevezett csomagot (a `scaffold-nx-package` skill `@plantbase/<name>` konvenciója az irányadó, ehhez igazítjuk a `db-role-setup`-ot).
- A már meglévő **`db-role-setup`** Claude Code skill (a fenti javítással) futtatása: `docker/postgres/initdb/01-readonly-role.sql` létrehozása, `plantbase_ro` szerepkör grantekkel (csak SELECT), alkalmazás a futó konténeren.
- `.env`-ben `DATABASE_URL_READONLY` már be van állítva (ellenőriztem) — csak azt kell megerősíteni, hogy a most létrehozott szerepkörre mutat.

**Teszt:** `psql "$DATABASE_URL_READONLY" -c "SELECT count(*) FROM products;"` sikeres; `psql "$DATABASE_URL_READONLY" -c "INSERT INTO products (name) VALUES ('x');"` → `permission denied`.
**Commit:** `chore: provision read-only DB role for agent access`

### A5 — `packages/core` váz ✅ KÉSZ

- `nx g @nx/js:lib packages/core --bundler=tsc --unitTestRunner=vitest`, `package.json` `name` mezője **`@plantbase/core`** (a `scaffold-nx-package` skill `@plantbase/<name>` konvenciója szerint, ugyanúgy explicit kimondva, mint `@plantbase/db` A2-ben).
- Egyelőre üres, csak egy `index.ts` placeholder export (`export const VERSION = '0.0.0'` vagy hasonló) — a valódi agent-logika a B) részben kerül bele.
- **Placeholder teszt** (`packages/core/src/index.spec.ts`): egy triviális, tényleges assertion (pl. `expect(VERSION).toBe('0.0.0')`) — **nem** `passWithNoTests: true` a configban. A Vitest alapból (`passWithNoTests` default `false`) hibával állna le teszt-fájl nélkül ("no test files found"), tehát enélkül a lenti "Teszt" sor állítása hamis lenne; a valódi teszt-fájl emellett ténylegesen bizonyítja, hogy a harness működik, nem csak feltételezi.
- **README-frissítés tudatosan elhalasztva** (ua. megjegyzés, mint A2-ben): ez a fázis is elavulttá teszi a README "Állapot" szakaszát (megjelenik `packages/core`), de a frissítés A6 végére van halasztva.

**Teszt:** `pnpm nx run core:build` sikeres; `pnpm nx run core:test` **ténylegesen lefut és zöld** (a placeholder teszt miatt, nem csak azért, mert a target létezik).
**Commit:** `chore: scaffold packages/core with placeholder test`

### A6 — `apps/cli` váz (üres CLI elindul, `plantbase` parancsként elérhető) ✅ KÉSZ

- `nx g @nx/node:application apps/cli`, `package.json` `name` mezője **`@plantbase/cli`** (ua. konvenció).
- Commander belőve: `plantbase ask <kérdés>` parancs, ami egyelőre semmit sem csinál a válasszal (pl. `console.log('TODO')`), `--help`/`--version` működik.
- **`plantbase` mint elérhető parancs (ez zárja az előző review 1. pontját):** a belépési fájl (`apps/cli/src/main.ts`) tetejére `#!/usr/bin/env node` shebang; `apps/cli/package.json`-ban `"bin": { "plantbase": "./dist/main.js" }` (a pontos build-kimeneti út az Nx build configjától függ). Build után: `pnpm nx run cli:build`, majd a csomag könyvtárából `pnpm add -g .` — ez regisztrálja a `plantbase` binárist globálisan (a régi `pnpm link --global` **meg lett szüntetve pnpm v11-ben**, a jelenlegi hivatalos módja a `pnpm add -g .`, ezt Context7-ből ellenőriztem). Ettől kezdve `plantbase ask "..."` bárhonnan fut, nem csak `pnpm nx run cli:serve --`-n keresztül.
- **Fontos operatív megjegyzés B1–B3-hoz:** mivel a `bin` a **build kimenetére** mutat (nem a forrásra), minden B1/B2/B3 implementáció után újra kell buildelni (`pnpm nx run cli:build`) a `plantbase` teszteléséhez — a `pnpm add -g .`-t nem kell megismételni, csak az első alkalommal.
- **README.md frissítése** (ez a bullet zárja le a CLAUDE.md "keep README in sync" szabályát A1/A2/A5/A6-ra egyben): a gyökér `README.md` "Állapot" szakasza átírva — workspace kész, `packages/core`+`packages/db` léteznek (séma+migráció+seed betöltve), `apps/cli` váza elindul, `plantbase` parancsként elérhető. A "nincs `packages/`, `apps/`" mondat törlődik.

**Teszt:** `plantbase --help` kiírja a használatot; `plantbase ask "teszt"` lefut hiba nélkül; a README "Állapot" szakasza már nem állítja, hogy nincs `packages/`/`apps/`.
**Commit:** `chore: scaffold apps/cli with Commander skeleton, expose as plantbase binary, update README status`

**A) rész mérföldköve ezzel kész**: workspace fut, DB-séma+seed betöltve, read-only szerepkör él, `packages/core` és `apps/cli` váza létezik, a CLI elindul.

### A7 — Harmadik marketplace plugin (`commit-commands`)

Független a fenti mérföldkőtől — nem gátolja azt, és semmi más rész sem gátolja őt —, de a Part A-hoz tartozik, mert tooling/config-jellegű, nem agent-implementáció.

- `.claude/settings.json` `enabledPlugins` bővítése a már meglévő `pr-review-toolkit@claude-plugins-official` és `typescript-lsp@claude-plugins-official` mellé: `"commit-commands@claude-plugins-official": true`.
- **Indoklás:** hivatalos Anthropic plugin, git commit/push/PR workflow segítő — közvetlenül támogatja a projekt már rögzített "kis, fókuszált commitok, Conventional Commits" szabályát (`docs/dev-workflow.md`, `CLAUDE.md`), amit eddig kézzel tartottunk be. Ezzel meglesz a min. 3 releváns marketplace plugin/skill.

**Teszt:** `jq -e '.enabledPlugins' .claude/settings.json` mind a 3 plugint mutatja.
**Commit:** `feat: enable commit-commands plugin (3rd marketplace plugin)`

---

# B) rész — 5 implementációs fázis (réteg rétegre)

### B1 — CLI echo, LLM nélkül

- `apps/cli`: **közös kezelőfüggvény** (`handleQuestion(question: string): Promise<string>` a `main.ts`-ben) — B1-ben ez még csak echo (pl. `Ezt mondtad: "<kérdés>"`), DE ezt hívja mind az `ask <kérdés>` parancs, MIND az interaktív mód (`node:readline`) minden beolvasott sora. Ez a közös pont szándékos: így B2-től nem kell külön-külön bekötni a két felületet — egy helyen frissítve mindkettő automatikusan ugyanazt a képességet kapja (`docs/brs-plantbase.md` FR1: az `ask` parancs és az interaktív mód ugyanannak a képességnek két bejárata, nem két külön funkció). Az interaktív mód `exit`-re kilép.
- **Interaktív mód indítási mechanizmusa (Commander-specifikus, Context7-vel ellenőrizve):** a Commander alapból **súgót ír ki**, ha egy programnak subcommandjai vannak (itt: `ask`) és nem kap subcommandot — NEM esik át automatikusan egy egyéni fallback-kezelőre. A régi `.command('*')` deprecate-elt minta helyett explicit `process.argv.length <= 2` ellenőrzés kerül `program.parse()` **elé** a `main.ts`-ben: ha nincs semmilyen argumentum, elindul az interaktív readline loop (soronként `handleQuestion`-t hívva) `program.parse()` meghívása nélkül; egyébként a Commander a szokásos módon dolgozza fel az `ask` subcommandot (ami szintén `handleQuestion`-t hívja).
- Még nincs `packages/core` bevonva, nincs LLM-hívás, nincs DB.

**Teszt** (`pnpm nx run cli:build` után, ld. A6 megjegyzés): `plantbase ask "szia"` → visszaírja; interaktív mód: több sor be/ki, `exit` kilép.
**Commit:** `feat: CLI echo without LLM (Phase 1)`
→ **megállok, kérem a tesztelést.**

### B2 — LLM, adatbázis nélkül

- `packages/core`: **`askAgent(question: string): Promise<AskResult>`**, NEM egyszerű `Promise<string>` (ld. korábbi review: az FR5 `--show-prompt` csak akkor valósítható meg, ha a teljes üzenet-tömb is visszajut a hívóhoz, nem csak a végső válasz szövege):
  ```ts
  type AskResult = {
    answer: string;
    messages: MessageParam[]; // teljes csere — ezt írja ki a --show-prompt (B3, FR5)
    tokenUsage: { inputTokens: number; outputTokens: number };
  };
  ```
  Egyetlen Anthropic API-hívás (`client.messages.create`, nincs `tools`), egy leegyszerűsített system prompttal: a `docs/system-prompt.md` `<role>`-ja, DE explicit kiegészítve azzal, hogy **jelenleg nincs adatbázis-hozzáférése**, és ha konkrét termék/ár/készlet-adatra kérdeznek, ezt őszintén mondja meg, ne találjon ki adatot.
- `apps/cli`: a B1-ben bevezetett **közös `handleQuestion`** mostantól `askAgent`-et hívja az echo helyett, és a válaszból csak `result.answer`-t írja ki — mivel `handleQuestion` közös, ez **egyszerre** frissíti az `ask` parancsot ÉS az interaktív mód minden sorát (nincs külön bekötés a két felülethez, ahogy B1 is előkészítette). A `--show-prompt` CLI-flag még nincs bekötve — az B3-ban jön, de az `AskResult` alak már most tartalmazza, amire szükség lesz hozzá.
- Alap naplózás bevezetése (`logs/<timestamp>.jsonl`): system prompt, **a teljes `AskResult.messages` tömb** (nem csak a user kérdés szövege — ez a `docs/brs-plantbase.md` FR4 "üzenetek" [többes szám] mezőjének felel meg, és ez teszi lehetővé, hogy B4-től bármelyik tool, pl. `listCategories`, hívása is automatikusan bekerüljön a logba), `answer`, `tokenUsage` (FR4 kezdete).
- **`.gitignore` bővítése:** `logs/` felvétele (jelenleg csak `.env` és `.env.agent` van kizárva) — a JSONL-fájlok futásidejű, felhasználói kérdéseket/válaszokat tartalmazó artifactok, nem szabad, hogy véletlenül bekerüljenek a repóba.

**Teszt** (`pnpm nx run cli:build` után): általános kérdésre (`plantbase ask "mi a fotoszintézis?"`) valódi LLM-válasz jön; adatra vonatkozó kérdésre (`plantbase ask "mennyibe kerül egy pozsgás növény?"`) az agent egyértelműen jelzi, hogy nincs adatbázis-hozzáférése; **interaktív módban ugyanez** (nem csak echo) — legalább egy kört ellenőrzünk ott is, hogy a közös `handleQuestion` valóban mindkét felületet frissítette.
**Commit:** `feat: wire CLI to LLM without DB access (Phase 2)`
→ **megállok, kérem a tesztelést.**

### B3 — SQL-es interakció (`runSql` tool)

- `packages/core`: `runSql(query: string)` — a tool-hívásból érkező inputot (rendszer-határ, megbízhatatlan LLM-kimenet) egy Zod séma validálja először (`z.object({ query: z.string().min(1) }).parse(input)`, `docs/konvenciok.md`: "Validáció a rendszer-határokon (Zod), fail-fast"), majd egy egyszerű `SELECT`-only guard ellenőrzi a query string elejét, végül `pg.Pool` fut a `DATABASE_URL_READONLY`-val, paraméterezett futtatással.
- `askAgent` kibővítve a teljes kézzel írt tool-use loop-ra: a `docs/system-prompt.md` teljes promptja, `runSql` tool-definícióval, `while` ciklus `tool_use` → `runSql` → `tool_result` → újra hívás → végleges válasz. Az `AskResult` (B2) egy `generatedSql?: string` mezővel bővül (kényelmi kivonat a `messages`-ből, a JSONL loghoz — maga a SQL a `messages` tömb `tool_use` blokkjában is megtalálható, de a FR4 explicit külön mezőt kér).
- Naplózás kibővítve: `generatedSql` + a `runSql` eredménye is bekerül a JSONL logba (FR4 vége).
- **`--show-prompt` flag hozzáadása a CLI-n** (Commander `.option('--show-prompt', ...)` az `ask` parancson, FR5): ha be van kapcsolva, `apps/cli` `result.answer` mellett `result.messages`-t is kiírja (formázva/JSON-ként) — ez az a pont, ahol a B2-ben bővített `askAgent` visszatérési típus ténylegesen kihasználásra kerül.

**Teszt** (`pnpm nx run cli:build` után): `plantbase ask "melyik a 3 legolcsóbb pozsgás növény raktáron?"` → valódi SQL fut a katalóguson, helyes, természetes nyelvű válasz jön; próbaképp egy írási kísérletre célzó kérdés (pl. "töröld ki az összes növényt") az agent visszautasítja / a `runSql` guard blokkolja.
**Commit:** `feat: bind runSql tool for real NL-to-SQL answers (Phase 3)`
→ **megállok, kérem a tesztelést.**

### B4 — `listCategories` saját tool

- `packages/core`: **`listCategories()`** — önálló tool, NEM `runSql` wrapper. Saját Zod séma: `z.object({})` (nincs input paraméter, tehát nincs LLM-kontrollált bemenet, nincs injection-felület, nincs szükség a `runSql`-nél használt `SELECT`-only guardra). Fix, hardcode-olt lekérdezés: `SELECT DISTINCT category FROM products ORDER BY category`, ugyanazon a `pg.Pool`-on (`DATABASE_URL_READONLY`) keresztül, amit B3 már felállított.
- `askAgent` tool-use loopja mostantól **két** toolt lát: `runSql` és `listCategories` — a modell választ közülük a kérdés alapján.
- `docs/system-prompt.md` `<tools>` szekciója kiegészül (mechanikus dokumentáció-frissítés, nem minőségi javítás — az B5-ben jön): `listCategories(): az elérhető kategóriák listája, paraméter nélkül.`
- Naplózás: a `listCategories` hívások is a meglévő `messages`-alapú mechanizmuson keresztül kerülnek a JSONL logba (a `tool_use`/`tool_result` blokkok automatikusan benne vannak) — a B3-ban bevezetett `generatedSql` mező csak `runSql`-nél töltődik ki, `listCategories`-nél `undefined` marad (nincs LLM-generált SQL, a query fix).

**Teszt** (`pnpm nx run cli:build` után): `plantbase ask "milyen kategóriák érhetők el?"` → valódi kategória-lista jön a DB-ből, nem kitalált érték; `--show-prompt`-tal látszik a `listCategories` `tool_use` blokk a `messages`-ben.
**Commit:** `feat: add listCategories tool bound into askAgent (Phase 4)`
→ **megállok, kérem a tesztelést.**

### B5 — System prompt minőségi javítása

`docs/system-prompt.md` tartalmi (nem csak mechanikus) módosítása, indoklással:

1. **`<examples>` tag hozzáadása** — 2-3 konkrét NL-kérdés → SQL példa (pl. _"Milyen pozsgás növényeim vannak raktáron 5000 Ft alatt?"_ → megfelelő `SELECT` `ILIKE`+`COALESCE`+`stock > 0`+`LIMIT` mintával). **Indoklás:** `docs/konvenciok.md` explicit ajánlja ezt a taget az XML-struktúrához ("role, schema, rules, **examples**, question"), a jelenlegi system-prompt.md-ből ez hiányzik — a few-shot példák a gyakorlatban csökkentik a hallucináció/rossz SQL esélyét.
2. **`<rules>`/`<behavior>` kiegészítése:** "Ha a kérdésben szereplő kategória (vagy más kategorikus érték) nem egyezik egyértelműen egy ismert értékkel, ELŐBB hívd meg a `listCategories` toolt, mielőtt találgatnál vagy `ILIKE`-kal közelítenél." **Indoklás:** a B4-ben bevezetett `listCategories` tool pont ezt a bizonytalanságot hivatott kiváltani — enélkül a szabály nélkül a modell nem feltétlenül használná a toolt, és találgatna vagy hibás `ILIKE` mintát építene.
3. **`<tools>` szekció véglegesítése** a `listCategories` bejegyzéssel (ha B4 mechanikus lépése után még finomítani kell a leírást).

A commit/PR leírás tartalmazza a fenti indoklást explicit (nem csak a diffet).

**Teszt:** `plantbase ask "vannak szukkulenseik?"` (elgépelt/idegen szóval, nem pontosan "pozsgás") → az agent a `listCategories`-t hívja meg találgatás helyett, majd a legközelebbi valós kategóriára tereli a választ.
**Commit:** `docs: improve system-prompt.md quality (examples + ambiguous-category guidance)`
→ **megállok, kérem a tesztelést.**

---

## Kimarad (későbbi óra, NEM most)

`apps/api`, `apps/web`, több felhasználó/jogosultságkezelés, CI/CD, a `ddd-audit` skill futtatása a `/docs` szinkronban tartására — mind `docs/architektura.md` és `docs/dev-workflow.md` szerint későbbre van ütemezve.

## Lezárt döntések (korábbi nyitott kérdések)

1. **Seed-adat feloldása:** jóváhagyva — A3-ban egyszer legenerálom a BRS specifikációja szerint, utána fixnek kezelem (ld. "Kontextus" fent).
2. **Modellválasztás:** `docs/roi.md` alapján lezárva — alapértelmezett modell `claude-sonnet-5` (ld. "Rögzített technikai döntések" szakasz fent).
3. **Commit/PR-granularitás:** jóváhagyva — mind a 12 rész (A1–A7, B1–B5) külön commit **és** külön PR (ld. "Git-workflow" szakasz fent).

## A kurzus-követelmények lefedettsége

| Követelmény                                                | Lefedve?                                       |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `listCategories` saját tool, `askAgent`-be kötve           | ✅ B4                                          |
| Rendszeres, kis, fókuszált commitok (Conventional Commits) | ✅ "Git-workflow" szakasz + eddigi PR-történet |
| Min. 3 releváns marketplace plugin/skill                   | ✅ A7 (a meglévő 2 + `commit-commands`)        |
| ROI-levezetés pénzben, `docs/roi.md`                       | ✅ már elkészült, mergelve (PR #6)             |
| System prompt minőségi javítása, indoklással               | ✅ B5                                          |

Nincs több nyitott kérdés — implementáció kezdhető A1-gyel.
