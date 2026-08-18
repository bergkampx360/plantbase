# Plantbase — Ügyfélirányú PoC + humán jóváhagyási pont (J rész, HF5)

> Kurzus-melléklet, a `08-source-structure-refactor.md` (I rész) után — külön dokumentumként,
> mert az I rész (I1–I2) lezárult, és a saját szabály szerint ("Új rész indításának szabálya",
> `docs/implementation/STATUS.md`) egy lezárt fájlba nem kerül új munka. Ugyanazt a stílust és
> git-workflow szabályt követi, mint a korábbi részek (`docs/dev-workflow.md`). Státusz:
> `docs/implementation/STATUS.md`.

## Kontextus — J rész: ügyfélirányú PoC

**Feladat:** `docs/hf/hf5/ora12hw.pdf` (HF5, záró házi). A jelenlegi, kizárólag belső
(lakberendező-facing) agentet kell kifelé, a client ügyfelei felé fordítani: működő PoC +
döntéselőkészítő business-case anyag. Nem újraírás — a meglévő `packages/core`
agent-logikára (tool-ok, RAG, modellhívás) épül.

**Kötelező elemek** (a feladatból): (1) az új use case ≥2, kimondottan megnevezett
"fájdalmat" old meg a megadott 10-ből, és explicit kimondja, melyiket NEM; (2) a scope egy
folyamat, egy végigvitt esettel és **egy emberi jóváhagyási ponttal** — a rendszer ma
teljesen read-only, ezt a jóváhagyási pontot most kell megépíteni; (3) valós/élethű adaton,
nem előre írt válasszal fut; (4) a demó mutatja azt az esetet is, amikor a rendszer
bizonytalan és emberhez irányít; (5) 6-8 diás business-case prezentáció három kötelező
diával (adattérkép, rollout terv, mérési terv); (6) teljes mérési terv tábla + kérdéslap (6
megadott + 2 saját kérdés) a repóban.

**Kockázat-kontextus**: a HF4-es AI Act-elemzés (`docs/hf/hf4/HF4-megoldas.md`,
Határeset-elemzés 3. sora) már előre jelezte, hogy a webes UI ügyfelek felé nyitása
kockázat-ugrató tényező lenne (manipulatív minta / Art. 50 átláthatóság) — ezt a J rész
tudatosan kezeli (AI-jelzés a felületen, nincs sürgetés/dark pattern).

**Megoldandó fájdalmak**: **#1** (nincs válasz munkaidőn kívül — 24/7 chat), **#2**
(ismétlődő FAQ-k terhelik a stábot — `searchKnowledge` leveszi ezeket), **#8** (sürgős vs.
rutin triázs — a `requestHumanHandoff` külön sorba tereli a bizonytalan/szokatlan
eseteket). Explicit **nem** megoldott: #3 (új ügyfél onboarding), #4 (ügy-státusz
láthatóság), #5 (mélyebb személyre szabás), #6 (szisztematikus panasz-tanulás), #7
(szerződés/papírmunka gyorsítás), #9 (staff-staff válasz-konzisztencia — az agent maga
konzisztens, de ez nem javítja az emberi stáb közti eltérést), #10 (churn-előrejelzés).

### Döntések

1. **Web felület a jóváhagyási demóhoz, nem CLI** (felhasználói döntés) — `/staff/handoffs`
   új oldal az `apps/web`-ben, a `thread-sidebar.tsx` fetch-mintáját követve.
2. **Szűk, additív írási kivétel az NFR1 elv alól** (felhasználói döntés,
   `docs/architektura.md` 2. döntése) — új `CustomerHandoff` tábla, amibe az agent
   kizárólag INSERT-elhet, semmi máshoz nem fér írásban. A jelenlegi `plantbase_ro`
   szigorúan SELECT-only marad, nem gyengül. Új, harmadik szerepkör/kapcsolat
   (`DATABASE_URL_HANDOFF`) jön létre, ami **kizárólag INSERT**-et kaphat a
   `customer_handoffs` táblára — SELECT-et sem, semmi mást nem lát. A jóváhagyás/elutasítás
   (`status` UPDATE) sosem az agent útján megy, hanem `apps/server`-ből, sima Prisma RW
   kapcsolaton, ugyanúgy, ahogy a `Thread`/`Message` írás ma.
3. **Ügyfél-biztonságos, paraméterezett termékkeresés (`searchProducts`), NEM a nyers
   `runSql`** — publikus felületen nem akarjuk elérhetővé tenni a szabad SQL-generálást,
   még RO kapcsolaton sem (defense-in-depth, a `plantbase_ro`-elv fölött egy második réteg).
4. **Külön ügyfél-rendszerprompt** (`system-prompt-customer.ts`), a meglévő
   `system-prompt.ts` XML-tag-szerkezetét követve, de ügyfél-perzónával, AI-jelzéssel,
   dark-pattern tilalommal és explicit eszkalációs szabállyal.
5. **A naplózás (`log-interaction.ts`) additív mezőkkel bővül** (`durationMs`, `escalated`,
   `persona`) — ez adja a mérési terv "válaszidő" és "eszkalációs arány" sorainak valós
   adatforrását, új infrastruktúra nélkül. Ez a döntés egyúttal felfedi, hogy a jelenlegi
   `/api/chat` (`apps/server`) **egyáltalán nem hív `logInteraction`-t** — csak a CLI naplóz
   JSONL-be ma; az új ügyfél-végpontnál ezt pótoljuk.
6. **Nincs új router-csomag az `apps/web`-ben** — a `main.tsx` ma egyetlen `<App/>`-et
   renderel, `react-router-dom` nincs telepítve. Lean PoC-hoz `window.location.pathname`
   alapú minimál switch kerül be, nem új függőség.
7. **Nincs ügyfél-azonosítás/session-modell** — ezt explicit "nem része a rendszernek"
   pontként dokumentáljuk (README, kérdéslap), nem próbáljuk meg pótlólag, hitelesítés
   nélküli demó-célra épített PoC-ként.
8. **A `Thread` modell kap egy `origin` mezőt (`'internal' | 'customer'`, default
   `'internal'`)** — enélkül a `GET /api/threads` (amit a belső `ThreadSidebar` hív)
   szűrés nélkül **minden** threadet visszaadna, tehát az ügyfél-beszélgetések
   megkülönböztetés nélkül megjelennének a lakberendező "korábbi beszélgetések"
   listájában, mert a J5-ös `/api/customer/chat` ugyanazt a `Thread`/`Message` táblát
   használja (nincs külön ügyfél-tábla, ld. 7. döntés). A `POST /api/customer/chat`
   `origin: 'customer'`-rel hozza létre a threadet; a `GET /api/threads` alapértelmezésben
   (query nélkül, a meglévő belső hívó viselkedése változatlan marad) csak
   `origin: 'internal'`-t ad vissza — ez a valódi elhatárolás a két felhasználói kör
   előzményei között, nem csak dokumentált korlátozás. **Ugyanez vonatkozik a `GET
/api/threads/:id` részlet-végpontra is** — enélkül a lista eltűnne a sidebarból, de egy
   ismert/kitalált ügyfél-thread-id-vel a belső detail-végponton keresztül továbbra is
   lekérdezhető maradna, ami félbehagyná az elhatárolást: a belső hívó csak
   `origin: 'internal'` threadet kaphat vissza (más `origin`-re 404, ugyanúgy, mint egy nem
   létező id-re).

---

## J rész — Fázisok (J1–J8)

Minden fázis: saját branch → implementáció + teszt → doc-lezáró commit (ebben a fájlban) →
`ddd-audit` → megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a
ciklus, mint a korábbi részeknél (A–I). A következő fázis branch-e csak az előző PR
mergelése után indul.

### J1 — `CustomerHandoff` adatmodell + `DATABASE_URL_HANDOFF` szerepkör ✅ KÉSZ

**Valódi eltérések a tervhez képest, implementáció közben találva** (a G1 mintájára — a
lenti bullet-ök ehhez képest pontosítva):

- **A `plantbase_handoff` role INSERT grantja önmagában nem volt elég.** A `customer_handoffs.id`
  `autoincrement()` mezője egy Postgres `SERIAL`/sequence-re épül — a `nextval()`-hoz a role-nak
  külön `GRANT USAGE ON SEQUENCE customer_handoffs_id_seq` is kell, a tábla-szintű `INSERT` grant
  nem elég. Kézi ellenőrzéssel (`docker compose exec ... psql -U plantbase_handoff -c "INSERT
..."`) derült ki — az első próbálkozás `permission denied for sequence
customer_handoffs_id_seq` hibával bukott. Javítva: `02-handoff-role.sql` külön sort kapott
  erre, és a manuális ellenőrzés (mind a 3 eset: handoff-INSERT sikerül, handoff-SELECT bukik,
  `plantbase_ro`-SELECT bukik) újra lefutott, most már sikeresen.
- **Az ESLint `@nx/dependency-checks` szabály elakadt az új `vitest.integration.config.mts`-en**
  (import a `@nx/vite/plugins/*`-ból) — a `packages/core/eslint.config.mjs` `ignoredFiles`
  listája eddig csak a `vitest.config.{js,ts,mjs,mts}` mintát tartalmazta, nem az
  `.integration.config.mts` variánst. Bővítve.
- A `db-role-setup` skill maga (`.claude/skills/db-role-setup/SKILL.md`) is frissült — nem csak
  a tervben leírt SQL-fájl, hanem maga a runbook is (3b. lépés, harmadik szerepkör a "When to run
  this"/leíró szakaszban, bővített 5. lépés a három engedély-eset ellenőrzésére) —, hogy jövőbeli
  DB-resetek után is dokumentált maradjon, nem csak ennek a fázisnak a tervében.

Tervezett tartalom:

- `packages/db/prisma/schema.prisma`: új `CustomerHandoff` modell (`id`, `question`,
  `context?`, `reason` enum-jellegű string, `draftReply?`, `status` default `pending`,
  `reviewer?`, `reviewNote?`, `createdAt`, `reviewedAt?`), `@@map("customer_handoffs")`,
  dokumentáló komment a `Thread`/`KnowledgeChunk` stílusában (miért ez az egyetlen írási
  kivétel). Ugyanitt a `Thread` modell bővítése egy `origin` mezővel (`String`, default
  `"internal"`, `@map("origin")`) — ld. 8. döntés: enélkül a J6-os ügyfél-chat threadjei
  megkülönböztetés nélkül bekerülnének a belső `GET /api/threads` listába.
- Migráció (`prisma migrate dev --name add_customer_handoff_and_thread_origin`).
- `db-role-setup` skill bővítése: új szerepkör, ami kizárólag INSERT-et kap a
  `customer_handoffs` táblára (a `plantbase_ro` létrehozásának mintájára), skill
  újrafuttatása a helyi Postgresen. **Kritikus, eddig fel nem ismert kiegészítés**: a
  skill jelenlegi `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO
plantbase_ro` sora — mivel nincs explicit `FOR ROLE` megadva — automatikusan SELECT-et ad
  `plantbase_ro`-nak **minden, a migrációkat futtató role által ezután létrehozott
  táblára**, tehát a `customer_handoffs`-ra is, amint a migráció lefut. Enélkül a belső
  `runSql` tool (szabad, LLM-generált SELECT, a lakberendező-oldalon) alapból olvashatná az
  ügyfelek kérdéseit/panaszait és a staff válasz-vázlatait — ez aláásná a 2. döntés célját,
  ami nemcsak az ÚJ szerepkörre vonatkozik, hanem arra is, hogy a MEGLÉVŐ `plantbase_ro` se
  lássa ezt a táblát. Ezért a skill-bővítés kap egy explicit
  `REVOKE SELECT ON customer_handoffs FROM plantbase_ro;` lépést a migráció/GRANT-ok után,
  a `docker/postgres/initdb/01-readonly-role.sql`-hez hasonló, verziózott SQL-ként.
- `.env.example`: új `DATABASE_URL_HANDOFF` blokk, a `DATABASE_URL_READONLY` kommentstílusát
  követve.
- `packages/db/src/index.ts`: `CustomerHandoff` típus export a `Thread` mintájára.
- `packages/core/src/infra/db-pool.integration.spec.ts` (ÚJ): **automata** integrációs
  teszt a helyi teszt-DB ellen, három esettel: (1) a `getHandoffPool()`-lal futtatott
  `SELECT * FROM customer_handoffs` jogosultsági hibával bukjon; (2) ugyanezen a poolon egy
  `INSERT INTO customer_handoffs (...)` viszont sikerüljön; (3) a **meglévő** `getPool()`
  (`plantbase_ro`) `SELECT * FROM customer_handoffs` hívása is jogosultsági hibával
  bukjon — ez igazolja a fenti `REVOKE`-ot, hogy a belső, szabad-SQL-es `runSql` tool ne
  férjen hozzá az ügyfél-eszkalációkhoz. Ez a legérzékenyebb, biztonság-kritikus garancia a
  J részben (az agent csak INSERT-elhet, SELECT-et sem lát, és a belső agent SELECT-je sem
  ér el idáig), ezért ez sem maradhat kézi ellenőrzés.
  **Fontos elhatárolás a meglévő tesztelési stratégiától** (`docs/testing-strategy.md`):
  az ottani "Kimarad" lista explicit kimondja, hogy a **read-only** (`plantbase_ro`)
  szerepkörre nincs és nem is lesz automatizált integrációs teszt — ez tudatos döntés
  marad, ezt a fázis NEM bírálja felül. Az itt bevezetett teszt egy **másik, új réteg**
  (a `testing-strategy.md`-ben már definiált, eddig egyetlen automatizált példány nélküli
  "Integration" szint első tagja), és **nem** kerülhet a `packages/core`
  `vitest.config.mts` alap `include` mintájába (`**/*.spec.ts`) — az minden más
  `packages/core`-tesztet (és a `dev-workflow.md` szerinti `PostToolUse` Vitest-hookot)
  valódi, futó Postgres nélkül, tisztán mockolva futtat, ezt nem szabad megtörni. Ezért:
  külön fájlnév-minta (`*.integration.spec.ts`), kizárva a `vitest.config.mts` `include`
  mintájából, saját Nx/npm script alá (`test:integration`), és env-őrzéssel (ha a
  `DATABASE_URL_HANDOFF` nincs beállítva/DB nem elérhető, a teszt explicit skip-el, nem
  hamis pirossal bukik).
- `packages/core/vitest.config.mts`: `include` szűkítése úgy, hogy kizárja az
  `*.integration.spec.ts` fájlokat az alap `test` targetből; `packages/core/package.json`:
  új `test:integration` script, ami kifejezetten ezeket futtatja.

**Teszt:** migráció ténylegesen lefut a helyi docker-compose Postgresen (kézi ellenőrzés);
a fenti `db-pool.integration.spec.ts` — külön, `test:integration` scripttel futtatva —
automatán igazolja a SELECT-tiltást/INSERT-engedélyt a `DATABASE_URL_HANDOFF` szerepkörön,
ÉS hogy a meglévő `plantbase_ro` se lásson SELECT-tel a `customer_handoffs`-ra;
`pnpm exec nx run-many -t build,typecheck,test,lint` zöld (az alap `test` target
változatlanul gyors és DB-független marad).
**Commit:** `feat: add CustomerHandoff model and insert-only DB role`
→ megállok, kérem a tesztelést.

### J2 — `requestHumanHandoff` és `searchProducts` tool-ok ✅ KÉSZ

**Valódi eltérés a tervhez képest, implementáció közben találva**: az eredeti kódvázlat
`INSERT ... RETURNING id`-t használt volna, hogy a tool visszaadja a létrehozott sor
azonosítóját. **Kézi ellenőrzéssel** (nem feltételezésből) kiderült, hogy ez tévedés volt — a
Postgres a `RETURNING`-ben olvasott oszlopokra `SELECT` jogot követel meg, ami a
`plantbase_handoff` szerepkörön (J1, "SELECT-et sem lát") ténylegesen `permission denied`
hibával bukott. Javítva: a `RETURNING` teljesen elhagyva — a tool `{status: 'pending'}`-et ad
vissza azonosító nélkül, mert az agent-nek nincs is szüksége az id-re (a staff felület a saját,
Prisma RW listázásán keresztül látja a pending sorokat). Ez a szigorúbb, tisztább megoldás: a
szerepkör így **valóban, kivétel nélkül** képtelen bármit visszaolvasni, amit beírt — nem csak
a `question`/`context`/`reason` tartalmát, hanem magát az `id`-t sem.

Tervezett tartalom:

- `packages/core/src/infra/db-pool.ts`: `getHandoffPool()`, a meglévő `getWritePool()`
  mintáját követve, `DATABASE_URL_HANDOFF`-ból.
- `packages/core/src/tools/request-human-handoff.ts` (+ `.spec.ts`): a `search-knowledge.ts`
  szerkezete (`tool()` + Zod input + try/catch → hibaszöveg), de hardkódolt, paraméteres
  INSERT — a modell sosem generál SQL-t ehhez. Input: `question`, `reason` (enum:
  `weak_knowledge` | `out_of_scope` | `complaint_or_judgment`), `context?`, `draftReply?`.
- `packages/core/src/tools/search-products.ts` (+ `.spec.ts`): whitelistelt oszlop-/szűrő-
  készlet (kategória/fény/öntözés/nehézség/ár/pet_safe, fix `LIMIT`), a RO poolon, a
  `run-sql.ts`/`list-categories.ts` hibakezelési mintáját követve.
- `packages/core/src/index.ts`: exportok bővítése.

**Teszt:** `request-human-handoff.spec.ts` és `search-products.spec.ts` — sikeres hívás,
validációs hibaágak, hibás input, a meglévő tool-spec-ek lefedettségi mintáját követve
(ld. `search-knowledge.spec.ts`, `run-sql.spec.ts`). `nx test core` zöld.
**Commit:** `feat: add requestHumanHandoff and searchProducts customer tools`
→ megállok, kérem a tesztelést.

### J3 — Ügyfél-rendszerprompt ✅ KÉSZ

**Valódi eltérés a tervhez képest, implementáció közben találva**: az első teszt-verzió
`.not.toContain('runSql')` assertion-nel próbálta ellenőrizni, hogy a `runSql` tool nem
elérhető az ügyfél-perzónának — ez tévesen bukott, mert a prompt szándékosan **megnevezi** a
`runSql`-t, hogy kimondja, hogy NINCS ("nincs runSql tool, SOSEM generálj SQL-t") — ez a
kizárás explicit kimondása, nem a szó hiánya. Javítva: az assertion azt ellenőrzi, hogy a
`runSql(` hívási alak (tool-deklaráció mintája) nem szerepel, plusz hogy a kizáró mondat
ténylegesen jelen van — ez pontosabban méri azt, amit valójában garantálni akarunk.

A `docs/system-prompt-customer.md` mirror-fájl a `docs/system-prompt.md` mintáját követi
(szinkron-teszt a `.spec.ts`-ben), de **egyszerűbb formában**: mivel a customer promptban
nincs beágyazott \`\`\`sql kódblokk (nincs SQL-generálás), nem kellett a belső promptnál
használt 4↔3-backtick trükk — egyetlen \`\`\`xml fence elég.

Tervezett tartalom:

- `packages/core/src/agent/system-prompt-customer.ts` (+ `.spec.ts`): a `system-prompt.ts`
  XML-tag-szerkezete, ügyfél-perzónával, AI-jelzéssel, dark-pattern tilalommal, explicit
  eszkalációs szabállyal (a `searchKnowledge` `weak:true` egyszeri-újrapróbálkozás után,
  vagy nyilvánvalóan hatókörön kívüli/panasz-jellegű kérésnél `requestHumanHandoff`-ot hív,
  és nem generál végleges választ helyette). Elérhető tool-ok: `searchProducts`,
  `searchKnowledge`, `requestHumanHandoff` (a nyers `runSql` NEM kerül be).
- `packages/core/src/index.ts`: `SYSTEM_PROMPT_CUSTOMER` export.

**Teszt:** `system-prompt-customer.spec.ts` — tartalom-alapú assertion-ök a kötelező
elemekre (AI-jelzés jelenléte, eszkalációs szabály szövege, hogy a `runSql` nincs
megemlítve elérhető tool-ként), a `system-prompt.spec.ts` mintáján. `nx test core` zöld.
**Commit:** `feat: add customer-facing system prompt`
→ megállok, kérem a tesztelést.

### J4 — Naplózás bővítése (válaszidő, eszkaláció, perzóna) ✅ KÉSZ

A tervhez képest nem volt eltérés — az `askAgent()` `Date.now()`-os mérése és a
`persona: 'internal'` hardkódolása pontosan a tervezett módon készült el. Valós,
`plantbase ask`-os CLI-hívással ellenőrizve: a keletkezett `logs/*.jsonl` sor ténylegesen
tartalmazza a `durationMs`/`persona` mezőket (`escalated` az `askAgent`-nél nem kerül
kitöltésre — a belső toolkészletben nincs `requestHumanHandoff`, tehát sosem lehetne igaz;
J5-től a `/api/customer/chat` tölti ki ténylegesen).

Tervezett tartalom:

- `packages/core/src/infra/log-interaction.ts`: `InteractionLog` additív, opcionális
  mezőkkel bővül: `durationMs?`, `escalated?`, `persona?: 'internal' | 'customer'`.
- `packages/core/src/agent/ask-agent.ts`: `durationMs` mérése (`Date.now()` a `streamText`
  hívás körül), visszamenőleg kompatibilis (a belső CLI-persona `persona: 'internal'`-t ír).

**Teszt:** `log-interaction.spec.ts` frissítve az új mezőkre; `ask-agent.spec.ts` frissítve,
hogy a `durationMs`/`persona` ténylegesen átadódik. `nx test core` zöld.
**Commit:** `feat: extend interaction logging with duration, escalation and persona fields`
→ megállok, kérem a tesztelést.

### J5 — `apps/server`: ügyfél-chat és staff-jóváhagyási végpontok ⏳ Nyitott

Tervezett tartalom:

- `POST /api/customer/chat`: az `/api/chat` handler mintája, de `SYSTEM_PROMPT_CUSTOMER` +
  a 3 ügyfél-tool, `logInteraction` hívással (`durationMs`, `escalated` a `toolCalls`-ból,
  `persona: 'customer'`), és a threadet `origin: 'customer'`-rel hozza létre (8. döntés).
- `GET /api/threads` bővítése: alapértelmezésben (query nélkül) csak `origin: 'internal'`
  threadeket ad vissza — a meglévő belső hívó (`ThreadSidebar`) viselkedése így
  változatlan marad, csak most már ténylegesen elhatárolva az ügyfél-threadektől
  (8. döntés).
- `GET /api/threads/:id` bővítése: csak `origin: 'internal'` threadet ad vissza — ha a
  megtalált thread `origin: 'customer'`, ugyanaz a 404-ág fut, mint nem létező id-re
  (8. döntés, a lista-szűréssel szimmetrikusan).
- `GET /api/handoffs` (query: `status`, default `pending`), `POST
/api/handoffs/:id/approve`, `POST /api/handoffs/:id/reject` — sima Prisma RW, a
  `/api/threads/:id` guard-mintáját követve (400/404).

**Teszt:** `app.spec.ts` bővítése (supertest): sikeres közvetlen válasz-ág, sikeres
eszkaláció-ág — **fontos pontosítás**: a `requestHumanHandoff` tool a `getHandoffPool()`-on
(nyers `pg.Pool`, `DATABASE_URL_HANDOFF`) ír, NEM Prisma-n keresztül (2. döntés), tehát az
INSERT ellenőrzése a `getHandoffPool()` mockolásával/stubolásával történik, nem
`vi.mock('@plantbase/db')`-vel; a `GET /api/threads` `origin`-szűrése (csak internal jön
vissza query nélkül); a `GET /api/threads/:id` `origin`-szűrése (`origin: 'customer'`
thread id-jére 404, ugyanúgy, mint nem létező id-re); `/api/handoffs` lista,
jóváhagyás/elutasítás státuszváltás (ez viszont valóban Prisma RW-n megy, itt helyes a
`vi.mock('@plantbase/db')` minta); 400/404 ágak. `nx test server` zöld.
**Commit:** `feat: add customer chat endpoint and staff handoff review routes`
→ megállok, kérem a tesztelést.

### J6 — `apps/web`: ügyfél-chat felület ⏳ Nyitott

Tervezett tartalom:

- `apps/web/src/components/chat/chat.tsx`: `apiUrl` prop-osítása — a default a jelenlegi,
  ténylegesen hardkódolt `API_URL` konstans marad (`http://localhost:3001/api/chat`, teljes
  URL, nem relatív útvonal), hogy a belső `App` hívása változatlan maradjon.
- Új `apps/web/src/app/customer-app.tsx`: `Chat apiUrl="http://localhost:3001/api/customer/chat"`
  (ugyanaz a hardkódolt-host minta, mint a meglévő `API_URL`-nél), állandó AI-jelzés sáv,
  eltérő branding.
- `apps/web/src/main.tsx`: `window.location.pathname`-alapú route-switch (`/customer` →
  `CustomerApp`, egyébként a meglévő belső `App`).

**Teszt:** `chat.spec.tsx` frissítve az `apiUrl` propra; új `customer-app.spec.tsx` az
AI-jelzés és a helyes végpont-hívás ellenőrzésére, a meglévő komponens-teszt mintáján
(`vi.mock('@ai-sdk/react')`). `nx test web` zöld.
**Commit:** `feat: add customer-facing chat surface`
→ megállok, kérem a tesztelést.

### J7 — `apps/web`: staff jóváhagyási felület ⏳ Nyitott

Tervezett tartalom:

- Új `apps/web/src/app/staff-handoffs-page.tsx`: a `thread-sidebar.tsx` fetch-mintáját
  követve listázza a `pending` handoffokat (kérdés, ok, kontextus, javasolt válasz-vázlat),
  Jóváhagyás/Elutasítás gombokkal.
- `apps/web/src/main.tsx`: route-switch bővítése `/staff/handoffs`-szal.

**Teszt:** `staff-handoffs-page.spec.tsx` — `fetch`-stubbal lista-renderelés,
jóváhagyás-gomb hívja a megfelelő végpontot és frissíti a listát, a
`thread-sidebar.spec.tsx` mintáján. `nx test web` zöld.
**Commit:** `feat: add staff handoff review page`
→ megállok, kérem a tesztelést.

### J8 — Dokumentáció lezárása (HF5 leadandók) ⏳ Nyitott

Tervezett tartalom:

- `docs/architektura.md`: új, számozott döntés-bejegyzés a szűk írási kivételről.
- `docs/testing-strategy.md`: a "Kimarad" lista pontosítása — a read-only (`plantbase_ro`)
  szerepkörre vonatkozó tétel változatlanul marad (az továbbra sem automatizált, tudatos
  döntés), de bekerül egy új mondat/tétel, hogy a J1-ben bevezetett INSERT-only
  (`DATABASE_URL_HANDOFF`) szerepkörre **van** automata integrációs teszt
  (`*.integration.spec.ts`, külön `test:integration` script, a `testing-strategy.md`
  "Integration" szintjének első tényleges automatizált tagja) — enélkül a két dokumentum
  (ez a fájl és a `testing-strategy.md`) ellentmondana egymásnak.
- `README.md`: új szakasz a customer PoC-ról (mit csinál, megoldott/nem megoldott
  fájdalmak, előfeltételek, futtatás, hivatkozás a `docs/hf/hf5/`-re).
- `docs/hf/hf5/HF5-megoldas.md`: use case összefoglaló, 3 megoldott + 7 nem megoldott
  fájdalom indoklással, a végigvitt demó-forgatókönyv (A/B/C ág, ld. lent).
- `docs/hf/hf5/eloadas-vazlat.md`: 6-8 dia tartalommal (adattérkép, rollout terv, mérési
  terv összefoglaló kötelező diaként).
- `docs/hf/hf5/meresi-terv.md`: teljes mérési terv tábla, legalább egy hiba-metrikával.
- `docs/hf/hf5/qna.md`: 6 megadott + 2 saját kérdés, egy-egy bekezdésben.
- `docs/implementation/STATUS.md`: J sor ✅ Kész.

**Demó-forgatókönyv, ami a doksik alapja** (magyarul, valós adaton generált válaszokkal):

- **A ág** (közvetlen FAQ): "Sárgulnak a szobanövényem levelei, mit rontok el?" →
  `searchKnowledge`, nem-`weak` találat → közvetlen válasz, nincs handoff.
- **B ág** (hatókörön kívüli eszkaláció): "50 db pozsgás növényt szeretnék rendelni céges
  ajándéknak, egyedi árat és számlás szállítást kérnék" → `requestHumanHandoff({reason:
'out_of_scope'})` → staff jóváhagyja a `/staff/handoffs`-on.
- **C ág** (bizonytalanság-demó): gyengén fedett gondozási/kártevő téma → `searchKnowledge`
  kétszer `weak:true` → `requestHumanHandoff({reason: 'weak_knowledge'})`.

Csak a beírt kérdés választott demó-prompt — minden agent-válasz élőben generálódik a valós
seed-adaton.

**Teszt:** teljes `nx run-many -t build,typecheck,test,lint` zöld; a fenti három demó-ág
manuális, böngészős végigfuttatása (`nx serve server` + `nx serve web`); `logs/*.jsonl` és a
`customer_handoffs` tábla ellenőrzése; a belső (`/`) felület regressziómentessége — beleértve
explicit annak ellenőrzését, hogy a demó közben létrejött ügyfél-threadek NEM jelennek meg a
belső `ThreadSidebar`-ban, ÉS egy ügyfél-thread id-jét kézzel a belső `GET /api/threads/:id`
végpontra próbálva 404-et ad (8. döntés, lista- és részlet-szűrés is).
**Commit:** `docs: HF5 — ügyfélirányú PoC leadandók (business case, mérési terv, kérdéslap)`
→ megállok, kérem a tesztelést.
