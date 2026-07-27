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
   `streamText`-et: `result.text`/`result.totalUsage`/`result.response.messages`), mind a G2-beli
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
   a modell fizikailag nem hívhat nem létező tool-t, a TypeScript már fordítási időben kizárja.
   **G1 Context7-ellenőrzése cáfolta az eredeti feltevést**: egy `execute`-ból dobott hiba az AI
   SDK-ban **nem** válik automatikusan hiba-tool-result-tá, hanem egy `ToolExecutionError`-t dob,
   ami megszakítja a teljes `streamText`-hívást. Emiatt minden tool saját `execute`-wrappere
   explicit try/catch-csel fogja a mögöttes függvény (`runSql`/`listCategories`/`searchKnowledge`)
   throw-ját, és szövegként adja vissza — ez tartja meg az önreflektáló retry viselkedést, nem az
   AI SDK automatikus mechanizmusa.
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

### G1 — `askAgent` átállítása AI SDK `streamText`+`tools`-ra ✅ KÉSZ

**Context7-ellenőrzés megtörtént kódolás előtt** (`docs/architektura.md` 7. döntése — ismeretlen lib
előtt Context7, `/vercel/ai/ai_5_0_0`). Eredmény, a lenti bullet-ök ehhez képest pontosítva:

- `streamText` + `tool({ description, inputSchema, execute })` + `stopWhen: stepCountIs(N)` pontosan
  úgy működik, ahogy a terv feltételezte.
- **Valódi korrekció a 4. döntéshez képest**: ha egy `execute` hibát dob, az AI SDK ezt **nem**
  alakítja automatikusan hiba-tool-result-tá — egy `ToolExecutionError`-t dob, ami **megszakítja a
  teljes `streamText`-hívást**. Emiatt a `runSql`/`listCategories`/`searchKnowledge` (amik
  változatlanul throw-olnak validációs/futtatási hibán, a meglévő spec-jeik nem változtak) egy
  vékony try/catch `execute`-wrapperbe kerültek minden tool-fájlban, ami a hibaüzenetet **szövegként
  visszaadja** (nem dobja tovább) — így az önreflektáló retry viselkedés megmarad.
- **`tokenUsage`-hoz `result.totalUsage` kell, nem `result.usage`** — az utóbbi csak az utolsó lépés
  használatát adná vissza multi-step futásnál (a terv ezt még nem különböztette meg).
- **`result.response.messages`** valóban a teljes (kumulatív, minden lépést tartalmazó) history —
  ez megegyezik a hivatalos "append response messages to history" mintával.
- **A tesztelési minta egyszerűbb lett, mint a terv feltételezte**: nem kellett az `ai/test`
  `MockLanguageModelV2`-t bevezetni — a meglévő `vi.mock('ai', () => ({ streamText: mockFn, ... }))`
  minta (ld. `hyde.spec.ts`) közvetlenül kiterjedt `streamText`-re (`docs/testing-strategy.md`
  frissítve).
- `apps/cli/package.json`-nak is szüksége lett az `ai` függőségre (nem csak `packages/core`-nak),
  mert a `format-messages.ts` a `ModelMessage` típust importálja.
- `format-messages.ts` egy apró, futás közben derült ki-probléma: az AI SDK a tool-eredményt egy
  `{ type: 'text'|'json', value }` alakra csomagolja a `response.messages`-ben — ezt ki kellett
  csomagolni, különben a `--show-prompt` kimenet dupla JSON-becsomagolást mutatott volna a korábbi,
  nyers string kimenethez képest.

- `packages/core/src/run-sql.ts`, `list-categories.ts`, `search-knowledge.ts`: a párhuzamos
  zod+raw-`input_schema` pár helyett egyetlen AI SDK `tool({ description, inputSchema: ZodSchema,
execute })` export minden toolhoz; a belső `.parse()` hívások elhagyása (AI SDK már típusos inputot ad).
- `packages/core/src/ask-agent.ts`: a kézzel írt `for` ciklus + `client.messages.create` +
  switch-dispatch helyett egyetlen `streamText({ model: anthropic(...), system: SYSTEM_PROMPT,
messages, tools: { runSql, listCategories, searchKnowledge }, stopWhen:
stepCountIs(MAX_TOOL_ITERATIONS) })` hívás (a meglévő `MAX_TOOL_ITERATIONS = 5` konstans
  megmarad, csak a kézzel írt `for` ciklus helyett a `stopWhen`-nek adjuk át — ld. 2. döntés);
  `AskResult.messages` típusa AI SDK `ModelMessage[]`-re vált; `tokenUsage` a `result.totalUsage`-ból
  (ld. fent); `generatedSql` side-channel `result.steps`-ből (az utolsó `runSql` tool-hívás
  argumentuma — ugyanaz a "legutóbbi próbálkozás számít" szemantika, mint a korábbi kézzel írt
  loopban volt).
- `packages/core/src/log-interaction.ts`: az `InteractionLog.messages` mező típusa jelenleg
  `Anthropic.MessageParam[]` — ezt is `ModelMessage[]`-re kell váltani, különben az `ask-agent.ts`-beli
  `logInteraction({ messages: result.messages, ... })` hívás típushibás lenne. `log-interaction.spec.ts`
  (F11) teszt-fixture-ei ennek megfelelően frissülnek.
- `packages/core/src/index.ts`: a G2-nek (másik app) szüksége lesz a tool-definíciókra,
  `SYSTEM_PROMPT`-ra és a modell-választás logikájára — ezeket itt, a csomag egyetlen publikus
  belépési pontján (`konvenciok.md` szabálya) exportáljuk, nem mély/belső importtal.
- `@anthropic-ai/sdk` függőség eltávolítva mind `packages/core`, mind `apps/cli` `package.json`-jából
  — a rewrite után egyik helyen sem maradt valós felhasználása (ellenőrizve `grep`-pel).
- `apps/cli/src/output.ts`, `format-messages.ts`: az új `ModelMessage[]` alakra igazítva (a
  `--show-prompt` kimenet funkcionálisan ugyanazt mutatja, csak az alatta lévő típus más).
- `docs/architektura.md`: 3. döntés átírása (kézzel írt loop → AI SDK `streamText`+`tools`, a régi
  szöveg jelezve, hogy G1-nél felülíródott); a fájlstruktúra-diagram `apps/api` → `apps/server`.
- `docs/stack.md`: a Vercel `ai` SDK sorának "csak... nem érinti az askAgent loopját" megjegyzése
  frissül (mostantól a teljes agent-loop is ezt használja).
- `docs/tech/architecture.md`, `docs/tech/api.md`: a tool-definíció-leírás frissítése (egy zod-séma,
  nem kettő); `apps/api` → `apps/server` javítás.
- `docs/testing-strategy.md`: az `askAgent` mockolási mintája frissítve `vi.mock('ai')`-ra
  (`streamText`/`tool`/`stepCountIs`) — a korábbi natív `@anthropic-ai/sdk` mock-sor törölve
  (nincs többé natív Anthropic-hívás a kódban); ez a meglévő HyDE/rerank/embed `ai`-mock család
  negyedik tagja, **nem** egy külön `ai/test`-alapú minta (ld. fent, Context7-eredmény).
- **`ask-agent.spec.ts` teljes átírva** az új mock-mintára — **tudatos felelősség-áthelyezés,
  eltérés az eredeti tervtől**: mivel a tool-végrehajtás és a hibakezelés most a (mockolt) AI
  SDK-ban, ill. az egyes tool-fájlok `execute`-wrapperében történik, nem az `ask-agent.ts` saját
  kódjában, az `ask-agent.spec.ts` már csak az orkesztrációt teszteli (a `streamText`-nek átadott
  paraméterek, a `text`/`totalUsage`/`response`/`steps` helyes feldolgozása, history-összefűzés,
  `generatedSql`-kinyerés több lépésből, naplózás, `ANTHROPIC_MODEL` fallback). A korábbi
  SQL-guard-hiba/searchKnowledge-hiba/önreflektáló-retry eseteket immár a saját tool-jük spec-je
  fedi (`run-sql.spec.ts`, `list-categories.spec.ts`, `search-knowledge.spec.ts` — mindegyikben egy
  `*_TOOL.execute` teszt, ami igazolja, hogy egy dobott hiba szövegként, nem kivételként jön
  vissza). Az "ismeretlen tool" teszt megszűnt (típusos `tools` rekord miatt fizikailag nem
  hívható) — nincs helyettesítő teszt rá, mert nincs mit tesztelni: a TypeScript már fordítási
  időben kizárja.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; `plantbase ask "..."` CLI-n
keresztül változatlanul működik (manuális ellenőrzés, valós API-hívással).
**Commit:** `feat: migrate askAgent to AI SDK streamText with typed tools`
→ megállok, kérem a tesztelést.

### G2 — `apps/server` scaffold (Express + `/api/chat`) ✅ KÉSZ

**Context7-ellenőrzés megtörtént kódolás előtt** (`/vercel/ai/ai_5_0_0`). Eredmény, a lenti
bullet-ök ehhez képest pontosítva:

- Express/Node.js szerverhez a helyes AI SDK v5 API `result.pipeUIMessageStreamToResponse(res)`
  (nem a 4.0-s, elavult `pipeDataStreamToResponse`).
- **Egyszerűsítés a G-terv eredeti "data-tool/data-agent" megfogalmazásához képest**: a natív
  UI-message stream (`pipeUIMessageStreamToResponse`) már alapból tartalmazza a
  `tool-input-start`/`tool-input-available`/`tool-output-available` part-okat — G2-ben **nem**
  kellett kézzel írt `data-tool`/`data-agent` custom part-okat bevezetni, mert nincs még kliens
  (`apps/web`, G4), ami ezt fogyasztaná. Ha G5 (tool-kártya UI) konkrét megjelenítési igénye ezt
  ténylegesen megköveteli a natív tool-part formátumon felül, azt G5-nél döntjük el, akkor
  Context7-vel ellenőrizve.

Megvalósítás:

- `apps/server` kézi scaffold (`scaffold-nx-package` skill fallback-mintája, 1:1 az
  `apps/cli/project.json`/`tsconfig.*`/`eslint.config.mjs` mintája alapján), Express hozzáadva
  függőségként (`express@5.2.1`, `cors@2.8.6`).
- `POST /api/chat` (`apps/server/src/main.ts`) — `{ question: string }` body (400 hiányzó/üres
  `question`-re; a `threadId` mező G3-ban kerül be ténylegesen használva), a G1-ben
  `packages/core/src/index.ts`-ből exportált tool/system-prompt/modell-építőelemeket
  újrahasznosítva (nem duplikálva) egy **saját, önálló** `streamText`-hívás (ld. 1. döntés
  pontosítása — nem az `askAgent()`-en keresztül).
- Env-betöltés a szerver belépési pontján (dotenv), a CLI mintájára (`apps/cli/src/main.ts`
  ugyanezt csinálja, mert a globálisan telepített bináris nem örökli a direnv-et).
- CORS-beállítás (`CORS_ORIGIN` env, alapértelmezett `http://localhost:5173`) a helyi fejlesztői
  Vite dev-szerverhez (G4 előkészítése). Port `PORT` env, alapértelmezett `3001`. Mindkettő
  bekerült `.env.example`-be, opcionálisként dokumentálva (van kódbeli fallback).
- `docs/tech/api.md` bővítve a `/api/chat` HTTP-felülettel, `docs/architektura.md` és
  `docs/tech/architecture.md` bővítve az `apps/server` fájlstruktúra-bejegyzéssel/szakasszal.
- Nincs közvetlen DB-hívás `apps/server`-ben (sem `getPool()`, sem `getWritePool()`) — az
  adat-elérés kizárólag a `packages/core`-ból importált tool-okon keresztül megy.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld (a `server` projekt
`nx sync`-kel felvéve a root `tsconfig.json` project-referenciái közé); kézi, valós API-hívásos
`curl`-teszt: hiányzó `question` → `400`; katalógus-kérdés (`listCategories` tool-call/output SSE
part-okkal streamelve); gondozási kérdés (`searchKnowledge`, RAG, forráshivatkozásos találatokkal
streamelve).
**Commit:** `feat: scaffold apps/server with streaming /api/chat endpoint`
→ megállok, kérem a tesztelést.

### G3 — Prisma `Thread`/`Message` + `/api/threads` router ✅ KÉSZ

- `packages/db/prisma/schema.prisma`: új `Thread` (`id Int @id @default(autoincrement())`,
  `createdAt`/`updatedAt` `@map`-elve, `updatedAt` `@updatedAt` direktívával) és `Message` (`id`,
  `threadId @map("thread_id")`, `role String`, `content`, `createdAt`) modell, `Thread`↔`Message`
  1:N reláció, a `KnowledgeChunk` mező-stílusát követve, `@@map` snake_case táblanévvel,
  doksi-hivatkozó kommenttel.
- Migráció generálva és lefuttatva (`pnpm --filter @plantbase/db exec prisma migrate dev --name
add_thread_message`); **nem** kellett `db-role-setup` skill újrafuttatás (ezek RW-only táblák, az
  agent RO-útja nem éri el őket — a skill szövege is megerősítette, hogy kizárólag a
  `products`/`knowledge_chunks` RO-grantra vonatkozik).
- `packages/db/src/index.ts`: `Thread`/`Message` típusok exportálva a `Product` mintájára.
- `GET /api/threads` (lista, `updatedAt` desc), `GET /api/threads/:id` (üzenetekkel, `createdAt`
  asc; 400 érvénytelen, 404 nem létező id-re); `POST /api/chat` (G2) bővítve: minden kör után a
  kérdés+válasz perzisztálása a `threadId`-hez (vagy új `Thread` létrehozása, ha nincs érvényes
  `threadId`), `threadId` `X-Thread-Id` response header-ben visszaadva.
- **Kézi teszt közben talált, útközben javított hiányosság**: az első verzió csak mentette a
  kör(öke)t, de nem töltötte be a korábbiakat a `streamText`-hívás `messages` tömbjébe — a
  `threadId`-folytonosság így csak a DB-ben létezett volna, a modell válaszaiban nem (egy
  második, a szál kontextusára épülő kérdésre a modell visszakérdezett volna, ahelyett hogy
  értelmezte volna a korábbi kört). Javítva: a korábbi `Message`-ek (ha van érvényes `threadId`)
  betöltődnek, mielőtt az új user-üzenet perzisztálódna, és bekerülnek a `streamText` `messages`
  tömbjének elejére.
- **Váratlanul talált és javított, G3-tól független, meglévő infrastrukturális hiba**: a
  `packages/core`, `packages/db`, `apps/cli`, `apps/server` mind az **azonos, literális**
  `outDir: ../../dist/out-tsc` értéket használták a `tsconfig.lib.json`/`tsconfig.app.json`
  fájljaikban — mivel mindegyik két szinttel a repo-gyökér alatt van, ez ugyanarra az abszolút
  mappára oldódott fel mindegyiknél, így pl. `packages/core/src/index.ts` és
  `packages/db/src/index.ts` ugyanoda (`dist/out-tsc/src/index.d.ts`) emittálódott, egymást
  felülírva. Ez idáig rejtve maradt, mert egyetlen projekt sem hivatkozott EGYSZERRE `core`-ra ÉS
  `db`-re — `apps/server` (G3-mal, `@plantbase/db` hozzáadásával) az első ilyen. Javítva: minden
  érintett `outDir` projekt-specifikus alkönyvtárra váltva (`dist/out-tsc/packages/core`,
  `.../packages/db`, `.../apps/cli`, `.../apps/server`).
- `docs/ddd/model.md` bővítve egy "Chat domain" szakasszal (`Thread`/`Message`, aggregátum-határ,
  kapcsolat a `logs/` JSONL-naplózással).
- `docs/tech/api.md`, `docs/tech/architecture.md` bővítve a `threadId`/`X-Thread-Id` mechanizmussal
  és az `apps/server` új, közvetlen Prisma-hozzáférésével.

**Teszt:** migráció lefutott a helyi docker-compose Postgresen; `pnpm exec nx run-many -t
build,typecheck,test,lint` zöld (két egymást követő tiszta futtatással is stabil, a fenti
outDir-javítás után). **CLI-regresszió**: `plantbase ask "..."` a séma-változás után is működik
(valós API-hívással ellenőrizve). Kézi, valós API-hívásos teszt: két egymást követő `/api/chat`
hívás ugyanazzal a `threadId`-vel — a második válasz ténylegesen az első kör kontextusára épült
(pl. "mennyibe kerül a legolcsóbb?" helyesen a korábban említett kaktuszokra vonatkozott, nem
kért vissza kategóriát); `GET /api/threads` és `GET /api/threads/:id` mindkét kört visszaadta
helyes sorrendben; érvénytelen/nem létező id-kre 400/404.
**Commit:** `feat: add Thread/Message persistence and /api/threads router`
→ megállok, kérem a tesztelést.

### G4 — `apps/web` scaffold (React + `useChat`) ✅ KÉSZ

**Kutatás közben feltárt, valódi architekturális ütközés, jóváhagyással kezelve** (nem a lenti
bullet-ök, hanem a G2/G3 `POST /api/chat` szerződés érintett): a G2/G3-ban megépített
`{ question, threadId }` body + `X-Thread-Id` response header **eltér** az AI SDK `useChat` natív
mintájától (`{ id, message }` body — csak az utolsó üzenet —, `result.pipeUIMessageStreamToResponse`

- `streamText`'s saját `onFinish` a perzisztenciához). Jóváhagyva: **a szervert alakítottuk a natív
  mintára**, nem a klienst hajlítottuk a régi szerződéshez. Ennek közvetlen következménye: `Thread.id`
  `Int` → `String` (a kliens generálja `generateId()`-vel, mielőtt az első üzenet elmenne — a szerver
  sosem talál ki saját azonosítót), újabb Prisma-migráció a már mergelt G3-sémára.

* `@nx/react` telepítve, generátor-alapú scaffold (`nx g @nx/react:application apps/web
--bundler=vite --unitTestRunner=vitest --linter=eslint --style=css --e2eTestRunner=none`).
* Tailwind v4 (`@tailwindcss/vite`, nincs `tailwind.config.js` v4-ben) + shadcn/ui (`npx
shadcn@latest init -t vite -c apps/web -y -b radix -p nova`, "Existing Project" folyamat: `@/*`
  path-alias `tsconfig.json`/`tsconfig.app.json`/`vite.config.mts`-ben).
* `apps/server/src/main.ts`: `POST /api/chat` átalakítva a natív szerződésre (`{ id, message }`,
  `convertToModelMessages`, `streamText`'s saját `onFinish` a mentéshez — **nem**
  `toUIMessageStreamResponse`-ra váltottunk, mert az Fetch `Response`-t ad vissza, amit Express
  natívan nem ért; a meglévő `pipeUIMessageStreamToResponse` + `streamText onFinish` páros
  változatlanul jó, csak a bemenet alakja változott). `GET /api/threads(/:id)` érintetlen logika,
  csak az `id` típusa string.
* `Chat` komponens (`apps/web/src/app/chat.tsx`): `useChat` + `DefaultChatTransport` +
  `prepareSendMessagesRequest` (csak az utolsó üzenetet küldi — a G-terv eredeti "DB az
  igazságforrás" döntése) + `generateId()` egy `chatId`-hoz komponens-mountoláskor.
* `docs/stack.md`, `docs/architektura.md`, `docs/tech/architecture.md`, `docs/tech/api.md`,
  `docs/ddd/model.md` frissítve.

**G4 közben talált, valódi problémák (mindegyik javítva, ebben a fázisban)**:

1. **`@ai-sdk/react` verziószámozása NEM követi az `ai`-ét**: `@ai-sdk/react@4.x` valójában
   `ai@7.x`-et vár (nem `5.x`-et, ahogy a számok alapján feltételezhető lenne) — típusütközést
   okozott a repo `ai@^5.0.0` pinnelésével szemben. Helyes pár: `@ai-sdk/react@2.x` (`ai@^5.x`
   függőséggel).
2. **`eslint-plugin-react` (a generátor `nx.configs['flat/react']`-je hozza be) nem kompatibilis
   az ESLint 10-zel** — a legfrissebb stabil kiadás (7.37.5) is lefagy (`peerDependencies` csak
   ^9.7-ig). A `react/*` szabályok explicit kikapcsolva `apps/web/eslint.config.mjs`-ben (a
   `react-hooks`/`jsx-a11y` külön csomagok, azok maradtak, `eslint-plugin-react-hooks` 7.1.1-re
   frissítve, mert az 5.0.0 ugyanígy lefagyott ESLint 10 alatt).
3. **`baseUrl` a `tsconfig.json`/`tsconfig.app.json`-ban** — a shadcn hivatalos "Existing Project"
   mintája ezt írja elő, de a repo TypeScript-verziója (`^6.0.3`) szerint deprecated (TS 7-ben
   megszűnik) — eltávolítva, csak `paths` maradt (modern TS a tsconfig könyvtárához képest oldja
   fel, `baseUrl` nélkül is).
4. **A `@nx/react:application` generátor 4200-as portot állít be alapértelmezetten**, nem az
   általános Vite-alapértelmezett 5173-at — a `CORS_ORIGIN` fallback és a `.env.example` ehhez
   igazítva mindenhol.
5. **`apps/web/package.json`-nak nincs `project.json`-ja** — a Nx projekt-nevet a package.json
   `name`-je adja, ezért `"web"` maradt (nem `@plantbase/web`), hogy a `nx serve web` stb.
   parancsok ne törjenek — tudatosan elfogadott, dokumentált eltérés a többi app elnevezési
   konvenciójától.

**Nem tesztelt, tudatosan jelezve**: ebben a környezetben nincs böngésző-automatizálási eszköz
elérhető, ezért **nem történt szó szerinti, interaktív böngészős kattintásteszt**. Amit
ellenőriztünk helyette: (a) a `POST /api/chat` natív `{ id, message }` szerződését valós `curl`-lal,
kétkörös thread-folytonossággal (ugyanaz a kérés-alak, mint amit a `useChat` ténylegesen küldene);
(b) `apps/web` `typecheck`/`build` zöld a valós `ai`/`@ai-sdk/react` típusok ellen; (c) a Vite
dev-szerver ténylegesen kiszolgálja az oldalt (`curl` `200`-at ad, a HTML tartalmazza a beágyazott
scripteket). Ez erős közvetett bizonyíték, de nem helyettesíti a tényleges vizuális/interaktív
ellenőrzést — ezt a felhasználónak kell elvégeznie (`nx serve web` + `nx serve server`).

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil. **CLI-regresszió**: `plantbase ask "..."` a `Thread.id` séma-változás után is működik
(valós API-hívással). `POST /api/chat` natív szerződés valós, kétkörös `curl`-teszttel igazolva.
A tényleges böngészős kattintásteszt a fenti okból elmaradt — l. fent.
**Commit:** `feat: scaffold apps/web with streaming chat UI`
→ megállok, kérem a tesztelést.

### G5 — Tool-kártya komponensek ✅ KÉSZ

**Pontosítás a G2 eredeti "data-tool/data-agent" megfogalmazásához képest**: nincs kézzel írt
custom data-part (G2 döntése óta ez volt a terv) — a natív AI SDK `ToolUIPart` alak
(`part.type === 'tool-runSql'` stb., `part.state`/`part.input`/`part.output`, Context7-vel
megerősítve, `/vercel/ai/ai_5_0_0`) már mindent tartalmaz, amire a kártyáknak szükségük van.

- `apps/web/src/app/tool-call.tsx` (ÚJ): `ToolCallCard` komponens — összecsukható kártya
  (`useState`-alapú nyitott/zárt állapot), magyar címkékkel (`runSql` → "🔍 Katalógus-lekérdezés",
  `listCategories` → "📋 Kategóriák", `searchKnowledge` → "🌿 Tudásbázis-keresés"), kinyitva
  `input`/`output` megjelenítéssel (JSON, ha objektum, egyébként nyers szöveg — a CLI
  `format-messages.ts` mintájára), `output-error` állapotra piros hibaszöveggel (defenzív ág — a
  meglévő tool-`execute`-wrapperek, G1, sosem dobnak kifelé, mindig szöveges eredményt adnak
  vissza hiba esetén is, tehát ez az ág a gyakorlatban nem várt, de kezelve van).
- `apps/web/src/app/chat.tsx`: a `message.parts.map` bővítve az AI SDK `isToolUIPart()` type
  guard-jával (a `ToolUIPart<UITools>` uniós típus miatt egy `part.type.startsWith('tool-')`
  string-ellenőrzés nem szűkíti le a TS-típust — ezt tényleges `typecheck`-kel találtam meg és
  javítottam a hivatalos `isToolUIPart` helperre váltva).

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil. **CLI-regresszió**: `plantbase ask "..."` működik (a helyi Postgres/OrbStack menet közben
leállt, újraindítva, utána valós API-hívással megerősítve). Valós `curl`-teszt a `POST
/api/chat`-re: a szerver ténylegesen `tool-input-available`/`tool-output-available` eseményeket
streamel a `runSql` valódi bemenetével/kimenetével — ezt fordítja a `useChat` a kliens-oldali
`tool-runSql` part-alakra, amit a `ToolCallCard` fogyaszt. **Interaktív böngészős teszt ezúttal
sem történt** — a `claude-in-chrome` eszköz megpróbálva, de nem volt kapcsolódva ebben a
munkamenetben (a felhasználó a telepítést korábban megszakította); ugyanaz a közvetett
ellenőrzési kör, mint G4-nél.
**Commit:** `feat: add tool-call visualization cards to chat UI`
→ megállok, kérem a tesztelést.

### G6 — "Új chat" gomb + history lista ✅ KÉSZ

**Context7-vel megerősített döntés**: a `useChat`-nek van beépített, hook-élettartamon belüli
id-hez-kulcsolt üzenet-cache-e, de ez egy, a kliensben még nem látott (bár a szerveren már létező)
szálra váltásnál nem töltené be automatikusan a korábbi kört — a hívó félnek kell friss
`messages`-t adnia. Emiatt **nem** a `useChat` belső cache-mechanizmusára hagyatkozunk: a `Chat`
komponens kontrollált propokat kap (`id`, `initialMessages`), és a szülő React `key={id}`
remountot használ tiszta újrainicializáláshoz szál-váltáskor — ez a hivatalos "message
persistence" minta ajánlott megközelítése is.

- `apps/web/src/app/chat.tsx`: `Chat` átalakítva kontrollált komponenssé (`id`,
  `initialMessages: UIMessage[]`, `onFinish?` propok) — a korábbi belső
  `useState(() => generateId())` megszűnt, ezt a szülő adja.
- `apps/web/src/app/thread-sidebar.tsx` (ÚJ): `ThreadSidebar` — `GET /api/threads` lekérdezése
  (mountoláskor + `refreshKey` prop változásakor), "Új chat" gomb, kattintható szál-lista
  (`updatedAt` dátummal — a `Thread`-modellben nincs cím/preview-mező, ez a tervezett scope-on
  túlmutatna), az aktív szál kiemelve.
- `apps/web/src/app/app.tsx`: `App` fogja össze a layoutot — `activeThreadId`/`initialMessages`/
  `refreshKey` állapot; "Új chat" = friss `generateId()` + üres `initialMessages`; szál-kiválasztás
  = `GET /api/threads/:id` lekérdezése, `UIMessage[]`-é alakítás, majd `activeThreadId`+
  `initialMessages` együtt frissítve; `Chat`'s `onFinish` bump-olja a `refreshKey`-t, hogy a
  sidebar frissüljön egy kör lezárultával.
- `docs/tech/architecture.md` bővítve a szál-váltás mintájával.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil (elsőre hibátlanul). **CLI-regresszió**: `plantbase ask "..."` valós API-hívással működik.
Valós `curl`-teszt: két különböző `id`-vel indított beszélgetés, `GET /api/threads` mindkettőt
listázza, `GET /api/threads/:id` visszaadja a `ThreadSidebar`/`App` által ténylegesen fogyasztott
alakban. **Interaktív böngészős teszt ezúttal sem történt** — a `claude-in-chrome` újra
megpróbálva, továbbra sem volt kapcsolódva ebben a munkamenetben; ugyanaz a közvetett ellenőrzési
kör, mint G4/G5-nél.
**Commit:** `feat: add new-chat button and thread history sidebar`
→ megállok, kérem a tesztelést.

### G7 — Tesztek + docs lezárás ✅ KÉSZ

**Context7-vel megerősítve** (`/forwardemail/supertest`): `request(app)` közvetlenül az Express
`app`-példányra megy, `app.listen()` nélkül — a supertest saját maga kezeli az efemer
szerver-életciklust egy kérésen belül.

- **Valódi, tesztelhetőséget gátló probléma találva és javítva**: `apps/server/src/main.ts`
  eredetileg modul-szinten, feltétel nélkül hívta `app.listen(PORT, ...)`-t — egy teszt-import
  valódi portot nyitott volna. Szétválasztva `apps/server/src/app.ts`-re (az Express app felépítése
  és exportja, `.listen()` NÉLKÜL) és egy vékony `main.ts`-re (`.env` betöltés + `app.listen(...)`).
- `apps/server/vitest.config.mts` (ÚJ, `environment: 'node'`, `packages/core`/`packages/db`
  mintájára) — eddig **nulla** teszt-infrastruktúra volt itt (nincs `test` Nx target sem addig).
- `apps/server/src/app.spec.ts` (ÚJ, `supertest`): `GET /api/threads` (lista), `GET
/api/threads/:id` (talált / 404), `POST /api/chat` (400 hiányzó `id`, 400 üres/hiányzó
  `message`, új thread létrehozása, meglévő thread folytatása — a korábbi kör tényleges
  betöltésével a `streamText`-hívásba). **Új Prisma-mockolási minta bevezetve** (`vi.mock('@plantbase/db',
...)`, `docs/testing-strategy.md`-ben dokumentálva) — eddig nem létezett a repóban, a meglévő
  `db-pool`-mock egy másik (nyers `pg.Pool`) modult takar.
- `apps/web`: `@testing-library/jest-dom` + `@testing-library/user-event` hozzáadva
  (`vitest-setup.ts`, `vite.config.mts` `test.setupFiles`). Három ÚJ spec: `tool-call.spec.tsx`
  (`ToolCallCard` állapotai), `thread-sidebar.spec.tsx` (`fetch`-stubbal, lista/kattintás),
  `chat.spec.tsx` (`vi.mock('@ai-sdk/react')`-tal, szöveg/tool-part renderelés, form-submit). A
  meglévő `app.spec.tsx` smoke teszt változatlan — a mélyebb lefedettséget a gyerek-komponensek
  saját tesztjei adják.
- `docs/testing-strategy.md` bővítve a fenti két új mintával (Prisma-mock, `supertest`, `apps/web`
  komponens-teszt konvenció).
- `docs/implementation/STATUS.md`: G sor ✅ Kész (ezzel a teljes G-rész, G1–G7, lezárul).
- **Tudatosan NEM ebben a körben**: `apps/cli` jelenlegi, F-ben már nevesített teszt-adóssága
  (`docs/testing-strategy.md` "Kimarad" szakasza) — ez a G-rész scope-ján kívül eső, külön tétel.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, minden új teszttel együtt (7
új `apps/server`-teszt; `apps/web`-en 10 új teszt a három új spec-fájlban, plusz a meglévő,
változatlan `app.spec.tsx` smoke teszt — 11 teszt összesen az `apps/web` projektben), két tiszta
futtatással is stabil (elsőre
hibátlanul futottak, csak lint-formázási hibák — `import/first`, üres arrow function, TS2883
hiányzó típus-annotáció — kerültek javításra, nem tesztlogikai hiba). **CLI-regresszió (G-rész
záró ellenőrzése)**: `plantbase ask "..."` valós API-hívással működik a teljes G1–G7 után. Kézi,
valós hívásos ellenőrzés: `nx serve server` ténylegesen elindul az `app.ts`/`main.ts` szétválás
után is, `curl /api/threads` 200-at ad valós adattal.
**Commit:** `test: add apps/server and apps/web tests, close out G-rész docs`
→ megállok, kérem a tesztelést.
