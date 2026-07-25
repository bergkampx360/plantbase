---
name: ddd-audit
description: Use before opening any pull request — checks whether the branch's changes make any docs/ file, README.md, or CLAUDE.md stale (including docs/ddd/*, docs/tech/* which may need to be created, and docs/implementation/STATUS.md), and if so, updates them in a separate commit before push.
---

# ddd-audit

Kötelező lépés minden feature branch push/PR-nyitása előtt (`docs/dev-workflow.md`, `CLAUDE.md`).

## When to run this

- Mielőtt egy branchet push-olnál és PR-t nyitnál rá.

## Steps

1. `git diff main...HEAD --stat` — a branch összes megváltozott fájlja.
2. Minden megváltozott fájlra ellenőrizd, érint-e dokumentált területet:
   - `packages/`/`apps/` struktúra változik → `docs/architektura.md`, README "Tervezett struktúra"
   - dependency/eszköz/verzió változik → `docs/stack.md`
   - `products` séma/értékkészlet változik → `docs/stack.md`, `docs/system-prompt.md` (`<schema>`)
   - git/workflow/hook-szabály változik → `docs/dev-workflow.md`, `CLAUDE.md`
   - egy implementation-plan fázis lezárul → a saját `docs/implementation/NN-*.md` fájlban ✅ Kész,
     és `docs/implementation/STATUS.md` táblázata
   - új domain-fogalom/entitás → `docs/ddd/glossary.md`, `docs/ddd/model.md` (hozd létre, ha
     még nincs)
   - infra/architektúra/API-felület módosul → `docs/tech/infra.md`, `docs/tech/architecture.md`,
     `docs/tech/api.md` (hozd létre, ha még nincs)
3. Ha bármelyik érintett docs elavult vagy hiányzik, frissítsd/hozd létre.
4. A docs-változást **külön commitban**, a feature-commit(ok)tól elválasztva, push előtt commitold:
   `docs: sync <terület> docs with <feature>`.
5. Csak ez után jöhet a push + PR nyitás.

Ha semmi nem elavult, ezt is mondd ki explicit ("docs up to date, nincs teendő") — ne hallgasd el
a lépés lefutását.
