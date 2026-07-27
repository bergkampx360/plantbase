# Plantbase — Web UX-fejlesztések (H rész)

> Kurzus-melléklet, a `06-web-chat.md` (G rész, webes chat alapfunkciók) után — külön dokumentumként,
> mert a G rész (G1–G7) lezárult, és a saját szabály szerint ("Új rész indításának szabálya",
> `docs/implementation/STATUS.md`) egy lezárt fájlba nem kerül új munka. Ugyanazt a stílust és
> git-workflow szabályt követi, mint az előző részek. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — H rész: web UX-fejlesztések

**Prioritás:** a G rész lezárása után kézi teszteléskor a felhasználó négy UX-hiányosságot
jelzett a webes chat felületen (`apps/web`). Ez a rész ezeket a hiányosságokat zárja le, önálló,
kis fázisokban, ugyanazzal a fázis-ciklussal, mint G1–G7-nél. **H1 kézi tesztelése közben egy
ötödik, önálló hiányosság is előkerült** (nem regresszió, egy G3 óta fennálló, eddig
észrevétlen korlátozás) — ez lett H4, ld. lent.

**Cél:** a beszélgetés automatikusan a végére scrollozzon (szál-váltáskor és új üzenetnél/streamelés
közben is); az asszisztens-válaszok Markdown-formázva jelenjenek meg (jelenleg nyers `**`/`-`
karakterekként látszanak); a bal oldali history-sáv az első kérdés alapján nevezze el a
beszélgetéseket, ne csak dátummal jelölje.

**Döntések:**

- **Scroll + Markdown: a Vercel hivatalos `ai-elements` komponens-könyvtára, NEM saját
  hook-bekötés/wrapper** — explicit felhasználói döntés (megkérdezve, `ai-elements` mellett
  döntött): ez a shadcn/ui-ra épülő, AI SDK-hoz kifejezetten készített, hivatalos komponens-készlet
  (Context7-vel ellenőrizve, `/vercel/ai-elements`). A `Conversation`/`ConversationContent`
  komponens **belül szó szerint a `use-stick-to-bottom`-ot csomagolja** (`initial="smooth"`,
  `resize="smooth"`) — H1-hez nem kell saját hook-bekötés. A `Message`/`MessageContent`/
  `MessageResponse` komponens a `MessageResponse`-ban a `Streamdown`-t (Vercel-fejlesztésű,
  streamelés-biztos Markdown-renderelő — a félbeszakadt/még nem lezárt markdown-tokeneket is
  helyesen kezeli menet közben, nem csak a végleges, teljes szöveget) csomagolja — H2-höz nem kell
  saját `react-markdown`-wrapper.
  **Kockázat, amit végrehajtáskor elsőként ellenőrizni kell**: az `ai-elements` dokumentációja
  többször "Next.js projekt"-et ír elő előfeltételként, DE a tényleges telepítő mechanizmus a
  meglévő, már működő shadcn/ui CLI-re épül (`components.json`-t használja, ugyanúgy, mint a G4-es
  `npx shadcn@latest add input` hívás ebben a Vite-projektben) — a komponensek maguk (a Context7-vel
  látott forráskód alapján) nem tartalmaznak Next.js-specifikus importot. Emiatt valószínűleg
  működik Vite alatt is, de ez **nincs explicit dokumentálva Vite-re**, úgyhogy a H1 fázis elején,
  mielőtt a `chat.tsx` átépül a komponensekre, egy gyors próba-telepítéssel és `nx serve web`
  futtatással megerősítendő. Ha mégis Next.js-hez kötött valamelyik komponens, visszaesési terv:
  a korábban megtervezett `use-stick-to-bottom` (H1) + `react-markdown`+`remark-gfm` (H2) közvetlen
  bekötése, amit ez a döntés felváltott.
  A meglévő `ToolCallCard` (G5) változatlan marad — a `MessageContent` gyerekei között a `text`
  part-oknál `MessageResponse`, a tool part-oknál (`isToolUIPart`) továbbra is `ToolCallCard`
  renderelődik, ugyanúgy, mint most. **Csak az asszisztens-üzenetek** mennek `MessageResponse`-on
  keresztül — a user-üzenetek (amit a felhasználó ténylegesen begépelt) nyers szövegként maradnak,
  hogy egy véletlen `*`/`_` karakter ne alakuljon váratlanul formázássá.
- **A szál-cím LLM-összefoglalással jön létre, egy külön, újrahasználható "agent-stílusú"
  épületkővel `packages/core`-ban — NEM nyers karakter/mondat-csonkolással** — felülvizsgálat
  után: a csonkolás fura, félbevágott mondatokat adhatna (különösen magyar, ragozott
  szerkezeteknél). Pontosan így csinálja a ChatGPT/Claude.ai is. `packages/core/src/title-agent.ts`
  (ÚJ) — `generateThreadTitle(question: string): Promise<string>`, a meglévő `rag/hyde.ts` (F6)
  stílusát követve: egyetlen `generateText` hívás (`ai` SDK), `anthropic(resolveModel())` modellel
  (a `hyde.ts` a modellt még közvetlenül `process.env['ANTHROPIC_MODEL']`-ből olvassa ki — az új
  fájl a megosztott `resolveModel()`-t importálja, konzisztensebben), egy rövid prompt, ami 2-4
  szavas, magyar, idézőjel/írásjel nélküli címet kér. **Nem valódi tool-hívási képességű
  (`streamText`+`tool()`+`stopWhen`) agent** — a felhasználóval tisztázva: egy cím-összefoglaláshoz
  nincs mit lekérdeznie/számolnia egy toolnak, a "agent-stílus" itt azt jelenti, hogy a projekt
  meglévő, `packages/core`-beli LLM-hívó épületkövei (`hyde.ts`/`rerank.ts`) mintáját követi
  (megosztott modell-választás, önálló, tesztelhető függvény), nem egy elszigetelt, egyedi hívást.
  A `Thread` modell kap egy nullable `title` mezőt (`packages/db/prisma/schema.prisma`), amit
  `apps/server/src/app.ts` az ÚJ thread létrehozásakor tölt ki, a `generateThreadTitle()`
  eredményével. Perzisztált mező, nem minden listázáskor on-the-fly számított — elkerüli az extra
  LLM-hívást/join-t szálanként minden listázásnál. A kliens sosem generál saját maga title-t,
  ugyanaz az elv, mint a `Thread.id`-nál (G4) — a szerver-oldali logika az egyetlen hely, ami
  tudja, hogy egy adott üzenet az első-e a szálon. Régi, cím nélküli szálaknál a `ThreadSidebar` a
  meglévő dátum-fallbackre esik vissza. **Tudatos, elfogadott ár**: egy plusz, gyors (haiku)
  modellhívás szálanként egyszer, új szál nyitásakor — ezzel nő az első válasz "time to first
  token"-je egy kicsit, ha a `generateThreadTitle()` hívás a `streamText`-hívás elé, szekvenciálisan
  kerül (a legegyszerűbb, a meglévő kód-struktúrába illő megoldás; a két hívás párhuzamosítása
  `Promise.all`-lal egy lehetséges, de nem kötelező finomítás végrehajtáskor).

- **H4: tool-hívások perzisztálása, hogy szál-váltás/újratöltés után is látszódjanak** — H1 kézi
  tesztelése közben derült ki: a `ThreadSidebar`-ból egy korábbi szálra váltva a tool-kártyák
  (G5, `ToolCallCard`) nem jelennek meg, csak a végleges válasz-szöveg. Ez **nem H1 regressziója**
  — megerősítve élő teszttel, hogy egy friss kérdésnél a tool-kártya továbbra is helyesen
  megjelenik, csak a visszatöltött (szál-váltás utáni) történetnél hiányzik. Az ok: a `Message`
  tábla (G3 óta) sosem tárolt tool-hívás/-eredmény adatot, csak a végleges szöveget
  (`role`/`content`) — `apps/web/src/app/app.tsx` `toUIMessages()` emiatt mindig csak egyetlen
  `text` part-ot tud visszaépíteni egy DB-ből betöltött üzenetből. Részletek H4-nél lent.

---

## H rész — Fázisok (H1–H4)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit` → megállok
tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a ciklus, mint G1–G7-nél.

### H1 — Automatikus lescrollozás a beszélgetés végére (`ai-elements` `Conversation`) ✅ KÉSZ

**A dokumentált kockázat nem igazolódott**: `npx ai-elements@latest add conversation`, az
`apps/web` könyvtárból futtatva, ténylegesen működött — csak a `use-stick-to-bottom` dependency
került telepítésre, semmi Next.js-specifikus. (A repo-gyökérből, `-c apps/web`-fel futtatva a
shadcn CLI monorepo-workspace-felismerése nem működött; közvetlenül `apps/web`-ből futtatva igen
— ez egy H1-nél talált gyakorlati részlet, nem a "Next.js" kockázat maga.)

- `apps/web/src/components/ai-elements/conversation.tsx` (a telepítő generálta).
- `apps/web/src/app/chat.tsx`: az üzenetlista `<Conversation className="flex-1"><ConversationContent>`
  csomagolásba került, a meglévő `messages.map` renderelés változatlan.
- **Menet közben talált, valós tesztkörnyezeti hiányosság**: a `use-stick-to-bottom` belül
  `ResizeObserver`-t használ, amit a jsdom nem implementál — enélkül minden, `Chat`-et vagy
  `App`-ot renderelő teszt `ReferenceError`-ral elszállt volna. Javítva: `apps/web/vitest-setup.ts`
  egy minimál `ResizeObserverStub`-bal (`observe`/`unobserve`/`disconnect` no-op-ok). Ehhez
  `apps/web/tsconfig.spec.json`-nak is bővülnie kellett `"lib": ["ES2022", "dom"]`-mal, mert a
  `globalThis.ResizeObserver` típusa a `dom` lib nélkül nem létezett a spec-fájlok
  TypeScript-kontextusában.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil. ÚJ teszt (`chat.spec.tsx`): a `Conversation` `role="log"`-ját (a komponens saját
forráskódjából) ellenőrzi, hogy a wrapper ténylegesen be van kötve — a `use-stick-to-bottom` belső
scroll-fizikáját magát nem kell újratesztelni, az a könyvtár saját felelőssége.
**CLI-regresszió**: `plantbase ask "..."` valós API-hívással működik. **Interaktív böngészős teszt
nem történt** — a `claude-in-chrome` megpróbálva, nem volt kapcsolódva ebben a munkamenetben sem;
csak a `curl`-lal ellenőrzött, hogy a Vite dev-szerver ténylegesen kiszolgálja az oldalt (`200`).
A tényleges scroll-viselkedést (streamelés közben követi-e az új tartalmat, nem rángat-e vissza
felfelé görgetéskor) emiatt a felhasználónak kell megerősítenie böngészőben.
**Commit:** `feat: auto-scroll chat to the latest message with ai-elements Conversation`
→ megállok, kérem a tesztelést.

### H2 — Markdown-formázás az asszisztens-válaszokhoz (`ai-elements` `Message`) ✅ KÉSZ

- `npx ai-elements@latest add message`, az `apps/web` könyvtárból futtatva (H1-nél talált,
  szükséges gyakorlat) — `Message`/`MessageContent`/`MessageResponse` (`Streamdown`-alapú)
  `apps/web/src/components/ai-elements/message.tsx`-be.
- `apps/web/src/app/chat.tsx`: az üzenet-buborék `messages.map` átépült `Message`
  (`from={message.role}`) + `MessageContent` szerkezetre; a `text` part-ok `role === 'assistant'`
  esetén `<MessageResponse>`-ban, `user`-nél változatlan nyers szövegként (`whitespace-pre-wrap`
  `span`); a tool part-ok (`isToolUIPart`) továbbra is a meglévő `ToolCallCard`-dal (G5,
  változatlan).
- **Menet közben talált, valós méret-probléma és javítása**: az `ai-elements` alapértelmezett
  `MessageResponse` a `Streamdown`-t `cjk`/`code`/`math`/`mermaid` pluginokkal csomagolja —
  ez ~1,47 MB-ra (443 KB gzip) hízlalta a production build fő JS-csomagját, dozens of extra
  chunk-fájllal (shiki minden nyelvhez, katex, mermaid+cytoscape), amikre egy magyar
  növénygondozási chatnek nincs szüksége. Mivel a telepített komponens-fájl a saját kódbázisunk
  része (nem egy fekete dobozos npm-csomag), a pluginok kivehetők: a bundle ~874 KB-ra
  (258 KB gzip) csökkent, a `@streamdown/{cjk,code,math,mermaid}` csomagok eltávolítva a
  `package.json`-ból.
- **A felhasználó élő böngészős tesztje talált egy második, valós vizuális regressziót**: az
  `ai-elements` `MessageContent` alapértelmezett stílusa csak a user-üzeneteknek ad hátteres
  buborékot (`bg-secondary`), az asszisztensnek semmit (ChatGPT-stílusú, aszimmetrikus design) —
  ez eltávolította a plantbase eredeti, szimmetrikus buborék-dizájnját (mindkét oldalnak van
  háttere). Javítva: `message.tsx` `MessageContent`-je testreszabva, visszaállítva a
  `bg-primary`/`bg-muted` buborék-párt mindkét szerepre.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil. `chat.spec.tsx` két ÚJ esettel: egy `**félkövér**`-t tartalmazó asszisztens-üzenet
`[data-streamdown="strong"]` span-ként jelenik meg (a Streamdown NEM natív `<strong>`-öt használ —
ez menet közben derült ki, a terv eredetileg `<strong>`-öt feltételezett), nem nyers `**`-ként;
egy user-üzenetben szereplő `*` karakter szó szerint, formázás nélkül jelenik meg.
**CLI-regresszió**: `plantbase ask "..."` valós API-hívással működik. **Felhasználó által élőben
megerősítve böngészőben**: a Markdown-formázás helyesen jelenik meg; a talált buborék-hiány
javítás után "tökéletes"-nek minősítve.
**Commit:** `feat: render assistant responses as Markdown with ai-elements Message`
→ megállok, kérem a tesztelést.

### H3 — Szál-elnevezés az első kérdés alapján, LLM-összefoglalással ✅ KÉSZ

- `packages/core/src/title-agent.ts` (ÚJ): `generateThreadTitle(question: string): Promise<string>`
  — egyetlen `generateText` hívás, `anthropic(resolveModel())` modellel, a `hyde.ts` mintáját
  követve. A `packages/core/src/index.ts` publikus felülete exportálja.
- `packages/db/prisma/schema.prisma`: `Thread.title String?` mező (nullable), migráció (egyszerű,
  nem-destruktív `ADD COLUMN`, a `prisma migrate dev --name` nem-interaktívan is lefutott, nem
  úgy, mint a G4-es `Thread.id` típusváltásnál).
- `apps/server/src/app.ts`: az `!existingThread` ágban a `prisma.thread.create` hívás előtt
  meghívja a `generateThreadTitle(questionText)`-et, és az eredményt adja át `title`-ként.
- `apps/web/src/app/thread-sidebar.tsx`: a `ThreadSummary` típus bővítve `title: string | null`-lal,
  a lista-elem szövege `thread.title ?? formatDate(thread.updatedAt)`.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, két tiszta futtatással is
stabil. ÚJ `packages/core/src/title-agent.spec.ts` — a `hyde.spec.ts` mintájára, ellenőrizve, hogy
a helyes promptot építi és a modell (trimmelt) szövegét adja vissza; a mock-factory-nak a `tool`
exportot is tartalmaznia kellett, mert a `resolveModel()` importja `./ask-agent`-en keresztül a
három tool-definíciót is betölti modul-szinten. **A meglévő `apps/server/src/app.spec.ts` "creates
a new thread…" esete frissítve** — a `title` mezővel bővült `thread.create`-hívást és a helyes
promptot ellenőrzi; az `ai`-mock kiegészült `generateText`-tel. **Meglévő `thread-sidebar.spec.tsx`**
frissítve, hogy a mock-threadeknek van `title`-je, és a lista ezt jeleníti meg, a cím nélküli
szálaknál pedig a dátum-fallbacket.
**CLI-regresszió**: `plantbase ask "..."` a séma-változás után is működik. Valós, DB-be író
`curl`-teszt: egy új szál címe ténylegesen egy értelmes, rövid, LLM-generált cím lett
("Kaktuszaim fajtái"), nem félbevágott mondat. **Felhasználó által élőben megerősítve
böngészőben**: "nagyon szépen működik".
**Commit:** `feat: derive thread titles from the first question via a title-generation agent`
→ megállok, kérem a tesztelést.

### H4 — Tool-hívások perzisztálása szál-váltás/újratöltés után is ⏳ NYITOTT

**H1 kézi tesztelése közben talált hiányosság** (nem H1 regressziója — élő teszttel megerősítve,
hogy egy friss kérdésnél a tool-kártya helyesen megjelenik, csak a DB-ből visszatöltött
történetnél nem). A `Message` tábla G3 óta csak a végleges `role`/`content` szöveget tárolja,
tool-hívás/-eredmény adatot sosem — ezért `apps/web/src/app/app.tsx` `toUIMessages()` egy
visszatöltött üzenetből csak egyetlen `text` part-ot tud rekonstruálni, a `ToolCallCard` (G5)
nem jelenik meg.

- `packages/db/prisma/schema.prisma`: `Message` kap egy nullable `parts Json?` mezőt (Postgres
  `Json` típus Prisma-ban) — a teljes `UIMessage.parts` tömb (szöveg + tool-input/-output) tárolva,
  a meglévő `content` mező marad (egyszerű szöveges fallback/keresés/napló céljából). Migráció.
- `apps/server/src/app.ts`: a `streamText` `onFinish`-ében jelenleg csak a végleges `text` kerül
  mentésre — ki kell egészíteni úgy, hogy a lépések (`steps`) tool-hívásait/-eredményeit is
  tartalmazó, `UIMessage.parts`-kompatibilis szerkezet kerüljön a `parts` mezőbe. **Az AI SDK
  streamText `onFinish`/`steps` pontos alakja (hogyan nyerhető ki belőle egy `UIMessage.parts`-tal
  kompatibilis tömb) Context7-vel ellenőrizendő végrehajtáskor** — ez a repóban még nem használt
  minta (eddig csak a végleges szöveg mentése történt, G3).
- `apps/web/src/app/app.tsx`: `toUIMessages()` a `parts` mezőt használja, ha van (a régi, `parts`
  nélküli üzeneteknél visszaesik az eddigi, csak-szöveges rekonstrukcióra).
- `apps/server/src/app.spec.ts`, `apps/server/src/app.ts`'s `GET /api/threads/:id`: a válasz
  tartalmazza a `parts` mezőt is.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld. Meglévő `apps/server/src/app.spec.ts`
frissítve/kiegészítve, hogy az `onFinish`-ben mentett `parts` tartalmazza a tool-hívás(oka)t is, nem
csak a szöveget. **CLI-regresszió**: `plantbase ask "..."` a séma-változás után is működik. Kézi
böngészős teszt: egy tool-hívást igénylő kérdés után szál-váltás (vagy oldal-újratöltés) után is
látszik a tool-kártya, ugyanúgy, mint élőben; egy régi, `parts` nélküli szál változatlanul,
tool-kártya nélkül (csak szöveggel) jelenik meg, hiba nélkül.
**Commit:** `feat: persist tool-call parts so they survive thread switches`
→ megállok, kérem a tesztelést.

## A most végrehajtandó lépés

Ezt a H1–H4 fázisbontást (a fenti döntésekkel együtt) beírtam ebbe a fájlba — H1 már ✅ Kész
(implementálva, tesztelve, a felhasználó által böngészőben megerősítve), H2–H4 ⏳ NYITOTT
(bejelentés, nem implementáció — ugyanaz a minta, mint a G-rész saját bevezetésénél). H4 a H1
kézi tesztelése közben derült ki, közvetlenül a dokumentumba felvéve, külön jóváhagyás nélküli
implementáció nélkül. Ezután, jóváhagyás esetén, H2-től kezdve folytatódik a tényleges
implementáció — saját branch fázisonként, a fenti terv szerint.
