# Plantbase — runSql-guard szigorítás, teszt-lefedettség, plugin-döntések (D rész)

> Kurzus-melléklet, az `implementation-plan-1.md` (A–B) és `implementation-plan-2.md` (C) folytatása —
> külön dokumentumként, hogy a korábbi tervek lezárt maradjanak. Ugyanazt a stílust és git-workflow
> szabályt követi.

## Kontextus

A `runSql` tool (`packages/core/src/run-sql.ts`) jelenlegi guardja csak azt nézi, hogy a lekérdezés
`SELECT`-tel kezdődik-e. A DB-oldali read-only szerepkör (`db-role-setup` skill) mellett ez az
egyetlen kód-szintű védelem, és nincs teszt sem a guardra, sem a `listCategories`-re — a repóban
összesen két, triviális placeholder teszt fut (`index.spec.ts` × 2). A plugin-választások (`commit-commands`,
`pr-review-toolkit`, `typescript-lsp`, `project-skills`, postgres/prisma MCP) indoklása jelenleg csak a
bevezető commit-üzenetekben él, nincs egy helyen összegyűjtve.

## Rögzített döntések

- **Védelmi réteg, nem helyettesítés:** a guard szigorítása a DB read-only role mellett egy második,
  korábban buktató réteg — nem changeli az `architektura.md` 2. döntését (`pg`/`node-postgres`, nem Prisma).
- **Blacklist, nem whitelist:** rövid, explicit kulcsszó-lista (`INSERT`, `UPDATE`, `DELETE`, `DROP`,
  `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `CREATE`, `EXEC`, `EXECUTE`, `COPY`, `CALL`), szóhatáron
  (`\b`) illesztve — ne fogjon be véletlenül oszlopneveket.
- **Tesztek mockolt pool-lal:** `vi.mock('./db-pool')` — nincs valódi DB-hívás unit szinten
  (`konvenciok.md`: "Determinista, izolált tesztek").
- **Csomag-granularitás:** 3 önálló fázis (D1–D3), saját branch → saját lokális commit → megállok
  tesztelésre → push/PR csak külön jóváhagyás után (a projekt rögzített szabálya).

## Git-workflow (átvéve, változatlanul)

1. Feature branch fázisonként, implementáció, helyi commit.
2. Megállok, kérem a tesztelést.
3. Push (és PR nyitás) csak explicit jóváhagyás után.

---

### D1 — `runSql` guard szigorítása (pontosvessző-tiltás + blacklist)

- `packages/core/src/run-sql.ts`: a jelenlegi `SELECT`-ellenőrzés mellé:
  - pontosvessző-tiltás (statement-stacking ellen)
  - blacklist-regex a tiltott kulcsszavakra
- Hibaüzenetek magyarul, a jelenlegi stílushoz igazítva (`Csak SELECT lekérdezés engedélyezett.` mintájára).

**Teszt:** lásd D2 (ugyanazon a branchen készül el a guard tesztje is, mert a guard önmagában
nem demonstrálható értelmesen teszt nélkül — TDD: piros → zöld).
**Commit:** `fix: harden runSql guard against multi-statement and mutating queries`
→ **megállok, kérem a tesztelést.**

### D2 — Teszt-lefedettség: `run-sql` guard + `listCategories`

- Új `packages/core/src/run-sql.spec.ts` (mockolt `getPool`):
  - elutasítja a nem `SELECT`-tel kezdődő query-t
  - elutasítja a pontosvesszős multi-statementet
  - elutasítja a blacklistelt kulcsszót (pl. CTE-be rejtett `INSERT`)
  - érvényes `SELECT`-et átenged, meghívja a pool `query`-jét a bemenettel
  - érvénytelen Zod-inputot (üres/hiányzó `query`) elutasít
  - a pool sorait JSON stringgé alakítja
- Új `packages/core/src/list-categories.spec.ts` (mockolt `getPool`):
  - a helyes `SELECT DISTINCT category ...` query-vel hívja a poolt
  - a sorokból helyesen szűri/stringifyeli a category-tömböt
  - üres eredményre `"[]"`-t ad vissza

**Teszt:** `pnpm exec nx run core:test` zöld, az új spec fájlok lefedik a fenti eseteket.
**Commit:** `test: add coverage for runSql guard and listCategories`
→ **megállok, kérem a tesztelést.**

### D3 — Plugin-választások összefoglalója

- Új `docs/plugin-valasztasok.md`: rövid (fejlesztésenként 1-2 mondatos) összefoglaló arról, miért
  került be az egyes marketplace plugin/MCP szerver, hivatkozva a bevezető commitra
  (`commit-commands` — 05fec84, `pr-review-toolkit`/`typescript-lsp` — 76d89d2, postgres/prisma MCP — 14dbe79,
  `project-skills` — korábbi commit).
- `README.md`-ben nem duplikáljuk — csak egy rövid utaló link kerül bele, ha releváns szakasz van rá.

**Teszt:** dokumentáció-only változás, nincs automatizált teszt; review: a doc konzisztens a
`konvenciok.md` stílusával (rövid, tényszerű, nem duplikál).
**Commit:** `docs: summarize marketplace plugin and MCP server choices`
→ **megállok, kérem a tesztelést.**

---

## Kimarad (tudatosan, ebben a körben NEM)

- `pg_sleep`/`pg_shadow`-szerű, szintaktikailag `SELECT`-nek látszó edge case-ek elleni külön védelem —
  eldöntendő, hogy a blacklist vagy a DB-role szintje-e a helyes hely, külön döntés kell hozzá.
- `ask-agent.ts` szintű integrációs teszt (tool-hiba nem töri el az agent-loopot) — javasolt, de külön
  fázis, ha kell.
- Case-insensitive/whitespace-trükkök elleni külön fuzz-teszt-sorozat.

## Critical files

- `packages/core/src/run-sql.ts` — guard szigorítás (D1)
- `packages/core/src/run-sql.spec.ts` — új (D2)
- `packages/core/src/list-categories.spec.ts` — új (D2)
- `docs/plugin-valasztasok.md` — új (D3)

## Verification

- Minden fázis után: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
- D1+D2: a guard minden tiltott esetben hibát dob, minden engedélyezett esetben átenged — a spec-ek
  bizonyítják mindkét irányt.
- D3: dokumentáció áttekintve, konzisztens a meglévő `docs/` stílussal.

Nincs több nyitott kérdés ebben a részben — implementáció kezdhető D1-gyel, jóváhagyás után.
