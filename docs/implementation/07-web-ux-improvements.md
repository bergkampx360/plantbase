# Plantbase — Web UX-fejlesztések (H rész)

> Kurzus-melléklet, a `06-web-chat.md` (G rész, webes chat alapfunkciók) után — külön dokumentumként,
> mert a G rész (G1–G7) lezárult, és a saját szabály szerint ("Új rész indításának szabálya",
> `docs/implementation/STATUS.md`) egy lezárt fájlba nem kerül új munka. Ugyanazt a stílust és
> git-workflow szabályt követi, mint az előző részek. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — H rész: web UX-fejlesztések

**Prioritás:** a G rész lezárása után kézi teszteléskor a felhasználó négy UX-hiányosságot
jelzett a webes chat felületen (`apps/web`). Ez a rész ezeket a hiányosságokat zárja le, önálló,
kis fázisokban, ugyanazzal a fázis-ciklussal, mint G1–G7-nél.

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

---

## H rész — Fázisok (H1–H3)

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

### H2 — Markdown-formázás az asszisztens-válaszokhoz (`ai-elements` `Message`) ⏳ NYITOTT

- `npx ai-elements@latest add message` (vagy shadcn CLI-s ekvivalens) — `Message`/`MessageContent`/
  `MessageResponse` (`Streamdown`-alapú) `apps/web/src/components/ai-elements/message.tsx`-be.
- `apps/web/src/app/chat.tsx`: az üzenet-buborék `messages.map` átépül `Message`
  (`from={message.role}`) + `MessageContent` szerkezetre; a `text` part-ok `role === 'assistant'`
  esetén `<MessageResponse>`-ban, `user`-nél változatlan nyers szövegként; a tool part-ok
  (`isToolUIPart`) továbbra is a meglévő `ToolCallCard`-dal (G5, változatlan).

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, a meglévő `chat.spec.tsx`
kiegészítve egy esettel, ami egy `**félkövér**`-t tartalmazó asszisztens-üzenetet renderel, és
ellenőrzi, hogy `<strong>` elemként jelenik meg, NEM nyers `**`-ként. Kézi böngészős teszt: egy
kérdésre adott válaszban a félkövér/lista formázás ténylegesen renderelt HTML-ként jelenik meg,
streamelés közben is korrekt (nem villódzik/törik a félbeszakadt markdown-szintaxis miatt); egy
user-üzenetben véletlenül szereplő `*` karakter nem alakul formázássá.
**Commit:** `feat: render assistant responses as Markdown with ai-elements Message`
→ megállok, kérem a tesztelést.

### H3 — Szál-elnevezés az első kérdés alapján, LLM-összefoglalással ⏳ NYITOTT

- `packages/core/src/title-agent.ts` (ÚJ): `generateThreadTitle(question: string): Promise<string>`
  — egyetlen `generateText` hívás, `anthropic(resolveModel())` modellel, a `hyde.ts` mintáját
  követve. A `packages/core/src/index.ts` publikus felülete exportálja.
- `packages/db/prisma/schema.prisma`: `Thread.title String?` mező (nullable), migráció.
- `apps/server/src/app.ts`: az `!existingThread` ágban a `prisma.thread.create` hívás előtt
  meghívja a `generateThreadTitle(questionText)`-et, és az eredményt adja át `title`-ként.
- `apps/web/src/app/thread-sidebar.tsx`: a `ThreadSummary` típus bővítve `title: string | null`-lal,
  a lista-elem szövege `thread.title ?? formatDate(thread.updatedAt)`.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld. **ÚJ**
`packages/core/src/title-agent.spec.ts` — a `hyde.spec.ts` mintájára (`vi.mock('ai')` +
`vi.mock('@ai-sdk/anthropic')`), ellenőrizve, hogy a helyes promptot építi és a modell szövegét
adja vissza. **A meglévő `apps/server/src/app.spec.ts` "creates a new thread…" esete
frissítendő** — jelenleg `expect(threadCreateMock).toHaveBeenCalledWith({ data: { id: 'new-thread'
} })`-et vár, ami a `title` mező hozzáadása után elbukna; a teszt `vi.mock`-olja a
`generateThreadTitle`-t (ugyanúgy, mint a `streamText`/Prisma-mockok), és ellenőrzi, hogy a
mockolt cím ténylegesen bekerül a `thread.create` hívásba. **Meglévő `thread-sidebar.spec.tsx`**
frissítve/kiegészítve, hogy a mock-threadeknek van `title`-je, és a lista ezt jeleníti meg, nem a
dátumot. **CLI-regresszió**: `plantbase ask "..."` a séma-változás után is működik. Kézi böngészős
teszt: új szál nyitása után a sidebar egy valós, LLM-generált, értelmes rövid címmel jelenik meg
(nem félbevágott mondattal); egy régi, cím nélküli szál a dátum-fallbackkel jelenik meg továbbra is.
**Commit:** `feat: derive thread titles from the first question via a title-generation agent`
→ megállok, kérem a tesztelést.

## A most végrehajtandó lépés

Ezt a H1–H3 fázisbontást (a fenti döntésekkel együtt) beírtam ebbe az új fájlba, **mind a 3 fázist
⏳ NYITOTT jelöléssel** (bejelentés, nem implementáció — ugyanaz a minta, mint a G-rész saját
bevezetésénél). Ezután, jóváhagyás esetén, H1-től kezdve indul a tényleges implementáció — saját
branch, a fenti terv szerint.
