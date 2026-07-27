# Plantbase — fejlesztői workflow + automatizmus

> Kurzus-melléklet. Konkrét git-szabályok, hook-konfigurációk, dokumentációs folyamat. L1 (amivel építünk): ezt is átadjuk a Claude Code-nak.

## Git

### Branching

- `main`: mindig zöld, deploy-olható. Közvetlenül main-re NEM commitolunk.
- Feature branch: `feat/<rövid-leírás>` (pl. `feat/runsql-tool`). Egyéb prefixek: `fix/`, `refactor/`, `docs/`, `chore/`.
- A kurzus checkpointjai (`stage-N`) branchek a fallbackhez.

### Commit (Conventional Commits)

Formátum: `<típus>: <leírás>`. Típusok: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`.
Példák: `feat: add read-only runSql tool`, `test: cover runSql SELECT-only guard`.

### Auto-commit

Minden befejezett, koherens lépés után kicsi, fókuszált commit (egy lépés = egy commit). Lásd a `Stop` hookot.

### PR merge

Squash merge only — a repo GitHub-beállításában a merge commit és a rebase merge le van tiltva, csak
squash engedélyezett. Egy PR összes commitja eggyé tömörül a `main`-en, hogy a history lineáris és
egyszerűen követhető maradjon. A PR-on belüli kis, fókuszált commitok (ld. Auto-commit) a review alatt
számítanak, a `main`-en nem őrződnek meg külön-külön.

## Hookok (`settings.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "f=$(jq -r '.tool_input.file_path'); pnpm prettier --write \"$f\" 2>/dev/null || true",
            "timeout": 10,
            "async": true
          },
          {
            "type": "command",
            "command": "f=$(jq -r '.tool_input.file_path'); pnpm vitest related --run \"$f\" 2>/dev/null || true",
            "timeout": 60,
            "async": true
          }
        ]
      }
    ]
  }
}
```

(A fájl-útvonalat a hook a saját stdin-jén kapott JSON-ból nyeri ki `jq`-val — nincs `$FILE`
env-változó –, és mindkét parancs elnyeli a hibát, hogy egy formázási/teszt-hiba sose törje meg
magát a szerkesztést.)

- **prettier** (PostToolUse, Edit): formázás szerkesztés után.
- **teszt** (PostToolUse, Edit): a változáshoz tartozó Vitest fut.

FONTOS: a hookok a **Claude Code (L1) akcióit** fogják meg (amit Claude szerkeszt/futtat), NEM a termék futásidejű SQL-jét. A termék read-only védelme a **DB-kapcsolat (read-only role)**, nem hook, mert a `runSql` a termék kódja, nem Claude Code tool.

## /docs (a repóban)

```
docs/
├── ddd/
│   ├── glossary.md        ubiquitous language (növény, kategória, fényigény, gondozás...)
│   └── model.md           entitások, value objectek, aggregátumok
└── tech/
    ├── infra.md           Postgres (OrbStack docker-compose), .env, a két DB-kapcsolat
    ├── architecture.md    core/apps, adat-elérés, read-only vs Prisma
    └── api.md             tool/CLI felület (ask, runSql)
```

**Ezek a fájlok jelenleg még nem léteznek** — nem csak leírás, hanem tényleges elvárás: amikor egy
változás releváns rájuk (új domain-fogalom → `ddd/glossary.md`/`model.md`; infra/architektúra/API
felület módosul → `tech/infra.md`/`architecture.md`/`api.md`), a `ddd-audit` skill létrehozza vagy
frissíti őket. Nem maradhatnak tartósan csak aspirációként a diagramban.

## Dokumentáció-frissítés

A `/docs` frissítését a **`ddd-audit` skill** végzi (git-history → docs). Ez **nem "igény szerint"
opcionális** többé, hanem kötelező lépés **minden PR nyitása előtt** (ld. `CLAUDE.md`): a skill
megvizsgálja a branch változásait, és ha bármelyik docs-fájl (`README.md`-t is beleértve) elavulttá
vált, azt **külön `docs:` commitban**, a push/PR-nyitás előtt frissíteni kell.

NEM készítünk automatizált doc-freshness Stop hookot — a `ddd-audit` skill kézzel/explicit
futtatott ellenőrzés marad, de a _mikor kell futtatni_ mostantól rögzített szabály, nem esetleges.
A CI-alapú változat a 4. órán jön (always-on / CI/CD).

Ez az implementációs terv-dokumentumok (`docs/implementation/NN-*.md`) fázisaira is érvényes: egy
fázis leírásában szereplő **"Commit:" sor csak az implementációs commitot jelöli** — a docs-frissítés
(ha a fázis érint dokumentált területet) mindig **plusz, külön** `docs:` commit, még akkor is, ha a
fázis-leírás csak egyetlen Commit sort listáz.

## Manuális DB-ellenőrzés és migrációs drift

Ha egy fázis tesztje ad hoc SQL-t futtat közvetlenül a helyi dev DB-n a Prisma migráción kívül
(pl. `CREATE EXTENSION IF NOT EXISTS vector;` annak ellenőrzésére, hogy egy image támogatja-e a
kiterjesztést — ld. F1, `docs/implementation/05-rag-pipeline.md`), az **nem hagyhat maradandó
sémaváltozást**, különben eltér a migrációs történettől, és a következő `prisma migrate dev`
drift-et észlel és reset-et kényszerít. Két elfogadott megoldás:

- az ellenőrzés tranzakcióban, rollbackkel fut (`BEGIN; ...; ROLLBACK;`), vagy
- ugyanabban a fázisban azonnal jön a tényleges Prisma migráció is, ami formalizálja a
  változást — nem marad tartósan "csak manuálisan alkalmazott" állapotban.

## Egy aktív feladat szabálya

Egyszerre csak egy feladaton dolgozunk lokálisan. Új feature branch nyitása / új feladat
elkezdése **előtt** ellenőrizni kell (`git status`, `git branch --no-merged main`), van-e már
nyitott munka-branch (commitolatlan változás, vagy main-hez képest még nem mergelt branch). Ha
igen: megállok, megnevezem a branchet és az állapotát, és explicit rákérdezek, hogy azt
folytassuk, fejezzük be előbb, vagy szándékosan párhuzamosan induljon egy másik. Új munka soha
nem indulhat csendben egy már nyitott branch felett.

## Implementációs terv-dokumentáció

Ld. `docs/implementation/STATUS.md` — ez a kanonikus státusz-index, a rész-tervek fájlstruktúrája
és az új-fájl-nyitás szabálya is ott van rögzítve (nem itt duplikálva).
