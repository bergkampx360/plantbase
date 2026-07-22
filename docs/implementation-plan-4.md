# Plantbase — runSql-guard finomítások, záró pontosvessző-kezelés, ask-agent integrációs teszt (E rész)

> Kurzus-melléklet, az `implementation-plan-1.md` (A–B), `implementation-plan-2.md` (C) és `implementation-plan-3.md` (D) folytatása —
> külön dokumentumként, hogy a korábbi tervek lezárt maradjanak. Ugyanazt a stílust és git-workflow
> szabályt követi.

## Kontextus

Az `implementation-plan-3.md` D1–D3 fázisai elkészültek: a `runSql` guard szigorított, tesztek futnak. Azonban
a terv kihagyott három finomítást, amelyek biztonságot és felhasználói élményt javítanak:

1. **Tartalommaszkolás (string-literálatok kizárása)**: A jelenlegi blacklist regex (`\b(insert|...)\b`) minden
   string-tartalomban is kereséseket végez. Ez azt jelenti, hogy `SELECT * FROM products WHERE name LIKE '%insert%'`
   helyesen tiltott lesz, pedig ez legitim lekérdezés. A kulcsszó-vizsgálat előtt ki kell maszkíroznunk az SQL
   string-literálakat (`'...'`), hogy csak a strukturális szóhatárokat nézzük.

2. **Záró pontosvessző normalizálás**: A jelenlegi `trimmed.includes(';')` minden pontosvesszőt tilt, beleértve
   a lezáró `;`-t a `SELECT * FROM products;` végén. Ezt normalizálni kellene: záró `;\s*$` helyett az `includes(';')`
   elutasítása után már nem lesz gond. Így `SELECT ...;` engedélyezett, de `SELECT ...; DROP TABLE` továbbra tiltott.

3. **Ask-agent szintű integrationális teszt**: Az `ask-agent.ts` már van error-handling (84–91. sorok): ha egy tool
   hibát dob, az LLM hibaüzenettel kapja meg az üzenet-előzményt. De nincs teszt, amely bizonyítja, hogy az agent-loop
   nem törik meg. Ez kritikus, mert az agent 5 iterációig futhat (`MAX_TOOL_ITERATIONS`), és a hiba-kezelésnek
   robusztusnak kell lennie.

## Rögzített döntések

- **Tartalommaszkolás-mintázat**: `/['"`]([^'"`]|\\.)*['"`]/` regex az SQL stringek kinyeréséhez, majd placeholder-rel
  helyettesítés (`''`). Ez az egyseges módszer, amely szimpla stringeket (`'...'`), dupla stringeket (`"..."`),
  és escape-elt karaktereket (`\'`, `\"`) kezel.
- **Pontosvessző normalizálás**: `trimmed.replace(/;\s*$/, '')` — csak trailing semicolon eltávolítás. Az eredményt
  vizsgálni: ha még van `;`, akkor multi-statement.
- **Ask-agent teszt**: Mock az Anthropic SDK `messages.create()` metódusára, hogy kontrollált tool-hívási szekvenciát
  szimuláljunk. Az agent-loop robuszt volta a válasz.
- **Csomag-granularitás**: 3 önálló fázis (E1–E3), saját branch → saját lokális commit → megállok
  tesztelésre → push/PR csak külön jóváhagyás után (a projekt rögzített szabálya).

## Git-workflow (átvéve, változatlanul)

1. Feature branch fázisonként, implementáció, helyi commit.
2. Megállok, kérem a tesztelést.
3. Push (és PR nyitás) csak explicit jóváhagyás után.

---

### E1 — `runSql` guard: tartalommaszkolás (string-literálatok kizárása) ⏳ NYITOTT

**Cél**: SQL string-literálatok kizárása a kulcsszó-vizsgálatból, hogy a `WHERE name LIKE '%insert%'` engedélyezett legyen.

**Módosítás** (`packages/core/src/run-sql.ts`):

- A `trimmed` query-ből: maszkírozzuk az SQL string-literálokat
  - Mintázat: `/['"`]([^'"`]|\\.)*['"`]/g` — szimpla és dupla stringek, escape-elt karakterek
  - Helyettesítés: `''` (üres string)
  - Eredmény: `masked`
- A `masked` query-n végezzük el az összes vizsgálatot:
  - `SELECT` ellenőrzés
  - Pontosvessző-tiltás (utána)
  - Blacklist regex
- Az eredeti `trimmed`-et adjuk át a `getPool().query()`-nek (a skutál SQL marad intakt)

**Teszt** (`packages/core/src/run-sql.spec.ts` után):

- ✅ Új: `'SELECT * FROM products WHERE name LIKE \'%insert%\' -> nem utasít vissza, maszkolás után átenged'`
- ✅ Új: `'SELECT * FROM products WHERE id IN (\'1\', \'drop\') -> nem utasít vissza (DROP a stringben van)'`
- Validáció: a `queryMock` az eredeti lekérdezéssel kerül meghívásra

**Commit**: `fix: mask string literals before keyword checking in runSql guard`
→ **megállok, kérem a tesztelést.**

### E2 — `runSql` guard: záró pontosvessző normalizálás ⏳ NYITOTT

**Cél**: `SELECT * FROM products;` engedélyezése, miközben `SELECT * FROM products; DROP TABLE` továbbra tiltott marad.

**Módosítás** (`packages/core/src/run-sql.ts`):

- A pontosvessző-vizsgálat előtt: normalizálás
  - `const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');`
  - Ez eltávolítja a záró `;` és az után követő whitespace-t
- A `withoutTrailingSemicolon`-t vizsgálni:
  - `if (withoutTrailingSemicolon.includes(';'))` → multi-statement error
  - Hibaüzenet: "Pontosvesszővel elválasztott több lekérdezés nem engedélyezett."
- Az eredeti `trimmed`-et adjuk át a `getPool().query()`-nek (a végső SQL marad intakt)

**Teszt** (`packages/core/src/run-sql.spec.ts` után):

- ✅ Módosít: `'SELECT * FROM products;' -> nem utasít vissza (záró ; normalizálva)'`
  - Jelenleg: "Pontosvesszővel..." hiba
  - Módosítás után: `queryMock` meghívódik, teszt zöld
- ✅ Új: `'SELECT * FROM products;  \n' -> nem utasít vissza (trailing whitespace után ;)'`
- ✅ Új: `'SELECT * FROM products; DROP TABLE' -> tiltott (belső ; után DROP)'`
  - Ez már létezik, de a normalizálás után is működnie kell

**Commit**: `fix: allow trailing semicolon in runSql queries`
→ **megállok, kérem a tesztelést.**

### E3 — Ask-agent szintű integrationális teszt ⏳ NYITOTT

**Cél**: Az agent-loop robusztus volta a tool-hibákkal szemben — egy hibás tool-hívás ne töri el az loopot.

**Új fájl** (`packages/core/src/ask-agent.spec.ts`):

Vitest `describe` blokk az `askAgent` függvényre:

1. **Test case: Tool-hiba kezelés**
   - Anthropic SDK mock: `vi.mocked(Anthropic, true)`
   - 1. iteráció: LLM válasza `tool_use` blokk (`runSql` hívás requesttel)
   - `runSql` implementáció: hibát dob (`throw new Error('Csak SELECT...')`)
   - 2. iteráció: LLM újra hívódik, az `is_error: true` toolResult-tal
   - LLM válasza: `stop_reason === 'end_turn'`, `text` blokk válasszal
   - Validáció:
     - `result.answer` nem üres
     - `result.messages.length >= 4` (user Q, assistant tool_use, user tool_results, assistant answer)
     - `result.tokenUsage.inputTokens > 0 && outputTokens > 0`

2. **Test case: Sikeres tool-hívás (kontroll)**
   - 1. iteráció: LLM `runSql` tool-hívást kér
   - `runSql` implementáció: sikeres eredményt ad vissza
   - 2. iteráció: LLM végső választ ad
   - Validáció: ugyanaz, mint fent, de `messages` obsahuje az eredményt

3. **Test case: Multi-tool iteráció (2 tool + 1 answer)**
   - 1. iteráció: LLM `listCategories` hívást kér
   - `listCategories` sikeres
   - 2. iteráció: LLM `runSql` hívást kér (a kategóriák alapján)
   - `runSql` sikeres
   - 3. iteráció: LLM végső választ ad
   - Validáció: `messages.length >= 6` (U, A1, U, A2, U, A3)

**Teszt futtatás**:
- `pnpm exec nx run core:test -- ask-agent.spec.ts`
- Mockolás: `vi.mock('@anthropic-ai/sdk')` (SDK imports)
- Pool mock: már létezik a `vi.mock('./db-pool')` az egyéb tesztekben, ez is kell

**Commit**: `test: add ask-agent integration test for tool-error handling`
→ **megállok, kérem a tesztelést.**

---

## Kimarad (tudatosan, ebben a körben NEM)

- Case-insensitive/whitespace-trükkök elleni külön fuzz-teszt-sorozat (pl. `seLeCt`, `  SELECT`).
- Unicode-tartalmat (`'你好'`) közvetlenül kezelő speciális tesztek — a regex `unicode` flag nélkül működik,
  ez elegendő.
- Nested quote-handling (`'It\'s ok'`, `"Say \\"hello\\""`) — a regex `/['"`]([^'"`]|\\.)*['"`]/` ezt kezeli.

## Critical files

- `packages/core/src/run-sql.ts` — maszkírózás, pontosvessző normalizálás
- `packages/core/src/run-sql.spec.ts` — új tesztek (E1, E2)
- `packages/core/src/ask-agent.spec.ts` — új fájl, integrationális tesztek (E3)

## Verification

- Minden fázis után: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
- E1: `SELECT * FROM products WHERE name LIKE '%insert%'` → `queryMock` meghívódik
- E2: `SELECT * FROM products;` → `queryMock` meghívódik; `SELECT ...; DROP` → error
- E3: `pnpm exec nx run core:test` → `ask-agent.spec.ts` 3 teszt zöld
  - Tool-hiba → agent-loop folytatódik, hibaüzenettel
  - Tool-sikeres → agent-loop folytatódik, eredménnyel
  - 2 tool + 1 answer → 3 iteráció, végül answer van

Nincs több nyitott kérdés ebben a részben — implementáció kezdhető E1-gyel, jóváhagyás után.
