# plantbase

Parancssori (CLI) AI agent egy növény-webshop katalógusához: természetes nyelvű kérdésekre SQL-lel válaszol, read-only adatbázis-kapcsolaton keresztül, SQL-tudás nélkül is használhatóan.

> Kurzus-projekt ("AI-ágensfejlesztés az alapoktól"). A cél nem egy kész termék, hanem egy AI-ügynök felépítése lépésről lépésre, látható, kézzel írt mechanikával — agent-framework nélkül.

## Mi ez?

Egy lakberendező sok időt tölt azzal, hogy a szoba adottságai (fény, méret), az ügyfél igényei és a növény-adatbázis alapján összeállítsa a megfelelő növénycsomagot — webshop-nézegetés, méricskélés, raktárkészlet-ellenőrzés, akció-figyelés. Az adat megvan, de a kinyerése aprómunka és SQL-tudást igényelne.

A `plantbase` erre ad önkiszolgáló, természetes nyelvű felületet: `plantbase ask "<kérdés>"` — az agent LLM-mel SQL-t generál, read-only lefuttatja a `products` katalógus felett, és természetes nyelvű választ ad. Minden interakció naplózva, `--show-prompt`-tal átlátható.

Részletek: [`docs/brs-plantbase.md`](docs/brs-plantbase.md) (üzleti igény, ROI, scope), [`docs/roi.md`](docs/roi.md) (pénzben kifejezett ROI-levezetés egy 5 fős irodára).

## Állapot

Részletes, mindig friss állapot: [`docs/implementation/STATUS.md`](docs/implementation/STATUS.md)
(a `ddd-audit` skill tartja karban minden PR előtt). Röviden: A–E rész kész és mergelve — a
`plantbase ask "<kérdés>"` valódi LLM-hívással SQL-t generál és futtat a `products` katalóguson
(`runSql`), szükség esetén a `listCategories` toolt is használja, UX/DX fejlesztésekkel
(shortcut, kontextus-kezelés, olvashatóbb kimenet), szigorított és finomított `runSql` guarddal
(string-literál-maszkolás, záró pontosvessző kezelése), ask-agent integrationális teszttel.
F rész (RAG, HF3) is kész: a `plantbase ask` gondozási kérdésekre a `searchKnowledge` toollal
(HyDE + rerank pipeline) a 202 vendorolt gondozási cikk chunkolt/embeddelt tudásbázisából válaszol,
forráshivatkozással; golden-set kiértékelés, karbantartási architektúra-terv és költségbecslés is
elkészült — ld. [`docs/rag-pipeline.md`](docs/rag-pipeline.md), [`docs/rag-architektura.md`](docs/rag-architektura.md).
G rész (webes chat felület) is kész: streamelő `apps/server` (Express) + `apps/web` (React,
`useChat`, tool-kártyák, "Új chat"/history-sáv) ugyanazokra a `packages/core`-építőelemekre épül,
mint a CLI, DB-alapú (`Thread`/`Message`) beszélgetés-történettel — ld. "Futtatás és tesztelés".
J rész (HF5, ügyfélirányú PoC) is kész — ld. "Ügyfélirányú PoC (HF5)" lent.

### Költség (RAG)

Valós mért adatból (nem becslés — ld. [`docs/rag-pipeline.md`](docs/rag-pipeline.md#költségbecslés-f9) a módszertanért):

- **Ingest (a teljes tudásbázis vektorizálása, egyszeri)**: 202 cikk → 768 chunk, 218 676 token → **≈$0,0044** (kb. 1,7 Ft).
- **Egy kérdés a teljes pipeline-nal** (HyDE-hívás + embedding + rerank + válasz): **≈$0,0067** (egyszeri `searchKnowledge`-hívással), önreflektáló újrahívással **≈$0,0224**.

Aktuális (2026. júliusi) árazással: Anthropic `claude-haiku-4-5` ($1/$5 per 1M token be-/kimenet), OpenAI `text-embedding-3-small` ($0,02/1M token), OpenAI `gpt-4.1-mini` ($0,40/$1,60 per 1M token).

## Stack

TypeScript (strict), Nx monorepo, pnpm, Node LTS · PostgreSQL (docker-compose, lokális) + Prisma · Vercel AI SDK (`streamText` + `tool()`, G1 óta), Anthropic + OpenAI providerek · Zod · Commander + readline (CLI) · Vitest, ESLint + Prettier

Részletek és a `products` séma: [`docs/stack.md`](docs/stack.md).

## Dokumentáció

| Dokumentum                                                       | Miről szól                                                                          |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`docs/brs-plantbase.md`](docs/brs-plantbase.md)                 | Üzleti igény, megoldás, scope, követelmények, ROI-keret                             |
| [`docs/roi.md`](docs/roi.md)                                     | ROI-levezetés pénzben, 5 fős iroda szintjén                                         |
| [`docs/stack.md`](docs/stack.md)                                 | Tech stack, `products` séma                                                         |
| [`docs/architektura.md`](docs/architektura.md)                   | Tervezett fájlstruktúra, kulcs technológiai döntések                                |
| [`docs/konvenciok.md`](docs/konvenciok.md)                       | Kódkonvenciók (naming, TypeScript, hibakezelés, tesztelés)                          |
| [`docs/testing-strategy.md`](docs/testing-strategy.md)           | Plantbase-specifikus automata tesztelési stratégia (unit/integration/E2E, coverage) |
| [`docs/dev-workflow.md`](docs/dev-workflow.md)                   | Git-szabályok, hookok, dokumentáció-frissítés                                       |
| [`docs/system-prompt.md`](docs/system-prompt.md)                 | Az agent system promptja                                                            |
| [`docs/implementation/STATUS.md`](docs/implementation/STATUS.md) | Implementációs tervek státusz-indexe (kanonikus, innen linkelve minden rész-terv)   |
| [`docs/plugin-valasztasok.md`](docs/plugin-valasztasok.md)       | Marketplace plugin és MCP szerver választások indoklása                             |
| [`docs/rag-pipeline.md`](docs/rag-pipeline.md)                   | RAG chunking-stratégia, golden-set kiértékelés, költségbecslés (F4/F7/F9)           |
| [`docs/rag-architektura.md`](docs/rag-architektura.md)           | RAG karbantartási architektúra-terv (hash-alapú sync, F8)                           |
| [`docs/hf3-megfeleles.md`](docs/hf3-megfeleles.md)               | HF3 megfelelőségi összefoglaló — kereszthivatkozások + eltérések indoklással        |
| [`docs/ddd/glossary.md`](docs/ddd/glossary.md)                   | Ubiquitous language (termék-katalógus + RAG domain fogalmak)                        |
| [`docs/ddd/model.md`](docs/ddd/model.md)                         | Entitások, value objectek, aggregátumok                                             |
| [`docs/tech/infra.md`](docs/tech/infra.md)                       | Postgres/pgvector infra, a két DB-kapcsolat (RO/RW)                                 |
| [`docs/tech/architecture.md`](docs/tech/architecture.md)         | `packages/core`/`apps/cli`/`apps/server`/`apps/web` felosztás, `rag/` réteg         |
| [`docs/tech/api.md`](docs/tech/api.md)                           | Tool/CLI felület + HTTP-felület (`/api/chat`, `/api/threads`)                       |
| [`CLAUDE.md`](CLAUDE.md)                                         | Claude Code-nak szóló projekt-instrukciók                                           |

## Helyi fejlesztői környezet

1. **Postgres elindítása** (OrbStack/Docker):
   ```bash
   docker compose up -d
   ```
2. **Env fájlok**: másold `.env.example` → `.env` és `.env.agent.example` → `.env.agent`, töltsd ki (`ANTHROPIC_API_KEY` is itt kell). Soha ne commitold őket (gitignore-olva vannak).
3. **direnv**: a `.envrc` tölti be az env fájlokat — `.envrc` módosítása után mindig `direnv allow`.
4. **DB read-only szerepkör**: friss (üres) Postgres-volume esetén automatikusan létrejön; már létező volume-on a `db-role-setup` Claude Code skill állítja fel a `plantbase_ro` szerepkört, amin az agent `runSql` toolja kizárólag keresztül futhat (soha nem ír).
5. **MCP szerverek** (`.mcp.json`, project scope): `github`, `context7`, `postgres` (read-only, `postgres-mcp --access-mode=restricted`), `prisma` (`npx prisma mcp`).

## Futtatás és tesztelés

```bash
pnpm install                                          # workspace függőségek
pnpm --filter @plantbase/db exec prisma migrate dev    # séma alkalmazása
pnpm --filter @plantbase/db run db:seed                # ~30 növény betöltése
pnpm --filter @plantbase/core run ingest-knowledge      # 202 gondozási cikk chunkolása + embeddelése

pnpm run plantbase ask "milyen pozsgás növényeitek vannak raktáron?"
# vagy interaktív mód:
pnpm run plantbase
```

A `pnpm run plantbase` (röviden: `pnpm plantbase`) mindig build-eli a CLI-t, mielőtt futtatja — Nx cache miatt változatlan forrás esetén ez szinte azonnali. Alternatívaként, ha nem szeretnéd a shortcut-ot használni:

```bash
pnpm exec nx run cli:build
node dist/apps/cli/main.js ask "<kérdés>"
```

Globális `plantbase` parancsként (egyszeri lépés, utána bárhonnan futtatható):

```bash
cd dist/apps/cli && pnpm add -g .
plantbase ask "<kérdés>"
```

A `--show-prompt` kapcsolóval a teljes üzenet-előzmény (LLM-hívások, tool-hívások, válaszok) is megjelenik — az `ask` parancson (`... ask "<kérdés>" --show-prompt`) és interaktív módban is (`pnpm run plantbase --show-prompt`). Minden interakció naplózva a `logs/` mappába (JSONL, nincs commitolva).

**Webes chat felület** (`apps/server` + `apps/web`, G rész, `docs/implementation/06-web-chat.md`) —
két külön folyamat, párhuzamosan indítva:

```bash
pnpm exec nx serve server   # Express, streamelő /api/chat + /api/threads, alapértelmezett port 3001
pnpm exec nx serve web      # Vite dev-szerver, alapértelmezett port 4200 (nem az 5173-as Vite-alapértelmezett)
```

Ezután a böngészőben a `http://localhost:4200` cím alatt érhető el a chat UI. A `PORT`/`CORS_ORIGIN`
env-változók (`.env.example`) opcionálisak, van kódbeli fallback mindkettőre.

**Ügyfélirányú PoC** (J rész, HF5) — ugyanaz a két folyamat (`nx serve server` + `nx serve
web`), két új útvonallal:

- `http://localhost:4200/customer` — a webshop vásárlóinak szánt chat (nem a
  lakberendezőknek), szűkített tool-készlettel és emberi jóváhagyási ponttal.
- `http://localhost:4200/staff/handoffs` — a staff felülete, ahol a bizonytalan/hatókörön
  kívüli kérdéseket jóváhagyják vagy elutasítják, mielőtt bármi eljutna a vásárlóhoz.

Előfeltétel: a séma migrálva legyen (`prisma migrate dev`), és a `db-role-setup` skill
lefusson (a `docker/postgres/initdb/02-handoff-role.sql` hozza létre az agent szűk,
csak-beszúró adatbázis-jogosultságát). Részletek, a megoldott/nem megoldott fájdalmak
listája és a demó-forgatókönyv: [`docs/hf/hf5/HF5-megoldas.md`](docs/hf/hf5/HF5-megoldas.md).

**RAG golden-set kiértékelés** (reprodukálható, `docs/rag-pipeline.md` "Golden set" szakaszának alapja) — nyers vektorkeresés vs. teljes HyDE+rerank pipeline összevetése a 8 tesztkérdésre, valós DB/API-hívásokkal:

```bash
pnpm --filter @plantbase/core run golden-set
```

Automatikus ellenőrzések (build, típusellenőrzés, teszt, lint minden csomagra):

```bash
pnpm exec nx run-many -t build,typecheck,test,lint
```

> Ez a szakasz a jelenlegi állapotot írja le. Ahogy a rendszer bővül (pl. új csomagok, deploy-lépések, futtatási módok), ezt a részt is bővíteni kell — ne hagyjuk elavulni.

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
├── apps/server     Express szerver, streamelő /api/chat (G2)
├── apps/web        webes chat felület, React + Vite + Tailwind + shadcn/ui (G4)
└── docs/           dokumentáció (ld. fent)
```

Részletek: [`docs/architektura.md`](docs/architektura.md).
