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
├── ask-agent.ts          az askAgent tool-use loop (Anthropic SDK, MAX_TOOL_ITERATIONS=5)
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
`ask-agent.ts` az `Anthropic` klienst nem modul-szinten, hanem `askAgent()` hívásonként hozza létre.

Később (nem most): `apps/api`, `apps/web` (G rész, `docs/implementation/06-web-chat.md`).

## `packages/db` — Prisma lib

Séma, migráció, kliens, seed (benne a `prisma/seed/knowledge/*.md` — a 202 vendorolt gondozási
cikk, F3). Nem a repo gyökerében él, hogy a séma az Nx graph része legyen.

Ld. részletesen: `docs/architektura.md` (fájlstruktúra + döntések), `docs/tech/infra.md`
(DB-kapcsolatok, pgvector), `docs/tech/api.md` (tool/CLI felület).
