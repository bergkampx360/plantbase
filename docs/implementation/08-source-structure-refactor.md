# Plantbase — Forráskód-struktúra átrendezése (I rész)

> Kurzus-melléklet, a `07-web-ux-improvements.md` (H rész, web UX-fejlesztések) után —
> külön dokumentumként, mert a H rész (H1–H4) lezárult, és a saját szabály szerint
> ("Új rész indításának szabálya", `docs/implementation/STATUS.md`) egy lezárt fájlba
> nem kerül új munka. Ugyanazt a stílust és git-workflow szabályt követi, mint az
> előző részek. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — I rész: forráskód-struktúra átrendezése

**Prioritás:** a projekt Nx monorepo, apps/packages szinten már jól tagolt, de két
helyen a kód laposan, egyetlen mappában halmozódik, ami rontja az áttekinthetőséget:

- `packages/core/src/` — a `rag/` almappa mellett 8 top-level fájl (`ask-agent.ts`,
  `system-prompt.ts`, `title-agent.ts`, `run-sql.ts`, `list-categories.ts`,
  `search-knowledge.ts`, `db-pool.ts`, `log-interaction.ts` + speckjeik) keveredik,
  pedig jól elkülönülő felelősségeik vannak (agent-orkesztráció / tool-ok / infra).
- `apps/web/src/app/` — az `app.tsx` root shell mellett `chat.tsx`,
  `thread-sidebar.tsx`, `tool-call.tsx` (chat-feature komponensek) laposan vannak,
  miközben `components/ui/` és `components/ai-elements/` konvenció már létezik a
  projektben.

**Cél:** témák szerinti almappákba rendezni a fenti fájlokat, a publikus API-t
(`@plantbase/core` import útvonal, komponens-viselkedés) érintetlenül hagyva, és
biztosítani, hogy a mozgatás ne törjön el semmit (típusok, tesztek, build, lint).
Tisztán strukturális átrendezés — **nincs viselkedésváltozás**.

**Döntések:**

- **Almappák témakör szerint, nem fájlonként külön mappa** — `agent/` (agent-
  orkesztráció: `ask-agent`, `system-prompt`, `title-agent`), `tools/` (agent-nek
  felkínált tool-definíciók: `run-sql`, `list-categories`, `search-knowledge`),
  `infra/` (megosztott alacsonyszintű építőelemek: `db-pool`, `log-interaction`).
  A meglévő `rag/` almappa mintáját követi (F rész óta létezik, bevált).
- **A publikus csomag-API változatlan** — `packages/core/src/index.ts` a
  csomag gyökerében marad, csak a belső import specifierei frissülnek. A
  `@plantbase/core` tsconfig path mapping nem változik, tehát `apps/server`,
  `apps/cli`, `packages/db` felől semmilyen import nem törik.
- **`git mv`-vel mozgatva**, nem törlés+új fájl — a fájl history/blame megmarad.
- **Doksi-frissítés csak élő állapot-dokumentumokban** (`docs/tech/architecture.md`,
  `docs/tech/api.md`, `docs/tech/infra.md`, `docs/stack.md`, `docs/ddd/model.md`) —
  a `docs/implementation/01-07-*.md` history-logok **változatlanul** maradnak, mert
  egy adott múltbeli állapotot dokumentálnak, nem a jelenlegit.
- **`apps/web`: a chat-feature komponensek a meglévő `components/` konvencióba
  kerülnek** (`components/chat/`), nem egy új `features/` réteg — a projektben már
  van `components/ui/` (shadcn) és `components/ai-elements/` (Vercel ai-elements),
  ugyanoda illeszkedik egy harmadik, feature-specifikus almappa.

---

## I rész — Fázisok (I1–I2)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit`
→ megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után — ugyanaz a
ciklus, mint G1–G7-nél és H1–H4-nél. I1 PR-ját mergelni kell, mielőtt az I2 branch
elindul.

### I1 — `packages/core/src` átrendezése agent/tools/infra almappákra ⏳ Nyitott

**Tervezett módosítás:**
- `git mv` az alábbi fájlokra (forrás + `.spec.ts`):
  - `src/agent/` ← `ask-agent.ts`, `system-prompt.ts`, `title-agent.ts`
  - `src/tools/` ← `run-sql.ts`, `list-categories.ts`, `search-knowledge.ts`
  - `src/infra/` ← `db-pool.ts`, `log-interaction.ts`
  - `src/rag/` — változatlan
- Belső import frissítések: `src/index.ts` re-exportjai; `rag/*.ts` fájlok
  `../db-pool` importja → `../infra/db-pool`; `agent/ask-agent.ts` importjai a
  tool-okra és `system-prompt`-ra; speckekben lévő relatív importok.
- Doksi-frissítés külön `docs:` commitban: `docs/tech/architecture.md`,
  `docs/tech/api.md`, `docs/tech/infra.md`, `docs/stack.md`.

**Teszt-terv:**
```
pnpm exec nx run-many -t typecheck,lint,test,build --projects=core,cli,server
```
Lefedi a TS-t (eltévedt importok felszínre kerülnek), ESLint-et, a teljes Vitest
suite-ot (`ask-agent`, `run-sql`, `list-categories`, `search-knowledge`,
`title-agent`, `system-prompt`, `log-interaction`, `rag/*` specek) és a
`core`/`cli`/`server` buildet. CLI-regresszió: `plantbase ask "..."` valós hívással.

**Commit:** `refactor: group packages/core/src into agent/tools/infra folders`
→ megállok, kérem a tesztelést.

### I2 — `apps/web/src/app` chat-komponensek átrendezése ⏳ Nyitott

**Tervezett módosítás:**
- `app.tsx` (+ spec) marad `apps/web/src/app/` alatt (root komponens).
- `git mv` `chat.tsx`, `thread-sidebar.tsx`, `tool-call.tsx` (+ specek) →
  `apps/web/src/components/chat/`.
- `app.tsx` importjai frissülnek (`./chat` → `../components/chat/chat` stb.).
- Doksi-frissítés külön `docs:` commitban: `docs/ddd/model.md`.

**Teszt-terv:**
```
pnpm exec nx run-many -t typecheck,lint,test,build --projects=web
```
Web specek: `app`, `chat`, `thread-sidebar`, `tool-call`. Mivel UI-t érintő
mozgatás, `nx serve web` + böngészős smoke-check (chat oldal betöltése, egy
üzenetváltás) is szükséges a build/teszt mellett.

**Commit:** `refactor: move chat feature components under components/chat`
→ megállok, kérem a tesztelést.
