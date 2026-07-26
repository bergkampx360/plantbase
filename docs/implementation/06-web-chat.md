# Plantbase — Webes chat felület (G rész)

> Kurzus-melléklet, az `05-rag-pipeline.md` (F rész, HF3 — RAG-pipeline) után — külön dokumentumként,
> mert az F rész (F1–F11) lezárult, és a saját szabály szerint ("Új rész indításának szabálya",
> `docs/implementation/STATUS.md`) egy lezárt fájlba nem kerül új munka. A G rész korábban az F-fájl
> végén, vázlatszinten élt (`05-rag-pipeline.md`-ben, F lezárása előtt) — ez a fájl az akkori vázlat
> részletezett, végrehajtható változata, F lezárása után. Ugyanazt a stílust és git-workflow
> szabályt követi, mint az F rész. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — G rész: webes chat felület

**Prioritás:** a HF3 leadási része (F1–F11) **előbb** készült el, CLI-n keresztül demonstrálva. A G rész ezután, külön fázissorozat — nem kockáztattuk a határidős leadást.

**Cél:** webes chat UI, stream-elt válasz, kattintható válasz → agent/tool-hívás-nyomkövetés, DB-alapú kontextus, "új chat" gomb, korábbi beszélgetések listája.

**Döntések:**

- **Agent-loop átáll az AI SDK-ra** (`streamText`+`tools`) a teljes `askAgent`-ben — felülírja `docs/architektura.md` 3. döntését (indoklás: pedagógiai cél már teljesült CLI-n; web a termék-minőséget célozza).
- **CLI megmarad** párhuzamosan (`docs/architektura.md` 1. döntése).
- **Stack:** Express 5 + React 19 + Vite + Tailwind + shadcn/ui; streaming-protokoll szöveg-delta + `data-tool`/`data-agent` típusok. **Elnevezés-eltérés:** a `docs/architektura.md` fájlstruktúra-diagramja jelenleg `apps/api`-t jelöl a jövőbeli backend nevének — a G-rész itt tudatosan `apps/server`-re nevezi át (Express-konvenció, nem REST-only API, hanem streaming-szerver is), ezt a `docs/architektura.md`-ben G1-nél kell majd tükrözni.
- **Thread-perzisztencia:** DB az igazságforrás, kliens új üzenetet + `threadId`-t küld; új chat = `threadId` nélkül (régi a DB-ben marad).

**További döntések (a részletezéskor, F lezárása után rögzítve):**

1. **`askAgent` visszatérési kontraktusa marad `Promise<AskResult>`, csak belül vált AI SDK-ra.**
   **Pontosítás**: a CLI és az `apps/server` **két külön Node-folyamat** — fizikailag nem oszthatnak
   meg egyetlen `streamText`-hívást. Ami valójában megosztott: a tool-definíciók
   (`RUN_SQL_TOOL`/`LIST_CATEGORIES_TOOL`/`SEARCH_KNOWLEDGE_TOOL` AI SDK `tool()`-alakban), a
   `SYSTEM_PROMPT`, és a modell-választás logikája (`process.env['ANTHROPIC_MODEL'] ?? ...`) —
   ezeket G1 **exportálja `packages/core`-ból**, és mind az `askAgent()` (CLI-nek, megvárja a
   `streamText`-et: `result.text`/`result.usage`/`result.response.messages`), mind a G2-beli
   `apps/server` (saját, önálló `streamText`-hívást épít ugyanezekből az exportokból, de streamelő
   fogyasztással) **külön-külön** hívja meg. Nincs duplikált agent-_logika_ (a tool/prompt/modell
   definíció egy helyen van), de **két külön hívás fut** — ez a G1 explicit tesztelési
   követelménye is: az exportált építőelemeknek G2-ben zökkenőmentesen újrafelhasználhatónak kell
   lenniük, anélkül hogy `askAgent()`-et kellene streamelésre kényszeríteni.
   **Következmény**: `AskResult.messages` típusa `Anthropic.MessageParam[]`-ról AI SDK
   `ModelMessage[]`-re vált — ez **valódi, elfogadott** CLI-oldali változás (`apps/cli/src/output.ts`,
   `format-messages.ts` frissül), nem "nulla módosítás", de a CLI funkcionálisan ugyanúgy működik
   tovább ("CLI megmarad párhuzamosan" — ez működést jelent, nem érintetlen fájlokat).
2. **A tool-loop `stopWhen`/multi-step mechanizmusa váltja a kézzel írt `for` ciklust** —
   az AI SDK beépített többlépéses tool-use támogatása (`stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)`)
   pontosan ugyanazt az 5-lépéses korlátot adja, mint most, kevesebb kézzel írt kóddal.
3. **A három tool (`runSql`/`listCategories`/`searchKnowledge`) AI SDK `tool()`-ra vált** — a
   jelenlegi, kézzel duplikált zod-séma + nyers `input_schema` pár egyetlen zod-sémára egyszerűsödik
   (`tool({ description, inputSchema, execute })`), a tool-függvények belső `.parse()`-a elhagyható
   (az AI SDK már típusos, validált inputot ad).
4. **Az "ismeretlen tool" hibaág strukturálisan megszűnik** — AI SDK típusos `tools` rekordja miatt
   a modell fizikailag nem hívhat nem létező tool-t; a jelenlegi teszt (F11-ben pótolt) helyébe egy
   új teszt lép: egy tool `execute`-ja dob egy hibát, és a feltevés szerint ez AI SDK-szinten
   hiba-tool-result lesz, nem crash — **ez, a dokumentum többi hasonló pontjához hasonlóan, Context7-vel
   és G1 saját tesztjével ellenőrizendő/igazolandó tényleges végrehajtáskor**, nem előre garantált API-viselkedés.
5. **`apps/server` Express-generátor nélkül, kézzel scaffoldolva** — `@nx/express` nincs telepítve;
   a `scaffold-nx-package` skill saját fallback-szabálya szerint ("ha nincs generátor, kézzel
   scaffoldolunk, nem viszünk be nehézsúlyú generátor-plugint csak erre") `@nx/node:application`
   mintájára kézzel épül fel, Express hozzáadva függőségként.
6. **`apps/web`-hez `@nx/react` telepítése javasolt** (nem kézi scaffold) — **tudatos eltérés az 5. döntésben idézett skill-elvtől** ("ne vigyünk be nehézsúlyú generátor-plugint csak erre"):
   itt indokolt a kivétel, mert React+Vite+Tailwind+shadcn/ui együttes kézi bedrótozása lényegesen
   több, egymásra épülő konfigurációs döntést (bundler, JSX-transform, Tailwind-PostCSS-integráció,
   shadcn CLI saját projekt-felismerése) igényelne, mint egyetlen Express-appnál (ahol a meglévő
   `@nx/node:application` már 90%-ban megfelelő, csak az Express-réteg hiányzik) — a hibalehetőség
   és a karbantartási teher itt nagyobb, mint amit a "ne vigyünk be plugint" elv spórolni akar. A
   pontos generátor-parancsot és shadcn/ui-inicializálást Context7-vel ellenőrzöm G4 tényleges
   végrehajtásakor (`docs/architektura.md` 7. döntése — ismeretlen lib előtt Context7).
7. **Thread/Message Prisma-modell a `KnowledgeChunk` stílusát követi** (camelCase mező + `@map`
   snake_case oszlopra, `Int @id @default(autoincrement())`, `@@map` snake_case tábla), nem a
   `Product` all-snake_case stílusát — ez a újabb, konzisztensebb minta a séma-fájlban.
8. **A Thread/Message perzisztencia Prisma Clienten (RW), NEM a `runSql`/`searchKnowledge` RO
   poolon megy** — ez alkalmazás-adat (beszélgetés-történet), nem agent-facing tudásbázis-olvasás,
   tehát a NFR1-elv (`docs/architektura.md` 2. döntés) itt nem vonatkozik rá; nem kell RO grant a
   `db-role-setup` skillben ezekre a táblákra.
9. **A `logs/` JSONL-naplózás (`logInteraction`) megmarad változatlanul, párhuzamosan** a DB-alapú
   Thread/Message-perzisztenciával — más célt szolgál (audit/debug-trail, nem UI-history-forrás).
10. **Explicit kimondva: a CLI és a Web beszélgetés-történetei NEM egyesülnek.** A CLI-n futtatott
    kérdések a `logs/` JSONL-be írnak (9. döntés), sosem a `Thread`/`Message` táblákba — a webes
    "korábbi beszélgetések" lista (G6) csak a `Thread`-eket látja, egy CLI-munkamenet ott nem jelenik
    meg, és fordítva sincs átjárás. Ez tudatos, egyszerűsítő döntés (két független belépési pont, két
    független history-mechanizmus) — ha a jövőben egyesített history kellene, az egy külön,
    G-n túli döntés lenne, nem ennek a tervnek a része.

---

## G rész — Fázisok (G1–G7)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit` → megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a ciklus, mint F1–F11-nél.

### G1 — `askAgent` átállítása AI SDK `streamText`+`tools`-ra ⏳ NYITOTT

**Context7-ellenőrzés kötelező G1 elején, kódolás előtt** (`docs/architektura.md` 7. döntése —
ismeretlen lib előtt Context7): a `streamText`, az AI SDK `tool()` helper és a `stopWhen`/
`stepCountIs` többlépéses tool-use mechanizmus **ebben a repóban most kerül először production-kódba**
— eddig az `ai` SDK csak egylövéses hívásokra volt használva (`generateText`/`embedMany`/
`generateObject`, a RAG-rétegben). A lenti bullet-ök (a pontos hívás-alak, a `tools`-rekord
formátuma, a hiba-kezelés tényleges viselkedése) a Context7-ellenőrzés **után**, annak fényében
pontosítandók/igazítandók — jelen forma egy tervezett, nem véglegesített API-alak.

- `packages/core/src/run-sql.ts`, `list-categories.ts`, `search-knowledge.ts`: a párhuzamos
  zod+raw-`input_schema` pár helyett egyetlen AI SDK `tool({ description, inputSchema: ZodSchema,
execute })` export minden toolhoz; a belső `.parse()` hívások elhagyása (AI SDK már típusos inputot ad).
- `packages/core/src/ask-agent.ts`: a kézzel írt `for` ciklus + `client.messages.create` +
  switch-dispatch helyett egyetlen `streamText({ model: anthropic(...), system: SYSTEM_PROMPT,
messages, tools: { runSql, listCategories, searchKnowledge }, stopWhen:
stepCountIs(MAX_TOOL_ITERATIONS) })` hívás (a meglévő `MAX_TOOL_ITERATIONS = 5` konstans
  megmarad, csak a kézzel írt `for` ciklus helyett a `stopWhen`-nek adjuk át — ld. 2. döntés);
  `AskResult.messages` típusa AI SDK `ModelMessage[]`-re vált; `tokenUsage` az AI SDK aggregált
  `usage`-ából; `generatedSql` side-channel `result.steps`-ből (a `runSql` tool-hívás argumentuma).
- `packages/core/src/log-interaction.ts`: az `InteractionLog.messages` mező típusa jelenleg
  `Anthropic.MessageParam[]` — ezt is `ModelMessage[]`-re kell váltani, különben az `ask-agent.ts`-beli
  `logInteraction({ messages: result.messages, ... })` hívás típushibás lenne. `log-interaction.spec.ts`
  (F11) teszt-fixture-ei ennek megfelelően frissülnek.
- `packages/core/src/index.ts`: a G2-nek (másik app) szüksége lesz a tool-definíciókra,
  `SYSTEM_PROMPT`-ra és a modell-választás logikájára — ezeket itt, a csomag egyetlen publikus
  belépési pontján (`konvenciok.md` szabálya) exportáljuk, nem mély/belső importtal.
- `@anthropic-ai/sdk` függőség sorsának eldöntése: G1 után `ask-agent.ts` már nem a nyers
  Anthropic-klienst hívja — ellenőrizni kell, marad-e bármi valós felhasználása
  `packages/core`-ban/`apps/cli`-ben (pl. típus-újraexport), és ha nem, a függőség eltávolítása
  (ne maradjon használaton kívüli csomag).
- `apps/cli/src/output.ts`, `format-messages.ts`: az új `ModelMessage[]` alakra igazítva (a
  `--show-prompt` kimenet funkcionálisan ugyanazt mutatja, csak az alatta lévő típus más).
- `docs/architektura.md`: 3. döntés átírása (kézzel írt loop → AI SDK `streamText`+`tools`, a régi
  szöveg jelezve, hogy G1-nél felülíródott); a fájlstruktúra-diagram `apps/api` → `apps/server`.
- `docs/stack.md`: a Vercel `ai` SDK sorának "csak... nem érinti az askAgent loopját" megjegyzése
  frissül (mostantól a teljes agent-loop is ezt használja).
- `docs/tech/architecture.md`, `docs/tech/api.md`: a tool-definíció-leírás frissítése (egy zod-séma,
  nem kettő); `apps/api` → `apps/server` javítás.
- `docs/testing-strategy.md`: új, negyedik AI-SDK-mock-mintázat dokumentálása (`streamText`+`tools`
  mockolása `ai/test` `MockLanguageModelV2`-vel — pontos API Context7-vel ellenőrizve G1
  végrehajtásakor) — a meglévő három minta (natív Anthropic, `embedMany`, `generateText`/HyDE) mellé.
- **Kötelező, ugyanebben a fázisban**: `ask-agent.spec.ts` teljes átírása az új mock-mintára,
  minden meglévő eset megtartásával (SQL-guard hiba, sikeres runSql, multi-tool iteráció,
  searchKnowledge siker/hiba, önreflektáló retry, `ANTHROPIC_MODEL` fallback) + az új
  tool-execute-hiba eset az "ismeretlen tool" teszt helyett.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; `plantbase ask "..."` CLI-n
keresztül változatlanul működik (manuális ellenőrzés, valós API-hívással).
**Commit:** `feat: migrate askAgent to AI SDK streamText with typed tools`
→ megállok, kérem a tesztelést.

### G2 — `apps/server` scaffold (Express + `/api/chat`) ⏳ NYITOTT

- `apps/server` kézi scaffold (`scaffold-nx-package` skill fallback-mintája, `@nx/node:application`
  struktúrát követve), Express hozzáadva függőségként.
- `POST /api/chat` — `{ question, threadId? }` body, a G1-ben módosított `packages/core`
  tool/system-prompt-definíciókat újrahasznosítva (nem duplikálva) egy **saját, önálló**
  streamelő `streamText`-hívás (ld. 1. döntés pontosítása — nem az `askAgent()`-en keresztül),
  AI SDK data-stream-válaszként (`text-delta` + `data-tool`/`data-agent` custom part-ok, a G-rész
  eredeti döntése szerint). A pontos AI SDK v5 streaming-response API (a válasz-objektum létrehozó
  metódusa, a custom data-part-ok írásának módja) Context7-vel ellenőrizve G2 tényleges
  végrehajtásakor (`docs/architektura.md` 7. döntése) — ez ebben a repóban még sehol nem használt API.
- Env-betöltés a szerver belépési pontján (dotenv), a CLI mintájára (`apps/cli/src/main.ts`
  ugyanezt csinálja, mert a globálisan telepített bináris nem örökli a direnv-et).
- CORS-beállítás a helyi fejlesztői Vite dev-szerverhez (G4 előkészítése).
- `docs/tech/api.md` bővítése a `/api/chat` HTTP-felülettel, a meglévő CLI/tool-felület mellé.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; kézi `curl`/Postman-teszt a
`/api/chat` végpontra, streamelt válasz látható.
**Commit:** `feat: scaffold apps/server with streaming /api/chat endpoint`
→ megállok, kérem a tesztelést.

### G3 — Prisma `Thread`/`Message` + `/api/threads` router ⏳ NYITOTT

- `packages/db/prisma/schema.prisma`: új `Thread` (`id Int @id @default(autoincrement())`,
  `createdAt`/`updatedAt` `@map`-elve) és `Message` (`id`, `threadId @map("thread_id")`, `role`,
  `content`, `createdAt`) modell, a `KnowledgeChunk` mező-stílusát követve, `@@map` snake_case
  táblanévvel, doksi-hivatkozó kommenttel.
- Migráció generálása; **nem** kell `db-role-setup` skill újrafuttatás (ezek RW-only táblák, az
  agent RO-útja nem éri el őket).
- `GET /api/threads` (lista), `GET /api/threads/:id` (üzenetekkel együtt); `POST /api/chat` (G2)
  bővítése: minden kör után a kérdés+válasz perzisztálása a `threadId`-hez (vagy új `Thread`
  létrehozása, ha nincs `threadId`).
- `docs/ddd/model.md` bővítése a `Thread`/`Message` entitásokkal.

**Teszt:** migráció lefut tiszta DB-n; `pnpm exec nx run-many -t build,typecheck,test,lint` zöld;
kézi teszt: két egymást követő `/api/chat` hívás ugyanazzal a `threadId`-vel, `GET
/api/threads/:id` visszaadja mindkét kört. **CLI-regresszió**: `packages/db` séma-változás után
`plantbase ask "..."` továbbra is működik (a `runSql`/`searchKnowledge` RO-útja nem érinti az új
táblákat, de ezt explicit ellenőrizni kell, nem csak feltételezni).
**Commit:** `feat: add Thread/Message persistence and /api/threads router`
→ megállok, kérem a tesztelést.

### G4 — `apps/web` scaffold (React + `useChat`) ⏳ NYITOTT

- `@nx/react` telepítése + generátor-alapú scaffold (`apps/web`), Vite bundlerrel, Tailwind +
  shadcn/ui inicializálva (pontos parancsok Context7-vel ellenőrizve végrehajtáskor).
- Alap chat-UI: kérdés-beviteli mező, üzenetlista, AI SDK `useChat` hook bekötve a G2 `/api/chat`
  végpontjára, streamelt válasz-megjelenítéssel.
- `docs/stack.md` bővítése: React 19, Vite, Tailwind, shadcn/ui bekerül a stack-listába.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; kézi böngészős teszt (`nx
serve web` + `nx serve server`), egy kérdés-válasz kör streamelve látszik.
**Commit:** `feat: scaffold apps/web with streaming chat UI`
→ megállok, kérem a tesztelést.

### G5 — Tool-kártya komponensek (`data-tool`/`data-agent`) ⏳ NYITOTT

- React komponensek, amik a G2-ben streamelt `data-tool`/`data-agent` part-okat vizuálisan
  megkülönböztetve jelenítik meg (pl. összecsukható "🔧 searchKnowledge(...)" kártya a tool-hívással
  és -eredménnyel) — a CLI `--show-prompt` funkcionális megfelelője, de UI-ban.

**Teszt:** kézi böngészős teszt: egy gondozási kérdésnél (`searchKnowledge`) és egy katalógus-
kérdésnél (`runSql`) is látszik a tool-kártya a megfelelő adattal.
**Commit:** `feat: add tool-call visualization cards to chat UI`
→ megállok, kérem a tesztelést.

### G6 — "Új chat" gomb + history lista ⏳ NYITOTT

- "Új chat" gomb: törli az aktuális `threadId`-t, üres beszélgetést indít.
- Oldalsáv/lista a korábbi `Thread`-ekről (G3 `/api/threads` GET-jéből), kattintásra betölti az adott
  szál üzeneteit.

**Teszt:** kézi böngészős teszt: több beszélgetés indítása, közöttük váltás, a history helyesen
töltődik vissza.
**Commit:** `feat: add new-chat button and thread history sidebar`
→ megállok, kérem a tesztelést.

### G7 — Tesztek + docs lezárás ⏳ NYITOTT

- `apps/server`: unit/integration tesztek a `/api/chat`/`/api/threads` végpontokra (teszt-könyvtár
  kiválasztása — pl. `supertest` — Context7-vel ellenőrizve végrehajtáskor).
- `apps/web`: alap komponens-tesztek (Vitest + React Testing Library, a meglévő Vitest-konvenciót
  követve).
- `docs/implementation/STATUS.md`: G sor ✅ Kész.
- `README.md`: G-rész futtatási instrukciók (`nx serve server`, `nx serve web`), "Dokumentáció"
  táblázat bővítése.
- **Tudatosan NEM ebben a körben**: `apps/cli` jelenlegi, F-ben már nevesített teszt-adóssága
  (`docs/testing-strategy.md` "Kimarad" szakasza) — ez a G-rész scope-ján kívül eső, külön tétel.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, minden új teszttel együtt.
**CLI-regresszió (G-rész záró ellenőrzése)**: `plantbase ask "..."` és az interaktív mód is
változatlanul működik a teljes G1–G6 után — ez az egyetlen G-fázison kívül G1-en, ahol ez explicit
ellenőrzésre kerül, ezért itt, a lezáráskor kötelező, nem csak feltételezett.
**Commit:** `test: add apps/server and apps/web tests, close out G-rész docs`
→ megállok, kérem a tesztelést.
