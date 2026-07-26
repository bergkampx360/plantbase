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

Mindhárom tool ugyanazt a shape-et követi: `tool({ description, inputSchema: <zod séma>, execute })`
a Vercel `ai` SDK-ból (G1, `docs/implementation/06-web-chat.md`) — egyetlen zod séma, amit az AI SDK
konvertál a modellnek adott JSON-sémára, nincs kézzel duplikált raw `input_schema`. Az `execute`
minden toolnál try/catch-csel csomagolja a mögöttes `runSql`/`listCategories`/`searchKnowledge`
függvényt: azok validációs/futtatási hibán throw-olnak, de az `execute` ezt szöveges eredményként
adja vissza (nem dobja tovább) — mert egy `execute`-ból kidobott hiba az AI SDK-ban a teljes
`streamText`-hívást megszakítaná (`ToolExecutionError`), nem hiba-tool-result-ot generálna, ami
törné az agent önreflektáló újrapróbálkozását.

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

## HTTP: `POST /api/chat` (`apps/server`, G2–G3)

Body: `{ "question": string, "threadId"?: number }` (hiányzó/üres `question`-re `400`). **Nem** az
`askAgent()`-en keresztül megy — `apps/server/src/main.ts` egy saját, önálló `streamText`-hívást
épít a `packages/core`-ból exportált tool-okból (`RUN_SQL_TOOL`/`LIST_CATEGORIES_TOOL`/
`SEARCH_KNOWLEDGE_TOOL`), `SYSTEM_PROMPT`-ból és `resolveModel()`-ből — a CLI és a szerver két külön
Node-folyamat, csak az építőelemeket osztják meg, nem egy hívást.

**Thread-kezelés (G3)**: ha `threadId` hiányzik vagy érvénytelen, egy új `Thread` nyílik; ha
megadott és létező, a korábbi kör(ök) `Message`-ei betöltődnek és a `streamText` `messages`
tömbjének elejére kerülnek — enélkül a modell nem tudna a korábbi körökre hivatkozva válaszolni,
csak a mentés léteznék, a beszélgetés-folytonosság a válaszban nem. A user-kérdés azonnal mentve
(még a `streamText`-hívás előtt); a végleges asszisztens-válasz a `streamText` `onFinish`
callbackjében mentve (ez fut le, amikor a teljes, több lépéses válasz és minden tool-végrehajtás
lezárult, nem lépésenként). A `threadId`-t egy `X-Thread-Id` response header adja vissza —
streamelt válasznál ez az egyszerű csatorna erre.

Válasz: streamelt AI SDK UI-message stream (`result.pipeUIMessageStreamToResponse(res)`,
Server-Sent Events). A natív `tool-input-start`/`tool-input-available`/`tool-output-available`
part-ok automatikusan tartalmazzák a tool-hívásokat és -eredményeket — **nincs** egyelőre kézzel
írt `data-tool`/`data-agent` custom part (a G-terv eredeti ötlete), mert G2-ben még nincs kliens,
ami ezt fogyasztaná; ha G5 (tool-kártya UI) konkrét igénye ezt indokolja, ott dől el.

CORS: `CORS_ORIGIN` env-változó (alapértelmezett `http://localhost:5173`, a jövőbeli `apps/web`
Vite dev-szerveréhez, G4). Port: `PORT` env-változó (alapértelmezett `3001`).

## HTTP: `GET /api/threads`, `GET /api/threads/:id` (`apps/server`, G3)

`GET /api/threads` — a `Thread`-ek listája (`id`, `createdAt`, `updatedAt`), `updatedAt` szerint
csökkenő sorrendben (legutóbb aktív szál elöl).

`GET /api/threads/:id` — egy `Thread` a hozzá tartozó `Message`-ekkel (`createdAt` szerint
növekvő sorrendben). Érvénytelen (nem szám) `id` → `400`; nem létező `id` → `404`.
