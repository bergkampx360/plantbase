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
├── index.ts               a csomag publikus felülete (askAgent, MAX_TOOL_ITERATIONS, resolveModel,
│                           RUN_SQL_TOOL, LIST_CATEGORIES_TOOL, SEARCH_KNOWLEDGE_TOOL, SYSTEM_PROMPT)
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
    ├── retrieve.ts        retrieve() — a teljes pipeline: hyde → embed → searchChunks → rerank (F6)
    ├── ingest.ts           egyszeri szkript (pnpm run ingest-knowledge) — a 202 gondozási cikk
    │                       chunkolása+embeddelése a RW poolon, sosem az agent útján fut (F5)
    └── golden-set.ts       egyszeri kiértékelő szkript — nyers keresés vs. HyDE+rerank pipeline
                            összevetése a golden-set kérdéseken (F7, docs/rag-pipeline.md)
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

Fő komponensek: `App` (`src/app/app.tsx`, G6) — az `activeThreadId`/`initialMessages`/`refreshKey`
állapot gazdája, összefogja a `ThreadSidebar`-t és a `Chat`-et; `Chat` (`src/app/chat.tsx`) —
kontrollált komponens (`id`/`initialMessages`/`onFinish` propok, G6-tól — korábban maga generálta
a `chatId`-t belül), `useChat` (`@ai-sdk/react`) + `DefaultChatTransport`; `ThreadSidebar`
(`src/app/thread-sidebar.tsx`, ÚJ, G6) — `GET /api/threads` lekérdezése, "Új chat" gomb, kattintható
szál-lista dátummal (nincs cím/preview-mező a `Thread`-modellben, ld. `docs/tech/api.md`);
`ToolCallCard` (`src/app/tool-call.tsx`, G5) — összecsukható kártya a tool-hívások/-eredmények
megjelenítésére, az AI SDK `isToolUIPart()`/`ToolUIPart` típusaira építve (a CLI `--show-prompt`
funkcionális megfelelője).

**Szál-váltás mintája (G6, Context7-vel megerősítve)**: a `Chat` `key={activeThreadId}` alapján
remountol váltáskor — nem a `useChat` belső, hook-élettartamon belüli id-cache-ére hagyatkozunk,
mert az egy, a kliensben még nem látott (de a szerveren már létező) szálra váltásnál nem töltené be
automatikusan a korábbi kört; a szülő (`App`) explicit lekérdezi `GET /api/threads/:id`-t, és a
kapott üzeneteket `initialMessages`-ként adja át az újonnan mountolt `Chat`-nek.

**`ai-elements` (Vercel hivatalos, shadcn/ui-alapú komponens-könyvtár, H1-től)**: a `Conversation`/
`ConversationContent` (`src/components/ai-elements/conversation.tsx`) csomagolja az üzenetlistát —
belül a `use-stick-to-bottom`-ot használja, csak akkor követi automatikusan az új tartalmat, ha a
felhasználó már amúgy is a lista alján volt. Telepítés: `npx ai-elements@latest add conversation`,
**az `apps/web` könyvtárból futtatva**, nem a repo-gyökérből (a monorepo-gyökérről futtatva a
shadcn CLI elutasítja, `-c apps/web`-fel sem ismeri fel helyesen a workspace-et — ez egy valódi,
H1-nél talált részlet, nem csak feltételezés). A dokumentáció "Next.js projekt"-et ír elő
előfeltételként, de a tényleges telepítő a már működő shadcn/ui CLI-re épül — H1-nél élesben
kipróbálva, ténylegesen működik ebben a Vite-projektben is, semmilyen Next.js-specifikus
függőséget nem hoz be (csak a `use-stick-to-bottom`-ot).

A `Message`/`MessageContent`/`MessageResponse` (`src/components/ai-elements/message.tsx`, H2-től)
a végleges buborék-szerkezetet és a Markdown-renderelést adja: `MessageResponse` a `Streamdown`-t
(streamelés-biztos Markdown-parser) csomagolja, a fél-kész/nem lezárt markdown-szintaxist is
korrekt kezeli menet közben. **Tudatosan testreszabva, mert ez a fájl a telepítés után a saját
kódbázisunk része**: (1) az `ai-elements` alapértelmezett `cjk`/`code`/`math`/`mermaid`
Streamdown-pluginjai (shiki minden nyelvhez, katex, mermaid+cytoscape) eltávolítva — egy magyar
növénygondozási chatnek nincs rájuk szüksége, a bundle méretét viszont ~1,47 MB-ról ~874 KB-ra
(258 KB gzip) csökkentette; (2) a `MessageContent` alapértelmezett stílusa csak a user-üzeneteknek
ad hátteres buborékot, az asszisztensnek nem (ChatGPT-stílusú, aszimmetrikus design) — visszaállítva
a plantbase eredeti, szimmetrikus buborék-dizájnjára (`bg-primary`/`bg-muted`), mert a felhasználó
ezt jelezte kézi teszteléskor hiányként.

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
