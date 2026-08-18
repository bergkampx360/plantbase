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

---

## J rész — Fázisok (J1–J8)

Minden fázis: saját branch → implementáció + teszt → doc-lezáró commit (ebben a fájlban) →
`ddd-audit` → megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a
ciklus, mint a korábbi részeknél (A–I). A következő fázis branch-e csak az előző PR
mergelése után indul.

### J1 — `CustomerHandoff` adatmodell + `DATABASE_URL_HANDOFF` szerepkör ⏳ Nyitott

Tervezett tartalom:

- `packages/db/prisma/schema.prisma`: új `CustomerHandoff` modell (`id`, `question`,
  `context?`, `reason` enum-jellegű string, `draftReply?`, `status` default `pending`,
  `reviewer?`, `reviewNote?`, `createdAt`, `reviewedAt?`), `@@map("customer_handoffs")`,
  dokumentáló komment a `Thread`/`KnowledgeChunk` stílusában (miért ez az egyetlen írási
  kivétel).
- Migráció (`prisma migrate dev --name add_customer_handoff`).
- `db-role-setup` skill bővítése: új szerepkör, ami kizárólag INSERT-et kap a
  `customer_handoffs` táblára (a `plantbase_ro` létrehozásának mintájára), skill
  újrafuttatása a helyi Postgresen.
- `.env.example`: új `DATABASE_URL_HANDOFF` blokk, a `DATABASE_URL_READONLY` kommentstílusát
  követve.
- `packages/db/src/index.ts`: `CustomerHandoff` típus export a `Thread` mintájára.

**Teszt:** migráció ténylegesen lefut a helyi docker-compose Postgresen; ellenőrzés, hogy az
új szerepkör kapcsolattal SELECT ne menjen át, INSERT viszont igen (kézi `psql`/pool-próba);
`pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
**Commit:** `feat: add CustomerHandoff model and insert-only DB role`
→ megállok, kérem a tesztelést.

### J2 — `requestHumanHandoff` és `searchProducts` tool-ok ⏳ Nyitott

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

### J3 — Ügyfél-rendszerprompt ⏳ Nyitott

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

### J4 — Naplózás bővítése (válaszidő, eszkaláció, perzóna) ⏳ Nyitott

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
  `persona: 'customer'`).
- `GET /api/handoffs` (query: `status`, default `pending`), `POST
  /api/handoffs/:id/approve`, `POST /api/handoffs/:id/reject` — sima Prisma RW, a
  `/api/threads/:id` guard-mintáját követve (400/404).

**Teszt:** `app.spec.ts` bővítése (supertest): sikeres közvetlen válasz-ág, sikeres
eszkaláció-ág (INSERT ellenőrzése mockolt/valós Prisma-hívással), `/api/handoffs` lista,
jóváhagyás/elutasítás státuszváltás, 400/404 ágak. `nx test server` zöld.
**Commit:** `feat: add customer chat endpoint and staff handoff review routes`
→ megállok, kérem a tesztelést.

### J6 — `apps/web`: ügyfél-chat felület ⏳ Nyitott

Tervezett tartalom:

- `apps/web/src/components/chat/chat.tsx`: `apiUrl` prop-osítása (default a jelenlegi
  `/api/chat`).
- Új `apps/web/src/app/customer-app.tsx`: `Chat apiUrl="/api/customer/chat"`, állandó
  AI-jelzés sáv, eltérő branding.
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
`customer_handoffs` tábla ellenőrzése; a belső (`/`) felület regressziómentessége.
**Commit:** `docs: HF5 — ügyfélirányú PoC leadandók (business case, mérési terv, kérdéslap)`
→ megállok, kérem a tesztelést.
