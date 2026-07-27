# Plantbase — core/apps felosztás és adat-elérés

> `ddd-audit` skill tartja karban (`docs/dev-workflow.md`). Első létrehozás: F6
> (`docs/implementation/05-rag-pipeline.md`) — a `searchKnowledge` tool és a `rag/` réteg volt
> az első valódi trigger, de a fájl a **teljes meglévő** `packages/core`/`apps/cli` felosztást
> leírja, nem csak a RAG-deltát. Nagyvonalú kiegészítés a `docs/architektura.md`
> fájlstruktúra-diagramjához és a "Főbb technológiai döntések" szakaszhoz — nem duplikálja azokat.

## `packages/core` — agent-logika, framework/entrypoint-agnosztikus

Nem ismeri a belépési pontokat (`apps/*`); csak `packages/db`-re hivatkozhat (típusok/kliens).

```
packages/core/src/
├── ask-agent.ts          az askAgent (Vercel ai SDK streamText+tool()+stopWhen, G1, MAX_TOOL_ITERATIONS=5)
├── system-prompt.ts      az élő system prompt (SYSTEM_PROMPT konstans) — docs/system-prompt.md szinkronban tartva
├── db-pool.ts            getPool() (RO, DATABASE_URL_READONLY) / getWritePool() (RW, DATABASE_URL)
├── run-sql.ts            runSql tool (products katalógus, read-only SQL)
├── list-categories.ts    listCategories tool (products.category distinct lista)
├── search-knowledge.ts   searchKnowledge tool (F6) — a rag/ réteg orkesztrálását adja tool-ként
├── log-interaction.ts    JSONL naplózás minden interakcióról
└── rag/                  RAG-pipeline (F1-F9, docs/rag-pipeline.md)
    ├── chunk.ts           H2-alapú chunkolás, kontextus-prefix, token-méretezés (F4)
    ├── embed.ts           embedTexts() — OpenAI text-embedding-3-small, ai SDK embedMany (F5)
    ├── knowledge-store.ts searchChunks() (RO pool) / insertChunks(), clearKnowledge() (RW pool) (F2, F5)
    ├── hyde.ts            generateHypotheticalAnswer() — Anthropic generateText a hipotetikus válaszhoz (F6)
    ├── rerank.ts          rerankChunks() — OpenAI generateObject, strukturált 0-10 pontszám (F6)
    └── retrieve.ts        retrieve() — a teljes pipeline: hyde → embed → searchChunks → rerank (F6)
```

**Réteg-szabály:** a `rag/` modulok agent-facing olvasása (`searchChunks`, és ezáltal `retrieve`,
`searchKnowledge`) kizárólag a RO poolon megy (`getPool()`) — ugyanaz az NFR1-elv, mint a
`runSql`-nél (`docs/architektura.md` 2. döntés). Az ingest írása (`insertChunks`, `clearKnowledge`)
egy külön RW poolon fut, és sosem az agent útján hívódik.

## `apps/cli` — CLI belépési pont

`ask` parancs + interaktív mód, mockolt `askAgent`-tel tesztelve a saját rétegén
(`docs/testing-strategy.md`). A `.env` betöltése itt történik, indulás előtt — ezért az
`ask-agent.ts` a modell-providert (`anthropic(...)`) nem modul-szinten, hanem `askAgent()`
hívásonként hozza létre.

## `apps/server` — HTTP belépési pont (G2)

Egyetlen `POST /api/chat` route (`apps/server/src/main.ts`). **Nem** az `askAgent()`-en keresztül
megy — a CLI-vel csak a `packages/core/src/index.ts` építőelemeit osztja meg (tool-definíciók,
`SYSTEM_PROMPT`, `resolveModel`), egy saját, önálló `streamText`-hívást épít belőlük, streamelő
fogyasztással (`result.pipeUIMessageStreamToResponse(res)`). Az env-betöltés (`dotenv`) ugyanúgy a
belépési ponton, indulás előtt történik, mint a CLI-nél (`apps/cli/src/main.ts` mintája) — a
globálisan/CI-ban futtatott szerver-folyamat sem örökli a direnv-et.

Az agent-facing adatelérés a `packages/core`-ból importált tool-okon (`RUN_SQL_TOOL` stb.) keresztül
megy, ugyanúgy, mint a CLI-nél — `apps/server` ide nem nyúl közvetlenül.

**G3-tól**: `apps/server` **közvetlenül** importálja a `@plantbase/db` `prisma` klienst (RW) a
`Thread`/`Message` (webes beszélgetés-történet) perzisztenciájához — ez alkalmazás-adat, nem
agent-facing tudásbázis-olvasás, ezért nem a `runSql`/`searchKnowledge` RO-útján megy (NFR1-elv,
`docs/architektura.md` 2. döntés, itt nem vonatkozik rá). `GET /api/threads`,
`GET /api/threads/:id`: `docs/tech/api.md`.

## `apps/web` — webes chat felület (G4)

`@nx/react:application` generátorral scaffoldolva (bundler: Vite, teszt: Vitest), **nem** kézzel
(eltérés a `scaffold-nx-package` skill "kézi scaffold, ha nincs generátor" elvétől — tudatos,
`06-web-chat.md` 6. döntése: a React+Vite+Tailwind+shadcn/ui kombináció kézi bedrótozása
hibalehetőség-érzékenyebb, mint a hivatalos generátor). A generátor `apps/web/package.json`
"name" mezőjét `"web"`-nek hagyja (nem `@plantbase/web`), mert nincs `project.json` — a Nx
projekt-nevet közvetlenül a package.json `name`-je adja, az átnevezés a `nx serve web` stb.
parancsokat is megváltoztatná; tudatosan meghagyva a generátor alapértelmezettje szerint.

Tailwind v4 (`@tailwindcss/vite` plugin, nincs `tailwind.config.js`) és shadcn/ui (`components.json`,
`src/components/ui/`) hozzáadva a hivatalos "Existing Project" (Vite) folyamat szerint. `@/*`
path-alias `tsconfig.json`/`tsconfig.app.json`-ban és `vite.config.mts`-ben.

Fő komponensek: `Chat` (`src/app/chat.tsx`) — `useChat` (`@ai-sdk/react`) + `DefaultChatTransport` +
`generateId()` (`ai`-ból, új beszélgetés id-jének generálásához, a `POST /api/chat` natív
szerződéséhez, `docs/tech/api.md`); `ToolCallCard` (`src/app/tool-call.tsx`, G5) — összecsukható
kártya a tool-hívások/-eredmények megjelenítésére, az AI SDK `isToolUIPart()`/`ToolUIPart` típusaira
építve (a CLI `--show-prompt` funkcionális megfelelője). "Új chat"/history-sáv G6 dolga, nem ez a
fázis.

**G4 közben talált, valódi függőség-verzió ütközés**: az `@ai-sdk/react` csomag saját verziószámozása
NEM követi az `ai` csomagét — `@ai-sdk/react@4.x` valójában `ai@7.x`-et vár (nem `ai@5.x`-et, ahogy a
számok alapján feltételezhető lenne), ami típusütközést okozott a repo többi részének `ai@^5.0.0`
pinnelésével szemben. A helyes, kompatibilis pár: `@ai-sdk/react@2.x` (ennek van `ai@^5.x` függősége).
Hasonlóan: `eslint-plugin-react` (a generátor `nx.configs['flat/react']`-je hozza be) még a legfrissebb
stabil kiadásában (7.37.5) sem kompatibilis az ESLint 10-zel (peerDependencies csak ^9.7-ig) — a
`react/*` szabályok ezért explicit ki vannak kapcsolva `apps/web/eslint.config.mjs`-ben, amíg a
plugin nem ad ki ESLint 10-kompatibilis verziót; a `react-hooks`/`jsx-a11y` szabályok külön csomagok,
azok változatlanul aktívak.

## `packages/db` — Prisma lib

Séma, migráció, kliens, seed (benne a `prisma/seed/knowledge/*.md` — a 202 vendorolt gondozási
cikk, F3). Nem a repo gyökerében él, hogy a séma az Nx graph része legyen.

Ld. részletesen: `docs/architektura.md` (fájlstruktúra + döntések), `docs/tech/infra.md`
(DB-kapcsolatok, pgvector), `docs/tech/api.md` (tool/CLI felület).
