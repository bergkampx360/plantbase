# Plantbase — tool/CLI felület

> `ddd-audit` skill tartja karban (`docs/dev-workflow.md`). Első létrehozás: F6
> (`docs/implementation/05-rag-pipeline.md`) — a `searchKnowledge` tool volt az első valódi
> trigger, de a fájl a **teljes meglévő** felületet leírja (`ask`, `runSql`, `listCategories`),
> nem csak az új toolt.

## CLI: `ask`

`plantbase ask "<kérdés>"` — egy kérdés elküldése az `askAgent`-nek, a végső válasz kiírása.
`--show-prompt` flag: a teljes system prompt + üzenet-history kiírása (átláthatóság,
`docs/architektura.md` 4. döntés). Interaktív mód: history megtartása több kérdés között.

## Agent tool-ok (`askAgent`, `packages/core/src/ask-agent.ts`)

Mindhárom tool ugyanazt a shape-et követi: egy zod input-schema a runtime validáláshoz + egy
párhuzamos, kézzel írt raw `input_schema` objektum az Anthropic API-nak (nincs zod-to-json-schema
konverzió a kódban).

### `runSql(query: string)`

Read-only SQL futtatása a `products` katalóguson (`packages/core/src/run-sql.ts`), a RO poolon
(`getPool()`, `DATABASE_URL_READONLY`). Csak `SELECT` engedélyezett; tiltott kulcsszavak,
többszörös statement és nem-SELECT parancsok elutasítva (`docs/implementation/03-…`,
`04-runsql-guard-refinements.md`). A generált SQL-t az `askAgent` a JSONL logba is kimenti
(`generatedSql` mező).

### `listCategories()`

Az elérhető `products.category` értékek disztinkt listája, paraméter nélkül
(`packages/core/src/list-categories.ts`). A system prompt szabálya szerint mielőtt egy
kategorikus mezőre (category, location, light, watering, difficulty) az agent ILIKE-kal
találgatna, ezt hívja meg.

### `searchKnowledge(query: string)` (F6)

Növénygondozási tudásbázis-keresés (`packages/core/src/search-knowledge.ts`) — a `rag/retrieve.ts`
teljes pipeline-ját hívja (HyDE → embedding → pgvector-keresés a RO poolon → rerank), és egy
`{ chunks, hitCount, topScore, weak }` alakú JSON-t ad vissza:

- `chunks`: a top-N (jelenleg 4) legrelevánsabb szövegrészlet (`source`, `title`, `category`,
  `content`, `score`).
- `hitCount` / `topScore`: metaadat a találatok minőségéről.
- `weak`: **kódszintű** jelzés (`packages/core/src/rag/retrieve.ts` `WEAK_RESULT_SCORE_THRESHOLD`
  konstans alapján, `topScore < WEAK_RESULT_SCORE_THRESHOLD`) az agent önreflektáló keresésének —
  a system prompt szabálya szerint `weak: true`-nál az agent egyszer újrafogalmazott kérdéssel
  újrahívhatja a toolt, mielőtt kimondaná, hogy "nincs erről infóm". Tudatos döntés (F6 utólagos
  javítás): a gyengeség eldöntése nem a modell szubjektív ítéletére van bízva (az a gyakorlatban
  nem volt konzisztens — más témáról szóló találatból generalizált, forráshivatkozás nélkül),
  hanem egy explicit, kód által kiszámolt boolean flag.

A `products` katalógustól eltérően ez **nem** a `runSql`/SQL-útvonalon megy — a system prompt
explicit elválasztja a kettőt (gondozási/egészségügyi kérdés → `searchKnowledge`, katalógus-kérdés
→ `runSql`/`listCategories`).

## Élő system prompt

A tool-ok pontos, agentnek adott leírása és használati szabálya: `docs/system-prompt.md` (szó
szerint szinkronban a `packages/core/src/system-prompt.ts` `SYSTEM_PROMPT` konstansával).
