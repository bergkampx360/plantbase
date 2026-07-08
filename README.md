# plantbase

Parancssori (CLI) AI agent egy növény-webshop katalógusához: természetes nyelvű kérdésekre SQL-lel válaszol, read-only adatbázis-kapcsolaton keresztül, SQL-tudás nélkül is használhatóan.

> Kurzus-projekt ("AI-ágensfejlesztés az alapoktól"). A cél nem egy kész termék, hanem egy AI-ügynök felépítése lépésről lépésre, látható, kézzel írt mechanikával — agent-framework nélkül.

## Mi ez?

Egy lakberendező sok időt tölt azzal, hogy a szoba adottságai (fény, méret), az ügyfél igényei és a növény-adatbázis alapján összeállítsa a megfelelő növénycsomagot — webshop-nézegetés, méricskélés, raktárkészlet-ellenőrzés, akció-figyelés. Az adat megvan, de a kinyerése aprómunka és SQL-tudást igényelne.

A `plantbase` erre ad önkiszolgáló, természetes nyelvű felületet: `plantbase ask "<kérdés>"` — az agent LLM-mel SQL-t generál, read-only lefuttatja a `products` katalógus felett, és természetes nyelvű választ ad. Minden interakció naplózva, `--show-prompt`-tal átlátható.

Részletek: [`docs/brs-plantbase.md`](docs/brs-plantbase.md) (üzleti igény, ROI, scope), [`docs/roi.md`](docs/roi.md) (pénzben kifejezett ROI-levezetés egy 5 fős irodára).

## Állapot

A) rész (környezet) kész: az Nx+pnpm workspace fut, `packages/db` Prisma sémával, migrációval és betöltött seed adattal (~30 növény), read-only DB szerepkör (`plantbase_ro`) él, `packages/core` váza létrejött, `apps/cli` elindul és `plantbase` parancsként globálisan elérhető (`plantbase ask "<kérdés>"` — egyelőre válasz nélkül, ez a B) részben kerül bele). A tényleges agent-logika (LLM-hívás, `runSql`) még nem készült el, ez a B) rész 3 fázisában valósul meg (`docs/implementation-plan.md`).

## Stack

TypeScript (strict), Nx monorepo, pnpm, Node LTS · PostgreSQL (docker-compose, lokális) + Prisma · Anthropic SDK, kézzel írt tool-use loop (nincs agent-framework) · Zod · Commander + readline (CLI) · Vitest, ESLint + Prettier

Részletek és a `products` séma: [`docs/stack.md`](docs/stack.md).

## Dokumentáció

| Dokumentum                                       | Miről szól                                                 |
| ------------------------------------------------ | ---------------------------------------------------------- |
| [`docs/brs-plantbase.md`](docs/brs-plantbase.md) | Üzleti igény, megoldás, scope, követelmények, ROI-keret    |
| [`docs/roi.md`](docs/roi.md)                     | ROI-levezetés pénzben, 5 fős iroda szintjén                |
| [`docs/stack.md`](docs/stack.md)                 | Tech stack, `products` séma                                |
| [`docs/architektura.md`](docs/architektura.md)   | Tervezett fájlstruktúra, kulcs technológiai döntések       |
| [`docs/konvenciok.md`](docs/konvenciok.md)       | Kódkonvenciók (naming, TypeScript, hibakezelés, tesztelés) |
| [`docs/dev-workflow.md`](docs/dev-workflow.md)   | Git-szabályok, hookok, dokumentáció-frissítés              |
| [`docs/system-prompt.md`](docs/system-prompt.md) | Az agent system promptja                                   |
| [`CLAUDE.md`](CLAUDE.md)                         | Claude Code-nak szóló projekt-instrukciók                  |

## Helyi fejlesztői környezet

1. **Postgres elindítása** (OrbStack/Docker):
   ```bash
   docker compose up -d
   ```
2. **Env fájlok**: másold `.env.example` → `.env` és `.env.agent.example` → `.env.agent`, töltsd ki. Soha ne commitold őket (gitignore-olva vannak).
3. **direnv**: a `.envrc` tölti be az env fájlokat — `.envrc` módosítása után mindig `direnv allow`.
4. **DB read-only szerepkör**: a `db-role-setup` Claude Code skill állítja fel a `plantbase_ro` szerepkört, amin az agent `runSql` toolja kizárólag keresztül futhat (soha nem ír).
5. **MCP szerverek** (`.mcp.json`, project scope): `github`, `context7`, `postgres` (read-only, `postgres-mcp --access-mode=restricted`), `prisma` (`npx prisma mcp`).

## Fejlesztői workflow

- `main` mindig zöld; közvetlenül nem commitolunk rá.
- Feature branch (`feat/`, `fix/`, `docs/`, ...) → PR → **kizárólag squash merge** (a repo GitHub-beállítása ezt kényszeríti ki).
- Conventional Commits: `<típus>: <leírás>`.
- Részletek: [`docs/dev-workflow.md`](docs/dev-workflow.md), [`CLAUDE.md`](CLAUDE.md).

## Tervezett struktúra

```
plantbase/
├── packages/core   agent-logika (LLM-hívás, runSql tool, séma-kontextus, naplózás)
├── packages/db     Prisma lib (séma, migráció, kliens, seed)
├── apps/cli        CLI (ask parancs + interaktív mód)
└── docs/           dokumentáció (ld. fent)
```

Később (nem most): `apps/api`, `apps/web`. Részletek: [`docs/architektura.md`](docs/architektura.md).
