# Plantbase — RAG-pipeline és webes chat (F és G rész)

> Kurzus-melléklet, az `01-environment-and-agent-core.md` (A–B), `02-ux-dx-improvements.md` (C), és `03-runsql-guard-hardening.md` (D) után — külön dokumentumként, hogy az eddigi tervek lezárt maradjanak. Ugyanazt a stílust és git-workflow szabályt követi. Státusz: `docs/implementation/STATUS.md`.

## Kontextus — F rész: RAG-pipeline (HF3 házifeladat)

A 6. órai házifeladat (HF3) egy működő RAG-pipeline-t kér: saját tudásbázis, chunking-stratégia (indoklással), teljes keresési pipeline (HyDE + rerank), grounding, golden set (nyers vs. teljes pipeline + negatív teszt), karbantartási architektúra-spec (terv + ábra), és költségbecslés.

**A/B döntés:** a Plantbase továbbvitele (B opció) — a kurzus 202 gondozási cikke a tudásbázis, ugyanebben a repóban dolgozunk.

**Rögzített döntések:**

1. **Use case:** B) Plantbase továbbvitele, ugyanebben a repóban.
2. **Multi-provider routing:** OpenAI (embedding + rerank), Anthropic (HyDE + végső válasz).
3. **SDK:** Vercel `ai` SDK **scope-olt kivételként** a RAG egylövéses hívásaira (embedding, HyDE, rerank); az `askAgent` tool-use loopja egyelőre még változatlan marad (F-ben). Ezt a döntést `docs/architektura.md` 3. pontja kiegészítésében dokumentáljuk.
4. **Chunking-stratégia:** H2-határon vágás, cím–szakasz kontextus-prefix, token-alapú méretezés, mondat-szintű átfedés. (Indoklás a `docs/rag-pipeline.md`-ben.)
5. **Dokumentáció-helyzet:** új fájl `docs/rag-architektura.md` (nem `ARCHITEKTURA.md`, case-insensitive FS miatt).
6. **Agent-viselkedés:** iteratív/önreflektáló keresés — a `searchKnowledge` tool pontszámokat + találatszámot ad vissza, az agent gyenge eredménynél újrafogalmazott kérdéssel újra hívhatja (MAX_TOOL_ITERATIONS korláton belül).

---

## F rész — Fázisok (F1–F7)

Minden fázis: saját branch → implementáció+teszt → doc-lezáró commit → `ddd-audit` → megállok tesztelésre → push/PR/merge csak explicit jóváhagyás után.

### F1 — Előkészítés ⏳ NYITOTT

- `docker-compose.yml`: `postgres:17-alpine` → `pgvector/pgvector:pg17` (vektor-kiterjesztés szükséges).
- Prisma migráció: `CREATE EXTENSION vector` + `knowledge_chunks` tábla (source, title, category, chunk_index, content, embedding vector(1536)).
- npm függőségek: `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`.
- `.env.example`: `OPENAI_API_KEY=` hozzáadása.
- 202 gondozási cikk átvétele: `sajtosistvan/ai-agent-kurzus/seed/knowledge/*.md` → `packages/db/prisma/seed/knowledge/`.
- `docs/architektura.md` 3. döntésének kiegészítése (AI SDK scope-olt kivétele).
- `docs/implementation/05-rag-pipeline.md` létrehozása (ez a fájl) + `docs/implementation/STATUS.md` F sora.

**Teszt:** Docker start, Prisma migráció lefut, `CREATE EXTENSION vector` végrehajtható.  
**Commit:** `feat: prepare environment for RAG pipeline (pgvector, deps, knowledge articles)`  
→ **megállok, kérem a tesztelést.**

### F2 — Chunking-stratégia + unit tesztek ⏳ NYITOTT

- `packages/core/src/rag/chunk.ts` — H2-határon vágás, kontextus-prefix, token-méretezés, mondat-átfedés.
- `packages/core/src/rag/chunk.spec.ts` — unit tesztek (H2-vágás, mérethatár-csomagolás, kontextus-prefix, mondat-átfedés).
- `docs/rag-pipeline.md` — chunking-indoklás leírása.

**Teszt:** `pnpm exec nx run core:test` zöld.  
**Commit:** `feat: implement chunking strategy with context prefix and token-based sizing`  
→ **megállok, kérem a tesztelést.**

### F3 — Embedding + vektor-tárolás + ingest ⏳ NYITOTT

- `packages/core/src/rag/embed.ts` — OpenAI `text-embedding-3-small`, `embedMany` API SDK-val.
- `packages/core/src/rag/knowledge-store.ts` — pgvector CRUD (insertChunks, searchChunks, listSources, listChunks).
- Ingest-script vagy CLI-parancs: 202 cikk feldolgozása, chunk-olás, embedding, beírás.

**Teszt:** ingest lefut, `SELECT count(*) FROM knowledge_chunks` > 0.  
**Commit:** `feat: implement embedding and vector storage with ingest pipeline`  
→ **megállok, kérem a tesztelést.**

### F4 — Keresési pipeline (HyDE + rerank) + agent-integráció ⏳ NYITOTT

- `packages/core/src/rag/hyde.ts` — Anthropic `generateText`, hipotetikus válasz.
- `packages/core/src/rag/rerank.ts` — OpenAI `generateObject`, strukturált pontozás (0–10).
- `packages/core/src/rag/retrieve.ts` — teljes pipeline (HyDE → embedding → pgvector-keresés → rerank → kontextus).
- `searchKnowledge` tool az `askAgent`-ben (runSql/listCategories mintájára).
- System-prompt kiegészítés: grounding-szabály (forráshivatkozás, "nincs erről infóm" ha nincs találat).
- **Önreflektáló keresés:** a tool output tartalmazza rerank-pontszámokat + találatszámot; system prompt szabálya: gyenge/kevés találat esetén az agent újrafogalmazott kérdéssel újra hívhat.

**Teszt:** `plantbase ask "miért sárgulnak a leveleim?"` → forráshivatkozásos válasz a gondozási cikkekből.  
**Commit:** `feat: implement search pipeline (HyDE, rerank, retrieve) with searchKnowledge tool and self-reflective iteration`  
→ **megállok, kérem a tesztelést.**

### F5 — Golden set + negatív teszt ⏳ NYITOTT

- 5–10 kérdés a növénygondozási domainből (veled jóváhagyva).
- Nyers vektorkeresés vs. teljes pipeline összevetés (dokumentálva).
- Konkrét rerank-átrendezési példa.
- Legalább 1 negatív kérdés (a tudásbázisban nincs válasz) + bizonyíték, hogy az agent ezt kimondja.
- Legalább 1 kérdés az önreflektáló keresést bemutatja (első hívás → gyenge, újrafogalmazás → jobb).

**Teszt:** golden set eredménytáblázat, negatív teszt átmegy.  
**Commit:** `test: add golden set and demonstrate pipeline effectiveness`  
→ **megállok, kérem a tesztelést.**

### F6 — `docs/rag-architektura.md` (karbantartási spec + Mermaid-ábra) ⏳ NYITOTT

- Terv (nem kód): dokumentum-változás észlelése, új/törölt dokumentum kezelése, újraindexelés triggere.
- Beágyazott Mermaid-ábra: forrás → változásérzékelés → chunk → embed → tárolás, törlés/módosítás útja.

**Teszt:** dokumentáció áttekintve.  
**Commit:** `docs: add RAG architecture and maintenance plan with diagram`  
→ **megállok, kérem a tesztelést.**

### F7 — Költségbecslés + README ⏳ NYITOTT

- Ingest összköltség (202 cikk × átlag chunk-szám × embedding-ár).
- Egy kérdés költsége (HyDE + embedding + rerank + válasz).
- **Aktuális árakkal** (nem képzésadatok).
- README bővítése, `docs/implementation/STATUS.md` F sora ✅ KÉSZ.

**Teszt:** költségek a README-ben.  
**Commit:** `docs: add RAG cost estimation and update README`  
→ **megállok, kérem a tesztelést.**

---

## G rész — Webes chat felület (F1–F7 UTÁN, külön ütemezve)

**Prioritás:** a HF3 leadási része (F1–F7) **előbb** készül el, CLI-n keresztül demonstrálva. A G rész ezután, külön fázissorozat — nem kockáztatjuk a határidős leadást.

**Cél:** webes chat UI, stream-elt válasz, kattintható válasz → agent/tool-hívás-nyomkövetés, DB-alapú kontextus, "új chat" gomb, korábbi beszélgetések listája.

**Döntések:**

- **Agent-loop átáll az AI SDK-ra** (`streamText`+`tools`) a teljes `askAgent`-ben — felülírja `docs/architektura.md` 3. döntését (indoklás: pedagógiai cél már teljesült CLI-n; web a termék-minőséget célozza).
- **CLI megmarad** párhuzamosan (`docs/architektura.md` 1. döntése).
- **Stack:** Express 5 + React 19 + Vite + Tailwind + shadcn/ui; streaming-protokoll szöveg-delta + `data-tool`/`data-agent` típusok.
- **Thread-perzisztencia:** DB az igazságforrás, kliens új üzenetet + `threadId`-t küld; új chat = `threadId` nélkül (régi a DB-ben marad).

### G1–G7 vázlat (részletezés F lezárása után)

- **G1:** `askAgent` → AI SDK `streamText`+`tools`; toolok újrakötése; `ask-agent.spec.ts` frissítés.
- **G2:** `apps/server` scaffold (Express + `/api/chat`).
- **G3:** Prisma Thread/Message + `/api/threads` router.
- **G4:** `apps/web` scaffold (React + `useChat`).
- **G5:** Tool-kártya komponensek (`data-tool`/`data-agent`).
- **G6:** "Új chat" gomb + history lista.
- **G7:** Tesztek + docs.

---

## Kritikus fájlok (F)

- `packages/core/src/rag/{chunk,embed,hyde,rerank,retrieve,knowledge-store}.ts` + specek
- `packages/core/src/ask-agent.ts` → `searchKnowledge` tool bekötése
- `packages/db/prisma/migrations/` → pgvector + knowledge_chunks
- `packages/db/prisma/seed/knowledge/*.md` → 202 cikk
- `docs/rag-pipeline.md`, `docs/rag-architektura.md`, `docs/architektura.md` (3. döntés kiegészítése), `docker-compose.yml`, `.env.example`

## Verifikáció (F)

- Minden fázis után: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
- F3: ingest lefut, `knowledge_chunks` sorszáma > 0.
- F4: `plantbase ask "..."` valódi cikk-alapú, forráshivatkozásos választ ad.
- F5: golden set eredménytáblázat + negatív teszt átmegy.
- F6: Mermaid-ábra renderelődik.
- F7: költségszámok a README-ben, aktuális árazásra hivatkozva.

## Kimarad (tudatosan, F körben NEM)

- Dokumentum-verziókezelés (hash-alapú változás-észlelés) — F6 csak terv.
- Coverage-kikényszerítés a vitest configban — ld. `docs/testing-strategy.md` "Kimarad".
- Edge case-ek (pg_sleep, szintaktikai csapdák) — DB read-only role szintje.
