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

## HTTP: `POST /api/chat` (`apps/server`, G2–G4)

Body: `{ "id": string, "message": UIMessage }` (AI SDK natív `useChat`/`DefaultChatTransport`
mintája, G4-től — **nem** `{ question, threadId }`, ahogy G2/G3-ban eredetileg volt). Az `id`-t a
**kliens generálja** (`generateId()` az `'ai'`-ból) egy új beszélgetés indításakor, mielőtt az
első üzenet elmenne — a szerver sosem talál ki saját azonosítót, csak arra perzisztál, amit kap.
A `message` csak az UTOLSÓ (legújabb) `UIMessage`, nem a teljes history — a szerver tölti be a
korábbi kört a DB-ből (`prepareSendMessagesRequest` a kliensen, ld. `apps/web/src/app/chat.tsx`).
Hiányzó `id`/`message`, vagy üres szöveges tartalom → `400`. **Nem** az `askAgent()`-en keresztül
megy — `apps/server/src/main.ts` egy saját, önálló `streamText`-hívást épít a `packages/core`-ból
exportált tool-okból (`RUN_SQL_TOOL`/`LIST_CATEGORIES_TOOL`/`SEARCH_KNOWLEDGE_TOOL`),
`SYSTEM_PROMPT`-ból és `resolveModel()`-ből — a CLI és a szerver két külön Node-folyamat, csak az
építőelemeket osztják meg, nem egy hívást.

**Thread-kezelés**: ha az `id`-hoz nincs `Thread`, egy új nyílik (a kapott `id`-val); ha van,
a korábbi kör(ök) `Message`-ei betöltődnek, `UIMessage`-é alakítva, és a `convertToModelMessages`
elé kerülnek a `streamText`-hívásban — enélkül a modell nem tudna a korábbi körökre hivatkozva
válaszolni, csak a mentés léteznék, a beszélgetés-folytonosság a válaszban nem. A user-üzenet
azonnal mentve (még a `streamText`-hívás előtt); a végleges asszisztens-válasz a
`result.toUIMessageStream({ onFinish: ({ responseMessage }) => ... })` callbackjében mentve (ez fut
le, amikor a teljes, több lépéses válasz és minden tool-végrehajtás lezárult, nem lépésenként) — **nem**
a `streamText`-szintű `onFinish`-ben, mert az csak a végleges szöveget adja, nem a tool-hívásokat
is tartalmazó `parts` tömböt (H4, ld. lent). **Az `X-Thread-Id` response header megszűnt** — a
kliens már ismeri az `id`-t, ő generálta.

Válasz: streamelt AI SDK UI-message stream — a **standalone** `pipeUIMessageStreamToResponse({
response, stream })` függvénnyel (nem a `result.pipeUIMessageStreamToResponse(res)` kényelmi
metódussal, mert az nem fogad egyedi `onFinish`-t), Server-Sent Events. A natív
`tool-input-start`/`tool-input-available`/`tool-output-available` part-ok automatikusan
tartalmazzák a tool-hívásokat és -eredményeket — **nincs** egyelőre kézzel írt `data-tool`/
`data-agent` custom part (a G-terv eredeti ötlete); ha G5 (tool-kártya UI) konkrét igénye ezt
indokolja, ott dől el.

**Tool-hívások perzisztálása (H4)**: a `Message.parts` (nullable `Json`) mezőbe a mentés a natív
`toUIMessageStream`-`onFinish` `responseMessage.parts`-ja kerül — a teljes, kész `UIMessage.parts`
tömb (szöveg + minden tool-hívás/-eredmény), ugyanabban az alakban, mint amit a kliens megkap
élő streamelés közben. A `content` mező marad, egyszerű szöveges fallback/napló céljából. A
`GET /api/threads/:id` válaszban minden `Message`-nek van (esetleg `null`) `parts` mezője; a H4
előtti üzeneteknél `null`, a kliens (`apps/web/src/app/app.tsx` `toUIMessages()`) ilyenkor a
`content`-ből épít egyetlen szöveges `part`-ot.

CORS: `CORS_ORIGIN` env-változó (alapértelmezett `http://localhost:4200` — a `@nx/react:application`
generátor ezt a portot állítja be alapértelmezetten `apps/web`-hez, nem az általános Vite-
alapértelmezett 5173-at). Port: `PORT` env-változó (alapértelmezett `3001`).

## HTTP: `GET /api/threads`, `GET /api/threads/:id` (`apps/server`, G3–G4, H3)

`GET /api/threads` — a `Thread`-ek listája (`id`, `title`, `createdAt`, `updatedAt`), `updatedAt`
szerint csökkenő sorrendben (legutóbb aktív szál elöl). `title` nullable — a H3 előtt létrehozott
szálaknak nincs (a kliens ilyenkor dátum-fallbackre esik vissza, `apps/web/src/app/thread-sidebar.tsx`).

`GET /api/threads/:id` — egy `Thread` a hozzá tartozó `Message`-ekkel (`createdAt` szerint
növekvő sorrendben). `id` egy String (G4-től, ld. `packages/db/prisma/schema.prisma`), nem szám —
nincs formátum-validáció, csak létezés-ellenőrzés; nem létező `id` → `404`.

**Szál-cím generálása (H3)**: `POST /api/chat`-ben, ÚJ szál létrehozásakor, a szerver meghívja a
`generateThreadTitle(questionText)`-et (`packages/core/src/title-agent.ts`) — egy rövid, 2-4 szavas
cím LLM-összefoglalással, nem nyers karakter/mondat-csonkolással (ami félbevágott mondatokat adhatna,
különösen magyar, ragozott szerkezeteknél). Egy plusz, gyors (haiku) modellhívás szálanként egyszer,
szekvenciálisan a `streamText`-hívás előtt.
