# Plantbase — RAG-pipeline és webes chat (F és G rész)

> Kurzus-melléklet, az `01-environment-and-agent-core.md` (A–B), `02-ux-dx-improvements.md` (C), `03-runsql-guard-hardening.md` (D) és `04-runsql-guard-refinements.md` (E) után — külön dokumentumként, hogy az eddigi tervek lezárt maradjanak. Ugyanazt a stílust és git-workflow szabályt követi. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — F rész: RAG-pipeline (HF3 házifeladat)

A 6. órai házifeladat (HF3) egy működő RAG-pipeline-t kér: saját tudásbázis, chunking-stratégia (indoklással), teljes keresési pipeline (HyDE + rerank), grounding, golden set (nyers vs. teljes pipeline + negatív teszt), karbantartási architektúra-spec (terv + ábra), és költségbecslés.

**A/B döntés:** a Plantbase továbbvitele (B opció) — a kurzus 202 gondozási cikke a tudásbázis, ugyanebben a repóban dolgozunk.

**Rögzített döntések:**

1. **Use case:** B) Plantbase továbbvitele, ugyanebben a repóban.
2. **Multi-provider routing:** OpenAI (embedding + rerank), Anthropic (HyDE + végső válasz). **Indoklás:** OpenAI a `text-embedding-3-small` miatt (iparágilag bevett, ár/minőség arányban erős embedding-modell) és a rerankhez szükséges strukturált kimenet (`generateObject`) miatt esik a választás; a HyDE és a végső válasz Anthropicnál marad, mert az `askAgent` már eleve Anthropic-alapú — nincs ok külön providerre váltani egy olyan lépésnél, ami ugyanazt az LLM-feladatot (szöveg-generálás) végzi, amit a meglévő agent is csinál. Ez adja a valódi multi-provider orchestration-t: két provider, két különböző erősségre (OpenAI = embedding/struktúra, Anthropic = szöveg-generálás) szétosztva egy pipeline-on belül.
3. **SDK:** Vercel `ai` SDK **scope-olt kivételként** a RAG egylövéses hívásaira (embedding, HyDE, rerank); az `askAgent` tool-use loopja egyelőre még változatlan marad (F-ben). Ezt a döntést `docs/architektura.md` 3. pontja kiegészítésében dokumentáljuk.
4. **Chunking-stratégia:** H2-határon vágás, cím–szakasz kontextus-prefix, token-alapú méretezés, mondat-szintű átfedés. (Indoklás a `docs/rag-pipeline.md`-ben.)
5. **Dokumentáció-helyzet:** új fájl `docs/rag-architektura.md` (nem `ARCHITEKTURA.md`, case-insensitive FS miatt).
6. **Agent-viselkedés:** iteratív/önreflektáló keresés — a `searchKnowledge` tool pontszámokat + találatszámot ad vissza, az agent gyenge eredménynél újrafogalmazott kérdéssel újra hívhatja (MAX_TOOL_ITERATIONS korláton belül).
7. **RO/RW szétválasztás:** a tudásbázis-olvasás (`searchChunks`, agent-facing) a meglévő RO kapcsolaton megy (`DATABASE_URL_READONLY`, `packages/core/src/db-pool.ts` `getPool()`-ja) — ugyanaz az NFR1 elv, mint a `runSql`-nél (`docs/architektura.md` 2. döntés). Az ingest író-műveletei (`insertChunks`, `clearKnowledge`) egy ÚJ RW poolon futnak (`DATABASE_URL`), ami sosem az agent útján fut. A migráció után a `db-role-setup` skillt újra kell futtatni, hogy a RO szerepkör SELECT jogot kapjon a `knowledge_chunks` táblára is.

---

## F rész — Fázisok (F1–F11)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit` → megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után.

Az alábbi fázisleírások **"Commit:" sora csak az implementációs commitot** jelöli — a docs-frissítés
(pl. `docs/stack.md`, a fázis ✅ KÉSZ jelölése ebben a fájlban, `docs/tech/*`, `docs/ddd/*`) mindig
**plusz, külön** `docs:` commitba kerül, a `dev-workflow.md` és a `ddd-audit` skill szabálya szerint
(ld. F1, ahol ez elsőre egy commitba lett gyúrva, majd külön commitra bontva javítva).

A fázisbontás finomabb szemcséjű, mint az A–E részeknél megszokott átlag — egy fázis egy dolog, hogy a `docs/testing-strategy.md` réteg-elvárásai (pl. séma-változásnál `db-role-setup`, új toolnál unit teszt ugyanabban a fázisban) mindig egyértelműen egy-egy fázishoz köthetők legyenek.

### F1 — Környezet-előkészítés (docker + függőségek) ✅ KÉSZ

- `docker-compose.yml`: `postgres:17-alpine` → `pgvector/pgvector:0.8.5-pg17` (verzió-rögzített tag, ellenőrizve a Docker Hubon — a floating `pg17` helyett a reprodukálhatóság miatt).
- npm függőségek: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic` (`packages/core`).
- `.env.example`: `OPENAI_API_KEY=` hozzáadása.
- `docs/stack.md` frissítése: pgvector (DB-kiterjesztés), OpenAI (új LLM-provider), Vercel `ai` SDK felvétele a stack-elemek közé — a `ddd-audit` skill saját szabálya szerint ("dependency/eszköz/verzió változik → docs/stack.md") ez itt, a függőségek bevezetésekor esedékes, nem később.

**Teszt:** `docker compose up` sikeres, `docker exec ... psql -c "CREATE EXTENSION IF NOT EXISTS vector;"` lefut hiba nélkül.
**Commit:** `feat: add pgvector image and AI SDK dependencies`
→ **megállok, kérem a tesztelést.**

### F2 — DB-séma: `knowledge_chunks` + RO/RW szétválasztás ✅ KÉSZ

- `packages/db/prisma/schema.prisma`: `previewFeatures = ["postgresqlExtensions"]`, `datasource.extensions = [vector]`, új `KnowledgeChunk` modell (`source, title, category, chunk_index, content, embedding Unsupported("vector(1536)")?`).
- Migráció generálása (`CREATE EXTENSION vector` + `knowledge_chunks` tábla).
- **`db-role-setup` skill újrafuttatása** — a RO szerepkör (`plantbase_ro`) SELECT jogot kap a `knowledge_chunks` táblára is (7. döntés). Ez teljesíti a `docs/testing-strategy.md` előírását: _"packages/db: séma/migráció-változásnál legalább egy integration teszt VAGY a db-role-setup skill futtatásának eredménye dokumentálva a PR leírásban."_
- `docs/architektura.md` 2. döntésének kiegészítése: a tudásbázis-olvasás is a RO kapcsolaton megy, csak az ingest ír RW-n.
- **`docs/tech/infra.md` létrehozása** (a `dev-workflow.md`/`ddd-audit` skill előírja, ha még nem létezik: _"infra/architektúra/API-felület módosul → docs/tech/infra.md... hozd létre, ha még nincs"_ — a pgvector-kiterjesztés itt már valós, ezt a fájlt eddig semmi nem hozta létre, itt az első valódi trigger). Mivel ez a fájl **most jön létre először**, a `dev-workflow.md` saját meghatározása szerint ("Postgres (OrbStack docker-compose), .env, a két DB-kapcsolat") a **teljes meglévő** infrastruktúrát is le kell írnia (docker-compose, a már meglévő RO/RW két-kapcsolatos felállás), nem csak a pgvector-deltát — a második, ingest-célú RW pool leírása még NEM ide kerül, mert az csak F5-ben készül el ténylegesen (ld. F5).
- **`docs/ddd/glossary.md` és `docs/ddd/model.md` létrehozása**: mivel ezek a fájlok **most jönnek létre először**, a `dev-workflow.md` saját példája szerint ("növény, kategória, fényigény, gondozás...") a **meglévő** termék-domain szótárt is fel kell venniük, nem csak az új RAG-fogalmakat (tudás-chunk, forráscikk, cikk-kategória) — különben a glossary a domain felét lefedné csak a kezdetektől.
- **`docs/brs-plantbase.md` kiegészítése**: a jelenlegi 3. szakasz ("Hatókör, scope v1") explicit `products` katalógus-Q&A-ra szűkíti a v1 hatókört ("Kívül (későbbi órák): ... Web és voice felület"), a 6. szakasz ("Adat") pedig kimondja: "A products (növény-katalógus) tábla a domain." A RAG egy új domaint (gondozási tudásbázis) és képességet (gondozási tanácsadás) ad hozzá, ami a BRS-ben sehol nincs jelezve mint bővített hatókör — ez a projekt kanonikus üzleti-követelmény dokumentuma, ezt frissíteni kell egy rövid kiegészítéssel (a 3. szakaszhoz: a gondozási tanácsadás mostantól "Benne" van; a 4. szakaszhoz: egy új FR a `searchKnowledge`/RAG-képességre), ugyanabban a "kiegészítés, nem újraírás" stílusban, mint a többi döntés.

**Teszt:** migráció lefut tiszta DB-n; `db-role-setup` skill kimenete dokumentálva a PR-ban (RO szerepkör ténylegesen tud SELECT-elni a `knowledge_chunks`-ból, INSERT/UPDATE-et elutasítja); `docs/brs-plantbase.md` tükrözi a bővített hatókört.
**Commit:** `feat: add knowledge_chunks schema with pgvector, extend RO role grants`
→ **megállok, kérem a tesztelést.**

### F3 — A 202 cikk vendorolása ✅ KÉSZ

- Átvétel a kurzus-repóból (`sajtosistvan/ai-agent-kurzus`, `seed/knowledge/*.md`) a `packages/db/prisma/seed/knowledge/` alá — tisztán adat, saját logika nélkül.

**Teszt:** `ls packages/db/prisma/seed/knowledge/*.md | wc -l` → 202.
**Commit:** `chore: vendor plant care knowledge articles from course repo`
→ **megállok, kérem a tesztelést.**

### F4 — Chunking-stratégia + unit tesztek ✅ KÉSZ

- `packages/core/src/rag/chunk.ts` — H2-határon vágás, kontextus-prefix, token-méretezés, mondat-átfedés.
- `packages/core/src/rag/chunk.spec.ts` — unit tesztek (H2-vágás, mérethatár-csomagolás, kontextus-prefix, mondat-átfedés).
- `docs/rag-pipeline.md` — chunking-indoklás leírása.

**Teszt:** `pnpm exec nx run core:test` zöld.
**Commit:** `feat: implement chunking strategy with context prefix and token-based sizing`
→ **megállok, kérem a tesztelést.**

### F5 — Embedding + vektor-tárolás + ingest ✅ KÉSZ

- `packages/core/src/rag/embed.ts` — OpenAI `text-embedding-3-small`, `embedMany` AI SDK-val.
- `packages/core/src/rag/knowledge-store.ts` — **két pool**: `searchChunks` a meglévő RO `getPool()`-on (`db-pool.ts`, amit `run-sql.ts` is használ); `insertChunks`/`clearKnowledge` egy ÚJ RW poolon (`getWritePool()`, `DATABASE_URL`) — ez utóbbi sosem az agent útján fut.
- Ingest-script: 202 cikk feldolgozása (beolvasás → chunk → embed → RW-írás), futtatás + ellenőrzés.
- `.env.example`: a `DATABASE_URL_READONLY` komment pontosítása — eddig csak "az agent runSql tooljának kapcsolata" szerepel ott, mostantól `searchChunks` is ugyanezen a kapcsolaton megy, a komment ezt tükrözze.
- `docs/tech/infra.md` bővítése (F2-ben jött létre, csak a pgvector-kiterjesztéssel) az itt ténylegesen megjelenő második, ingest-célú RW poollal.
- `docs/testing-strategy.md` "Mockolási konvenció" szakaszának bővítése: eddig csak `vi.mock('./db-pool')` és `vi.mock('@anthropic-ai/sdk')` szerepel a "rögzített konvencióként" felsorolva — itt jelenik meg először az `ai`/`@ai-sdk/openai` mockolása (`embedMany`), ezt fel kell venni a listába, különben a dokumentum a saját állítása szerint hiányos marad.
- README "Futtatás és tesztelés" szakaszának bővítése az ingest-script futtatási lépésével (seed után, `ask` előtt) — enélkül egy friss környezetben a leírt lépéssor nem elég ahhoz, hogy a `searchKnowledge` valódi találatot adjon.

**Teszt:** ingest lefut, `knowledge_chunks` sorszáma > 0; `embed.ts`/`knowledge-store.ts` mockolt hívásokkal tesztelve (`vi.mock` az OpenAI AI SDK providerre és a pool-okra, a meglévő `run-sql.spec.ts` mintájára).
**Commit:** `feat: implement embedding and vector storage with ingest pipeline`
→ **megállok, kérem a tesztelést.**

### F6 — Keresési pipeline (HyDE + rerank) + agent-integráció + unit tesztek ✅ KÉSZ

- `packages/core/src/rag/hyde.ts` — Anthropic `generateText`, hipotetikus válasz.
- `packages/core/src/rag/rerank.ts` — OpenAI `generateObject`, strukturált pontozás (0–10).
- `packages/core/src/rag/retrieve.ts` — teljes pipeline (HyDE → embedding → pgvector-keresés → rerank → kontextus).
- `searchKnowledge` tool az `askAgent`-ben (runSql/listCategories mintájára).
- System-prompt kiegészítés: grounding-szabály (forráshivatkozás, "nincs erről infóm" ha nincs találat).
- **Önreflektáló keresés:** a tool output tartalmazza rerank-pontszámokat + találatszámot; system prompt szabálya: gyenge/kevés találat esetén az agent újrafogalmazott kérdéssel újra hívhat.
- `docs/system-prompt.md` frissítése: ez a fájl szó szerint tükrözi az élő system promptot (`<rules>`, `<tools>` tagek) — a `searchKnowledge` tool és a grounding/önreflektáló szabályok itt is bekerülnek, különben a dokumentáció és az éles prompt szétcsúszik.
- `docs/tech/architecture.md` és `docs/tech/api.md` létrehozása (`dev-workflow.md`/`ddd-audit` szabály: API-felület módosul → hozd létre, ha még nincs). Mivel ezek a fájlok **most jönnek létre először**, a `dev-workflow.md` saját meghatározása szerint a **teljes meglévő** felületet kell leírniuk, nem csak a RAG-deltát: `architecture.md` = "core/apps, adat-elérés, read-only vs Prisma" (a teljes `packages/core`/`apps/cli` felosztás, benne a `rag/` réteggel mint új darabbal), `api.md` = "tool/CLI felület (ask, runSql)" (a meglévő `ask`, `runSql`, `listCategories` mellett a `searchKnowledge` mint új tool).
- `db-role-setup` SKILL.md rövid kiegészítése: a leírás és a 6. lépés jelenleg kizárólag a `runSql`-t nevezi meg a RO-kapcsolat fogyasztójaként — a `searchKnowledge` mint második fogyasztó itt kerül bele, hogy a skill szövege ne legyen megtévesztő a jövőbeli olvasónak.
- `docs/testing-strategy.md` "Mockolási konvenció" további bővítése: a `hyde.ts` a `@ai-sdk/anthropic`-ot használja, ami a meglévő `@anthropic-ai/sdk` mocktól **különböző** csomag — ezt is fel kell venni a listába (F5-ben az `ai`/`@ai-sdk/openai` már bekerült).
- **Kötelező, ugyanebben a fázisban** (`docs/testing-strategy.md`: minden új tool/askAgent-ág unit teszttel érkezik ugyanabban a fázisban/PR-ban, nem utólag pótolva):
  - `hyde.spec.ts`, `rerank.spec.ts`, `retrieve.spec.ts` (mockolt AI SDK hívásokkal).
  - `ask-agent.spec.ts` bővítése: `searchKnowledge` sikeres hívása, hibás hívása, ÉS az önreflektáló újrahívás esete.

**Teszt:** a fenti unit tesztek zöldek; `plantbase ask "miért sárgulnak a leveleim?"` → forráshivatkozásos válasz a gondozási cikkekből.
**Commit:** `feat: implement search pipeline (HyDE, rerank, retrieve) with searchKnowledge tool and self-reflective iteration`
→ **megállok, kérem a tesztelést.**

### F7 — Golden set + negatív teszt ✅ KÉSZ

- 5–10 kérdés a növénygondozási domainből (veled jóváhagyva).
- Mindegyik kérdés lefuttatva **kétféleképpen** (HF3 szó szerinti módszertana): (1) nyers vektorkeresés (csak embedding + távolság), (2) teljes pipeline (HyDE + rerank) — a kettő összevetése táblázatban vagy debug-kimenettel dokumentálva.
- Konkrét rerank-átrendezési példa: legalább 1 kérdésnél mutatva, hogy a rerank átrendezte a sorrendet, és miért jobb az új sorrend. **Ha egyetlen kérdésnél sem rendez át semmit a rerank, ez is elfogadott eredmény** — ekkor a plan azt kéri, hogy ezt magyarázzuk meg (pl. a tudásbázis eleve tiszta H2-szegmentálása miatt a nyers vektor-hasonlóság már jó sorrendet ad).
- Legalább 1 negatív kérdés (a tudásbázisban nincs válasz) + bizonyíték, hogy az agent ezt kimondja.
- Legalább 1 kérdés az önreflektáló keresést bemutatja (első hívás → gyenge, újrafogalmazás → jobb).

**Teszt:** golden set eredménytáblázat, negatív teszt átmegy.
**Commit:** `test: add golden set and demonstrate pipeline effectiveness`
→ **megállok, kérem a tesztelést.**

### F8 — `docs/rag-architektura.md` (karbantartási spec + ábra) ✅ KÉSZ

- Terv (nem kód): dokumentum-változás észlelése (**explicit** kitérve arra is, hogy a **nem változott** dokumentumok ne vektorizálódjanak újra — ez a HF3 szövege szerint külön nevesített elvárás, nem csak általános "változás-észlelés"), új dokumentum kezelése, törölt dokumentum **chunkjainak** kezelése, újraindexelés triggere.
- Beágyazott Mermaid-ábra: forrás → változásérzékelés → chunk → embed → tárolás, törlés/módosítás útja.
- **Renderelt export a Mermaid-ből** (`docs/rag-architektura.assets/adatfolyam.png` vagy `.svg`) — a HF3 szó szerint "Miro, draw.io vagy hasonló — screenshot/export a repóba" kötelező mellékletet kér; a Mermaid marad a karbantartható forrás, de emellett egy renderelt kép is bekerül a repóba, hogy a szó szerinti előírás (statikus screenshot/export) is teljesüljön.

**Teszt:** dokumentáció áttekintve, Mermaid-ábra renderelődik a docs-ban, ÉS a statikus export-fájl is megnyílik/olvasható a repóban.
**Commit:** `docs: add RAG architecture and maintenance plan with diagram`
→ **megállok, kérem a tesztelést.**

### F9 — Költségbecslés + README + STATUS lezárás ✅ KÉSZ

- Ingest összköltség (202 cikk × átlag chunk-szám × embedding-ár).
- Egy kérdés költsége (HyDE + embedding + rerank + válasz).
- **Aktuális árakkal** (web-keresés a végrehajtás idején, nem képzésadatok).
- README bővítése, `docs/implementation/STATUS.md` F sora ✅ KÉSZ.
- README "Dokumentáció" táblázatának bővítése az F-rész alatt keletkezett összes új docs-fájllal (`docs/rag-pipeline.md`, `docs/rag-architektura.md`, és ha F2/F6-nál ténylegesen létrejöttek: `docs/ddd/glossary.md`, `docs/ddd/model.md`, `docs/tech/infra.md`, `docs/tech/architecture.md`, `docs/tech/api.md`) — explicit lépésként, nem az általános `ddd-audit` catch-all-ra bízva (a `docs/ddd`/`docs/tech` mappák korábban, az A–E rész alatt sem jöttek létre, ez itt az első alkalom, hogy ténylegesen megtörténik).
- `docs/roi.md` 5.2 szakaszának keresztellenőrzése: a jelenlegi szöveg ("Nincs extra felhő-DB költség... nem befolyásolja érdemben a megtérülést") kizárólag az Anthropic-költséget veszi számításba, a RAG (OpenAI embedding+rerank, egyszeri ingest) nélkül készült. Az itt kiszámolt RAG-költséggel újra kell értékelni, hogy az "elhanyagolható" következtetés még mindig igaz-e — ha igen, egy mondatos kiegészítéssel jelezni kell ezt a `roi.md`-ben; ha nem, a 4–6. szakasz számait frissíteni kell.

**Teszt:** költségek a README-ben, aktuális árazásra hivatkozva; a README táblázat linkjei érvényesek (nincs holt vagy hiányzó bejegyzés); `docs/roi.md` "elhanyagolható" állítása vagy megerősítve, vagy frissítve.
**Commit:** `docs: add RAG cost estimation and update README`
→ **megállok, kérem a tesztelést.**

### F10 — System prompt regressziós védőháló ✅ KÉSZ

A HF3-megfelelőségi audit (`docs/hf3-megfeleles.md`, F9 után külön elvégezve) során felmerült két
hiányzó automatizált ellenőrzés a `SYSTEM_PROMPT`-ra:

- `packages/core/src/system-prompt.spec.ts` — tartalom-asszerciók a kulcs grounding-szabályokra
  (searchKnowledge-előny gondozási kérdésnél, forráshivatkozás, `weak: true` kezelése, "nincs
  erről infóm"), a `runSql` read-only szabályra, és mindhárom tool felsorolására — ha valaki a
  jövőben véletlenül kitörli/átfogalmazza ezeket, ez a teszt elkapja, nem csak egy manuális CLI-teszt.
- Ugyanitt egy szinkron-ellenőrző teszt: a `docs/system-prompt.md` (`<role>`...`</tools>` közötti
  rész) és a `packages/core/src/system-prompt.ts` `SYSTEM_PROMPT` konstansa tartalmilag egyezik-e —
  eddig ez kizárólag kézi fegyelem volt (a fájl saját kommentje szerint "szinkronban tartandó"),
  ez a teszt automatikusan elkapja a szétcsúszást.

**Teszt:** `pnpm exec nx run core:test` zöld, a fenti asszerciókkal együtt.
**Commit:** `test: add system prompt content and docs-sync regression tests`
→ **megállok, kérem a tesztelést.**

### F11 — Coverage-alapú tesztelési rések lezárása ✅ KÉSZ

`npx vitest run --coverage` (`packages/core`) futtatásával derült ki: 94%/86%/91%
(stmt/branch/func) volt az összesített lefedettség, konkrét, nevesíthető résekkel. Pótolt tesztek:

- `packages/core/src/log-interaction.spec.ts` (ÚJ fájl) — a `logInteraction` (a `--show-prompt`/
  audit-naplózás mögötti logika) korábban **0%-on** állt, mert az `ask-agent.spec.ts` mindig
  mockolta. Most: `mkdir` a `logs/` mappára `recursive: true`-val, `appendFile` egy időbélyeges
  `.jsonl` fájlba, a tartalom valid JSON és a bemenő log-objektummal egyezik, `mkdir` az
  `appendFile` előtt fut.
- `ask-agent.spec.ts` — új teszt az "ismeretlen tool" ágra (`default: throw` a switch-ben, eddig
  soha nem hívott branch) — `is_error: true` tool-result lesz belőle, nem crash; plusz egy teszt az
  `ANTHROPIC_MODEL` env-fallback ágra (`?? 'claude-haiku-4-5'`), ami eddig sosem futott (a `.env`
  mindig beállítja tesztfutáskor).
- `hyde.spec.ts` — ugyanaz az `ANTHROPIC_MODEL`-fallback teszt a HyDE-hívásra.
- `chunk.spec.ts` — 3 új eset: frontmatter-sor kettőspont nélkül (`continue`-ág), `title` jelen de
  `category` hiányzik (a `!title || !category` jobb oldalának izolált ága), és üres/whitespace-only
  szöveg a `packIntoTokenChunks`-ban.

**Tudatosan kihagyva**: `db-pool.ts` (20% — vékony `pg.Pool`-wrapper, nincs benne érdemi logika,
minden fogyasztója mockolja, mint a projekt más infra-wrappereit sem teszteljük külön); a
`chunk.ts` `packIntoTokenChunks` végi `if (current.length > 0)` ága (strukturálisan elérhetetlen —
a ciklus után `current` sosem lehet üres, ha egyáltalán lefutott, az üres-input eset korábban,
külön ellenőrzéssel visszatér).

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; `npx vitest run --coverage`
(`packages/core`): 98%/92%/94% (stmt/branch/func), 66 teszt (előtte 57).
**Commit:** `test: close coverage gaps found in log-interaction, ask-agent, hyde, chunk`
→ **megállok, kérem a tesztelést.**

---

## G rész — Webes chat felület (F1–F11 UTÁN, külön ütemezve)

**Prioritás:** a HF3 leadási része (F1–F11) **előbb** készül el, CLI-n keresztül demonstrálva. A G rész ezután, külön fázissorozat — nem kockáztatjuk a határidős leadást.

**Cél:** webes chat UI, stream-elt válasz, kattintható válasz → agent/tool-hívás-nyomkövetés, DB-alapú kontextus, "új chat" gomb, korábbi beszélgetések listája.

**Döntések:**

- **Agent-loop átáll az AI SDK-ra** (`streamText`+`tools`) a teljes `askAgent`-ben — felülírja `docs/architektura.md` 3. döntését (indoklás: pedagógiai cél már teljesült CLI-n; web a termék-minőséget célozza).
- **CLI megmarad** párhuzamosan (`docs/architektura.md` 1. döntése).
- **Stack:** Express 5 + React 19 + Vite + Tailwind + shadcn/ui; streaming-protokoll szöveg-delta + `data-tool`/`data-agent` típusok. **Elnevezés-eltérés:** a `docs/architektura.md` fájlstruktúra-diagramja jelenleg `apps/api`-t jelöl a jövőbeli backend nevének — a G-rész itt tudatosan `apps/server`-re nevezi át (Express-konvenció, nem REST-only API, hanem streaming-szerver is), ezt a `docs/architektura.md`-ben G1-nél kell majd tükrözni.
- **Thread-perzisztencia:** DB az igazságforrás, kliens új üzenetet + `threadId`-t küld; új chat = `threadId` nélkül (régi a DB-ben marad).

**További döntések (a részletezéskor, F lezárása után rögzítve):**

1. **`askAgent` visszatérési kontraktusa marad `Promise<AskResult>`, csak belül vált AI SDK-ra.**
   **Pontosítás**: a CLI és az `apps/server` **két külön Node-folyamat** — fizikailag nem oszthatnak
   meg egyetlen `streamText`-hívást. Ami valójában megosztott: a tool-definíciók
   (`RUN_SQL_TOOL`/`LIST_CATEGORIES_TOOL`/`SEARCH_KNOWLEDGE_TOOL` AI SDK `tool()`-alakban), a
   `SYSTEM_PROMPT`, és a modell-választás logikája (`process.env['ANTHROPIC_MODEL'] ?? ...`) —
   ezeket G1 **exportálja `packages/core`-ból**, és mind az `askAgent()` (CLI-nek, megvárja a
   `streamText`-et: `result.text`/`result.usage`/`result.response.messages`), mind a G2-beli
   `apps/server` (saját, önálló `streamText`-hívást épít ugyanezekből az exportokból, de streamelő
   fogyasztással) **külön-külön** hívja meg. Nincs duplikált agent-_logika_ (a tool/prompt/modell
   definíció egy helyen van), de **két külön hívás fut** — ez a G1 explicit tesztelési
   követelménye is: az exportált építőelemeknek G2-ben zökkenőmentesen újrafelhasználhatónak kell
   lenniük, anélkül hogy `askAgent()`-et kellene streamelésre kényszeríteni.
   **Következmény**: `AskResult.messages` típusa `Anthropic.MessageParam[]`-ról AI SDK
   `ModelMessage[]`-re vált — ez **valódi, elfogadott** CLI-oldali változás (`apps/cli/src/output.ts`,
   `format-messages.ts` frissül), nem "nulla módosítás", de a CLI funkcionálisan ugyanúgy működik
   tovább ("CLI megmarad párhuzamosan" — ez működést jelent, nem érintetlen fájlokat).
2. **A tool-loop `stopWhen`/multi-step mechanizmusa váltja a kézzel írt `for` ciklust** —
   az AI SDK beépített többlépéses tool-use támogatása (`stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)`)
   pontosan ugyanazt az 5-lépéses korlátot adja, mint most, kevesebb kézzel írt kóddal.
3. **A három tool (`runSql`/`listCategories`/`searchKnowledge`) AI SDK `tool()`-ra vált** — a
   jelenlegi, kézzel duplikált zod-séma + nyers `input_schema` pár egyetlen zod-sémára egyszerűsödik
   (`tool({ description, inputSchema, execute })`), a tool-függvények belső `.parse()`-a elhagyható
   (az AI SDK már típusos, validált inputot ad).
4. **Az "ismeretlen tool" hibaág strukturálisan megszűnik** — AI SDK típusos `tools` rekordja miatt
   a modell fizikailag nem hívhat nem létező tool-t; a jelenlegi teszt (F11-ben pótolt) helyébe egy
   új teszt lép: egy tool `execute`-ja dob egy hibát, és a feltevés szerint ez AI SDK-szinten
   hiba-tool-result lesz, nem crash — **ez, a dokumentum többi hasonló pontjához hasonlóan, Context7-vel
   és G1 saját tesztjével ellenőrizendő/igazolandó tényleges végrehajtáskor**, nem előre garantált API-viselkedés.
5. **`apps/server` Express-generátor nélkül, kézzel scaffoldolva** — `@nx/express` nincs telepítve;
   a `scaffold-nx-package` skill saját fallback-szabálya szerint ("ha nincs generátor, kézzel
   scaffoldolunk, nem viszünk be nehézsúlyú generátor-plugint csak erre") `@nx/node:application`
   mintájára kézzel épül fel, Express hozzáadva függőségként.
6. **`apps/web`-hez `@nx/react` telepítése javasolt** (nem kézi scaffold) — **tudatos eltérés az 5. döntésben idézett skill-elvtől** ("ne vigyünk be nehézsúlyú generátor-plugint csak erre"):
   itt indokolt a kivétel, mert React+Vite+Tailwind+shadcn/ui együttes kézi bedrótozása lényegesen
   több, egymásra épülő konfigurációs döntést (bundler, JSX-transform, Tailwind-PostCSS-integráció,
   shadcn CLI saját projekt-felismerése) igényelne, mint egyetlen Express-appnál (ahol a meglévő
   `@nx/node:application` már 90%-ban megfelelő, csak az Express-réteg hiányzik) — a hibalehetőség
   és a karbantartási teher itt nagyobb, mint amit a "ne vigyünk be plugint" elv spórolni akar. A
   pontos generátor-parancsot és shadcn/ui-inicializálást Context7-vel ellenőrzöm G4 tényleges
   végrehajtásakor (`docs/architektura.md` 7. döntése — ismeretlen lib előtt Context7).
7. **Thread/Message Prisma-modell a `KnowledgeChunk` stílusát követi** (camelCase mező + `@map`
   snake_case oszlopra, `Int @id @default(autoincrement())`, `@@map` snake_case tábla), nem a
   `Product` all-snake_case stílusát — ez a újabb, konzisztensebb minta a séma-fájlban.
8. **A Thread/Message perzisztencia Prisma Clienten (RW), NEM a `runSql`/`searchKnowledge` RO
   poolon megy** — ez alkalmazás-adat (beszélgetés-történet), nem agent-facing tudásbázis-olvasás,
   tehát a NFR1-elv (`docs/architektura.md` 2. döntés) itt nem vonatkozik rá; nem kell RO grant a
   `db-role-setup` skillben ezekre a táblákra.
9. **A `logs/` JSONL-naplózás (`logInteraction`) megmarad változatlanul, párhuzamosan** a DB-alapú
   Thread/Message-perzisztenciával — más célt szolgál (audit/debug-trail, nem UI-history-forrás).
10. **Explicit kimondva: a CLI és a Web beszélgetés-történetei NEM egyesülnek.** A CLI-n futtatott
    kérdések a `logs/` JSONL-be írnak (9. döntés), sosem a `Thread`/`Message` táblákba — a webes
    "korábbi beszélgetések" lista (G6) csak a `Thread`-eket látja, egy CLI-munkamenet ott nem jelenik
    meg, és fordítva sincs átjárás. Ez tudatos, egyszerűsítő döntés (két független belépési pont, két
    független history-mechanizmus) — ha a jövőben egyesített history kellene, az egy külön,
    G-n túli döntés lenne, nem ennek a tervnek a része.

### G1 — `askAgent` átállítása AI SDK `streamText`+`tools`-ra ⏳ NYITOTT

- `packages/core/src/run-sql.ts`, `list-categories.ts`, `search-knowledge.ts`: a párhuzamos
  zod+raw-`input_schema` pár helyett egyetlen AI SDK `tool({ description, inputSchema: ZodSchema,
execute })` export minden toolhoz; a belső `.parse()` hívások elhagyása (AI SDK már típusos inputot ad).
- `packages/core/src/ask-agent.ts`: a kézzel írt `for` ciklus + `client.messages.create` +
  switch-dispatch helyett egyetlen `streamText({ model: anthropic(...), system: SYSTEM_PROMPT,
messages, tools: { runSql, listCategories, searchKnowledge }, stopWhen: stepCountIs(5) })` hívás;
  `AskResult.messages` típusa AI SDK `ModelMessage[]`-re vált; `tokenUsage` az AI SDK aggregált
  `usage`-ából; `generatedSql` side-channel `result.steps`-ből (a `runSql` tool-hívás argumentuma).
- `packages/core/src/log-interaction.ts`: az `InteractionLog.messages` mező típusa jelenleg
  `Anthropic.MessageParam[]` — ezt is `ModelMessage[]`-re kell váltani, különben az `ask-agent.ts`-beli
  `logInteraction({ messages: result.messages, ... })` hívás típushibás lenne. `log-interaction.spec.ts`
  (F11) teszt-fixture-ei ennek megfelelően frissülnek.
- `packages/core/src/index.ts`: a G2-nek (másik app) szüksége lesz a tool-definíciókra,
  `SYSTEM_PROMPT`-ra és a modell-választás logikájára — ezeket itt, a csomag egyetlen publikus
  belépési pontján (`konvenciok.md` szabálya) exportáljuk, nem mély/belső importtal.
- `@anthropic-ai/sdk` függőség sorsának eldöntése: G1 után `ask-agent.ts` már nem a nyers
  Anthropic-klienst hívja — ellenőrizni kell, marad-e bármi valós felhasználása
  `packages/core`-ban/`apps/cli`-ben (pl. típus-újraexport), és ha nem, a függőség eltávolítása
  (ne maradjon használaton kívüli csomag).
- `apps/cli/src/output.ts`, `format-messages.ts`: az új `ModelMessage[]` alakra igazítva (a
  `--show-prompt` kimenet funkcionálisan ugyanazt mutatja, csak az alatta lévő típus más).
- `docs/architektura.md`: 3. döntés átírása (kézzel írt loop → AI SDK `streamText`+`tools`, a régi
  szöveg jelezve, hogy G1-nél felülíródott); a fájlstruktúra-diagram `apps/api` → `apps/server`.
- `docs/stack.md`: a Vercel `ai` SDK sorának "csak... nem érinti az askAgent loopját" megjegyzése
  frissül (mostantól a teljes agent-loop is ezt használja).
- `docs/tech/architecture.md`, `docs/tech/api.md`: a tool-definíció-leírás frissítése (egy zod-séma,
  nem kettő); `apps/api` → `apps/server` javítás.
- `docs/testing-strategy.md`: új, negyedik AI-SDK-mock-mintázat dokumentálása (`streamText`+`tools`
  mockolása `ai/test` `MockLanguageModelV2`-vel — pontos API Context7-vel ellenőrizve G1
  végrehajtásakor) — a meglévő három minta (natív Anthropic, `embedMany`, `generateText`/HyDE) mellé.
- **Kötelező, ugyanebben a fázisban**: `ask-agent.spec.ts` teljes átírása az új mock-mintára,
  minden meglévő eset megtartásával (SQL-guard hiba, sikeres runSql, multi-tool iteráció,
  searchKnowledge siker/hiba, önreflektáló retry, `ANTHROPIC_MODEL` fallback) + az új
  tool-execute-hiba eset az "ismeretlen tool" teszt helyett.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; `plantbase ask "..."` CLI-n
keresztül változatlanul működik (manuális ellenőrzés, valós API-hívással).
**Commit:** `feat: migrate askAgent to AI SDK streamText with typed tools`
→ megállok, kérem a tesztelést.

### G2 — `apps/server` scaffold (Express + `/api/chat`) ⏳ NYITOTT

- `apps/server` kézi scaffold (`scaffold-nx-package` skill fallback-mintája, `@nx/node:application`
  struktúrát követve), Express hozzáadva függőségként.
- `POST /api/chat` — `{ question, threadId? }` body, a G1-ben módosított `packages/core`
  tool/system-prompt-definíciókat újrahasznosítva (nem duplikálva) egy **saját, önálló**
  streamelő `streamText`-hívás (ld. 1. döntés pontosítása — nem az `askAgent()`-en keresztül),
  AI SDK data-stream-válaszként (`text-delta` + `data-tool`/`data-agent` custom part-ok, a G-rész
  eredeti döntése szerint). A pontos AI SDK v5 streaming-response API (a válasz-objektum létrehozó
  metódusa, a custom data-part-ok írásának módja) Context7-vel ellenőrizve G2 tényleges
  végrehajtásakor (`docs/architektura.md` 7. döntése) — ez ebben a repóban még sehol nem használt API.
- Env-betöltés a szerver belépési pontján (dotenv), a CLI mintájára (`apps/cli/src/main.ts`
  ugyanezt csinálja, mert a globálisan telepített bináris nem örökli a direnv-et).
- CORS-beállítás a helyi fejlesztői Vite dev-szerverhez (G4 előkészítése).
- `docs/tech/api.md` bővítése a `/api/chat` HTTP-felülettel, a meglévő CLI/tool-felület mellé.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; kézi `curl`/Postman-teszt a
`/api/chat` végpontra, streamelt válasz látható.
**Commit:** `feat: scaffold apps/server with streaming /api/chat endpoint`
→ megállok, kérem a tesztelést.

### G3 — Prisma `Thread`/`Message` + `/api/threads` router ⏳ NYITOTT

- `packages/db/prisma/schema.prisma`: új `Thread` (`id Int @id @default(autoincrement())`,
  `createdAt`/`updatedAt` `@map`-elve) és `Message` (`id`, `threadId @map("thread_id")`, `role`,
  `content`, `createdAt`) modell, a `KnowledgeChunk` mező-stílusát követve, `@@map` snake_case
  táblanévvel, doksi-hivatkozó kommenttel.
- Migráció generálása; **nem** kell `db-role-setup` skill újrafuttatás (ezek RW-only táblák, az
  agent RO-útja nem éri el őket).
- `GET /api/threads` (lista), `GET /api/threads/:id` (üzenetekkel együtt); `POST /api/chat` (G2)
  bővítése: minden kör után a kérdés+válasz perzisztálása a `threadId`-hez (vagy új `Thread`
  létrehozása, ha nincs `threadId`).
- `docs/ddd/model.md` bővítése a `Thread`/`Message` entitásokkal.

**Teszt:** migráció lefut tiszta DB-n; `pnpm exec nx run-many -t build,typecheck,test,lint` zöld;
kézi teszt: két egymást követő `/api/chat` hívás ugyanazzal a `threadId`-vel, `GET
/api/threads/:id` visszaadja mindkét kört. **CLI-regresszió**: `packages/db` séma-változás után
`plantbase ask "..."` továbbra is működik (a `runSql`/`searchKnowledge` RO-útja nem érinti az új
táblákat, de ezt explicit ellenőrizni kell, nem csak feltételezni).
**Commit:** `feat: add Thread/Message persistence and /api/threads router`
→ megállok, kérem a tesztelést.

### G4 — `apps/web` scaffold (React + `useChat`) ⏳ NYITOTT

- `@nx/react` telepítése + generátor-alapú scaffold (`apps/web`), Vite bundlerrel, Tailwind +
  shadcn/ui inicializálva (pontos parancsok Context7-vel ellenőrizve végrehajtáskor).
- Alap chat-UI: kérdés-beviteli mező, üzenetlista, AI SDK `useChat` hook bekötve a G2 `/api/chat`
  végpontjára, streamelt válasz-megjelenítéssel.
- `docs/stack.md` bővítése: React 19, Vite, Tailwind, shadcn/ui bekerül a stack-listába.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld; kézi böngészős teszt (`nx
serve web` + `nx serve server`), egy kérdés-válasz kör streamelve látszik.
**Commit:** `feat: scaffold apps/web with streaming chat UI`
→ megállok, kérem a tesztelést.

### G5 — Tool-kártya komponensek (`data-tool`/`data-agent`) ⏳ NYITOTT

- React komponensek, amik a G2-ben streamelt `data-tool`/`data-agent` part-okat vizuálisan
  megkülönböztetve jelenítik meg (pl. összecsukható "🔧 searchKnowledge(...)" kártya a tool-hívással
  és -eredménnyel) — a CLI `--show-prompt` funkcionális megfelelője, de UI-ban.

**Teszt:** kézi böngészős teszt: egy gondozási kérdésnél (`searchKnowledge`) és egy katalógus-
kérdésnél (`runSql`) is látszik a tool-kártya a megfelelő adattal.
**Commit:** `feat: add tool-call visualization cards to chat UI`
→ megállok, kérem a tesztelést.

### G6 — "Új chat" gomb + history lista ⏳ NYITOTT

- "Új chat" gomb: törli az aktuális `threadId`-t, üres beszélgetést indít.
- Oldalsáv/lista a korábbi `Thread`-ekről (G3 `/api/threads` GET-jéből), kattintásra betölti az adott
  szál üzeneteit.

**Teszt:** kézi böngészős teszt: több beszélgetés indítása, közöttük váltás, a history helyesen
töltődik vissza.
**Commit:** `feat: add new-chat button and thread history sidebar`
→ megállok, kérem a tesztelést.

### G7 — Tesztek + docs lezárás ⏳ NYITOTT

- `apps/server`: unit/integration tesztek a `/api/chat`/`/api/threads` végpontokra (teszt-könyvtár
  kiválasztása — pl. `supertest` — Context7-vel ellenőrizve végrehajtáskor).
- `apps/web`: alap komponens-tesztek (Vitest + React Testing Library, a meglévő Vitest-konvenciót
  követve).
- `docs/implementation/STATUS.md`: G sor ✅ Kész.
- `README.md`: G-rész futtatási instrukciók (`nx serve server`, `nx serve web`), "Dokumentáció"
  táblázat bővítése.
- **Tudatosan NEM ebben a körben**: `apps/cli` jelenlegi, F-ben már nevesített teszt-adóssága
  (`docs/testing-strategy.md` "Kimarad" szakasza) — ez a G-rész scope-ján kívül eső, külön tétel.

**Teszt:** `pnpm exec nx run-many -t build,typecheck,test,lint` zöld, minden új teszttel együtt.
**CLI-regresszió (G-rész záró ellenőrzése)**: `plantbase ask "..."` és az interaktív mód is
változatlanul működik a teljes G1–G6 után — ez az egyetlen G-fázison kívül G1-en, ahol ez explicit
ellenőrzésre kerül, ezért itt, a lezáráskor kötelező, nem csak feltételezett.
**Commit:** `test: add apps/server and apps/web tests, close out G-rész docs`
→ megállok, kérem a tesztelést.

---

## Kritikus fájlok (F)

- `packages/core/src/rag/{chunk,embed,hyde,rerank,retrieve,knowledge-store}.ts` + specek
- `packages/core/src/db-pool.ts` → új `getWritePool()` az ingest RW-írásaihoz (F5, 7. döntés)
- `packages/core/src/ask-agent.ts` → `searchKnowledge` tool bekötése
- `packages/db/prisma/schema.prisma` + `migrations/` → pgvector + knowledge_chunks
- `packages/db/prisma/seed/knowledge/*.md` → 202 cikk
- `docs/rag-pipeline.md`, `docs/rag-architektura.md` + `docs/rag-architektura.assets/adatfolyam.png` (F8, renderelt export), `docs/architektura.md` (2. és 3. döntés kiegészítése), `docker-compose.yml`, `.env.example`
- `docs/stack.md` (F1, új stack-elemek: pgvector, OpenAI, Vercel `ai` SDK)
- `docs/ddd/glossary.md`, `docs/ddd/model.md` (F2, első létrehozásuk — teljes domain-szótár: meglévő + új fogalmak)
- `docs/tech/infra.md` (F2, első létrehozása — meglévő infra + pgvector; F5-ben bővül a második RW poollal)
- `docs/tech/architecture.md`, `docs/tech/api.md` (F6, első létrehozásuk — teljes core/apps felület + `rag/` réteg, teljes tool-felület + `searchKnowledge`)
- `docs/system-prompt.md` (F6, a `searchKnowledge` tool + grounding-szabályok bekerülése)
- `.claude/skills/db-role-setup/SKILL.md` (F6, a `searchKnowledge` mint második RO-fogyasztó megemlítése)
- `README.md` (F9, "Dokumentáció" táblázat + "Futtatás és tesztelés" bővítése)
- `docs/testing-strategy.md` (F5, F6 — "Mockolási konvenció" bővítése az `ai`/`@ai-sdk/openai`/`@ai-sdk/anthropic` mockokkal)
- `docs/roi.md` (F9, 5.2 szakasz keresztellenőrzése a RAG-költségekkel)
- `docs/brs-plantbase.md` (F2, 3. és 4. szakasz kiegészítése a bővített hatókörrel)

## Verifikáció (F)

- Minden fázis után: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
- F2: `db-role-setup` eredménye dokumentálva a PR-ban (RO tud SELECT-elni, nem tud írni); `docs/ddd/glossary.md`, `docs/ddd/model.md`, `docs/tech/infra.md` létezik; `docs/brs-plantbase.md` bővített hatókört mutat.
- F5: ingest lefut, `knowledge_chunks` sorszáma > 0; `docs/tech/infra.md` említi a második RW poolt; `docs/testing-strategy.md` mockolási listája bővült; README futtatási lépései tartalmazzák az ingestet.
- F6: unit tesztek (hyde/rerank/retrieve/ask-agent) zöldek; `plantbase ask "..."` valódi cikk-alapú, forráshivatkozásos választ ad; `docs/system-prompt.md`, `docs/tech/architecture.md`, `docs/tech/api.md` frissítve/létezik; `docs/testing-strategy.md` mockolási listája a `@ai-sdk/anthropic`-kal is bővült.
- F7: golden set eredménytáblázat (nyers vs. teljes pipeline mindkét kérdésre) + negatív teszt átmegy; a rerank-átrendezési példa (vagy annak hiányának indoklása) dokumentálva.
- F8: Mermaid-ábra renderelődik ÉS a statikus export-fájl (`docs/rag-architektura.assets/adatfolyam.png`) létezik és megnyitható.
- F9: költségszámok a README-ben, aktuális árazásra hivatkozva.

## Kimarad (tudatosan, F körben NEM)

- Dokumentum-verziókezelés (hash-alapú változás-észlelés) — F8 csak terv.
- Coverage-kikényszerítés a vitest configban — ld. `docs/testing-strategy.md` "Kimarad".
- Edge case-ek (pg_sleep, szintaktikai csapdák) — DB read-only role szintje.
