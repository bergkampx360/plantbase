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

- **Scroll: `use-stick-to-bottom` (`useStickToBottom` hook), nem kézzel írt scroll-logika** — a
  felhasználó explicit kérése, hogy ahol lehet, kész, bevett eszközt használjunk, ne saját
  scroll-tracking kódot. Context7-vel ellenőrizve (`/stackblitz-labs/use-stick-to-bottom`,
  `1.1.6`, React `^16.8 || ^17 || ^18 || ^19` peer — kompatibilis). A hook natívan tudja a
  kért viselkedést: **csak akkor követi automatikusan az új tartalmat, ha a felhasználó már amúgy
  is a lista alján volt** (`isAtBottom`/`escapedFromLock` — ha valaki felfelé görget streamelés
  közben, nem rángatja vissza), és az `initial` opcióval a kezdeti mountoláskor (szál-váltáskor,
  mert a `Chat` `key={activeThreadId}`-vel remountol, G6 döntés) is a lista aljára ugrik. A hook
  `scrollRef`/`contentRef` párja az `apps/web/src/app/chat.tsx` meglévő `overflow-y-auto`
  üzenetlista-konténerére és a belső üzenet-wrapper `div`-re kerül — nem kell saját `useRef`/
  `useEffect`/sentinel-div.
- **Markdown-renderelés `react-markdown`+`remark-gfm`-mel, kézzel Tailwind-osztályozva, nem a
  `@tailwindcss/typography` `prose` pluginnal** — Context7-vel ellenőrizve (`/remarkjs/react-markdown`,
  `react-markdown@10.1.0`, React ≥18 peer, kompatibilis React 19-cel; `remark-gfm@4.0.1` a
  táblázat/strikethrough/lista GFM-elemekhez). A `prose` plugin alapértelmezett palettája extra
  konfiguráció nélkül nem igazodna a projekt meglévő shadcn/CSS-változó-alapú színsémájához —
  egyszerűbb néhány elemre (`p`, `strong`, `ul`/`ol`/`li`, `code`, `a`) kézzel Tailwind-osztályt
  rendelni a `components` prop-pal. **Csak az asszisztens-üzenetek** renderelődnek Markdownként — a
  user-üzenetek (amit a felhasználó ténylegesen begépelt) nyers szövegként maradnak, hogy egy
  véletlen `*`/`_` karakter ne alakuljon váratlanul formázássá.
- **A szál-cím a szerveren, az első kérdés szövegéből, csonkolással jön létre — nem külön
  LLM-összefoglalással** — a `Thread` modell kap egy nullable `title` mezőt
  (`packages/db/prisma/schema.prisma`), amit `apps/server/src/app.ts` az ÚJ thread létrehozásakor
  tölt ki (60 karakteres csonkolás, `…` jelzi a vágást). Perzisztált mező, nem minden listázáskor
  on-the-fly számított — elkerüli az extra join/lekérdezést szálanként. A kliens sosem generál
  saját maga title-t, ugyanaz az elv, mint a `Thread.id`-nál (G4) — a szerver-oldali logika az
  egyetlen hely, ami tudja, hogy egy adott üzenet az első-e a szálon. Régi, cím nélküli szálaknál a
  `ThreadSidebar` a meglévő dátum-fallbackre esik vissza.

---

## H rész — Fázisok (H1–H3)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit` → megállok
tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a ciklus, mint G1–G7-nél.

### H1 — Automatikus lescrollozás a beszélgetés végére ⏳ NYITOTT

- `apps/web/package.json`: `use-stick-to-bottom` hozzáadva.
- `apps/web/src/app/chat.tsx`: `useStickToBottom({ initial: 'instant' })` — a visszaadott
  `scrollRef` a meglévő `overflow-y-auto` üzenetlista-konténerre, a `contentRef` egy belső
  wrapper `div`-re kerül (a jelenlegi `space-y-4` osztály erre a wrapperre mozgatva).

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, ÚJ teszttel: a `Chat`
spec-ben (`apps/web/src/app/chat.spec.tsx`) egy eset, ami leellenőrzi, hogy a `use-stick-to-bottom`
tényleg be van kötve (pl. a `scrollRef`/`contentRef` a megfelelő elemekre kerül — a hook belső
scroll-fizikáját magát nem kell újratesztelni, az a könyvtár saját felelőssége). Kézi böngészős
teszt: szál kiválasztásakor a scroll a történet végén van (nem a tetején); kérdés elküldésekor és
streamelés közben a scroll követi az új tartalmat; ha streamelés közben felfelé görgetünk, NEM
rángat vissza a legaljára.
**Commit:** `feat: auto-scroll chat to the latest message`
→ megállok, kérem a tesztelést.

### H2 — Markdown-formázás az asszisztens-válaszokhoz ⏳ NYITOTT

- `apps/web/package.json`: `react-markdown`, `remark-gfm` hozzáadva.
- `apps/web/src/app/markdown.tsx` (ÚJ): `Markdown` komponens, `components` map Tailwind-osztályokkal
  a meglévő színsémára hangolva.
- `apps/web/src/app/chat.tsx`: `text` part-ok — `role === 'assistant'` esetén `<Markdown>`,
  `user`-nél változatlan nyers `<span>`.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, ÚJ tesztekkel:
`apps/web/src/app/markdown.spec.tsx` (félkövér/lista/link bemenetre a várt HTML-elem, pl.
`<strong>`/`<ul><li>`/`<a>`, jelenik meg), és a meglévő `chat.spec.tsx` kiegészítve egy esettel,
ami egy `**félkövér**`-t tartalmazó asszisztens-üzenetet renderel, és ellenőrzi, hogy `<strong>`
elemként jelenik meg, NEM nyers `**`-ként. Kézi böngészős teszt: egy kérdésre adott válaszban a
félkövér/lista formázás ténylegesen renderelt HTML-ként jelenik meg; egy user-üzenetben véletlenül
szereplő `*` karakter nem alakul formázássá.
**Commit:** `feat: render assistant responses as Markdown`
→ megállok, kérem a tesztelést.

### H3 — Szál-elnevezés az első kérdés alapján ⏳ NYITOTT

- `packages/db/prisma/schema.prisma`: `Thread.title String?` mező (nullable), migráció.
- `apps/server/src/app.ts`: az `!existingThread` ágban a `prisma.thread.create` hívás kap egy
  `title`-t a `questionText`-ből (60 karakteres csonkolás, szóhatáron, `…` a vágás jelzésére).
- `apps/web/src/app/thread-sidebar.tsx`: a `ThreadSummary` típus bővítve `title: string | null`-lal,
  a lista-elem szövege `thread.title ?? formatDate(thread.updatedAt)`.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld. **A meglévő
`apps/server/src/app.spec.ts` "creates a new thread…" esete frissítendő** — jelenleg
`expect(threadCreateMock).toHaveBeenCalledWith({ data: { id: 'new-thread' } })`-et vár, ami a
`title` mező hozzáadása után elbukna; ki kell egészíteni a várt `title`-lel, plusz egy ÚJ eset a
csonkolási logikára (egy 60 karakternél hosszabb kérdés → csonkolt, `…`-re végződő cím). **Meglévő
`thread-sidebar.spec.tsx`** frissítve/kiegészítve, hogy a mock-threadeknek van `title`-je, és a
lista ezt jeleníti meg, nem a dátumot. **CLI-regresszió**: `plantbase ask "..."` a séma-változás
után is működik. Kézi böngészős teszt: új szál nyitása után a sidebar az első kérdés szövegéből
vett címmel jelenik meg; egy régi, cím nélküli szál a dátum-fallbackkel jelenik meg továbbra is.
**Commit:** `feat: derive thread titles from the first question`
→ megállok, kérem a tesztelést.

## A most végrehajtandó lépés

Ezt a H1–H3 fázisbontást (a fenti döntésekkel együtt) beírtam ebbe az új fájlba, **mind a 3 fázist
⏳ NYITOTT jelöléssel** (bejelentés, nem implementáció — ugyanaz a minta, mint a G-rész saját
bevezetésénél). Ezután, jóváhagyás esetén, H1-től kezdve indul a tényleges implementáció — saját
branch, a fenti terv szerint.
