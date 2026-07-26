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
