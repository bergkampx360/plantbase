# Plantbase — architektúra (fájlstruktúra + főbb döntések)

> Kurzus-melléklet. A "mivel" (verziók, eszközlista, séma) a `stack.md`-ben; itt a STRUKTÚRA és a kulcsdöntések.

## Fájlstruktúra (Nx monorepo)

```
plantbase/
├── packages/core   agent-logika (LLM-hívás, runSql tool, séma-kontextus, naplózás)
├── packages/db     Prisma lib (séma, migráció, kliens, seed) — NEM a gyökérben
├── apps/cli        CLI (ask parancs + interaktív mód)
├── apps/server     Express szerver, streamelő POST /api/chat (G2, `docs/implementation/06-web-chat.md`)
├── apps/web        React + Vite + Tailwind + shadcn/ui webes chat felület (G4, ua.)
├── docs            dokumentáció (lásd dev-workflow.md)
└── konfig          nx, package.json, .env, docker-compose
```

(Csak nagy vonalakban; a fájl-szintű bontást Claude generálja a konvenciók szerint.)

## Főbb technológiai döntések

1. **Framework-agnostic core.** A `packages/core` nem ismeri a belépési pontokat (CLI/API/web). Új felület = új app, nem újraírás. (Mastra majd az 5. órán a core köré.)
2. **Két DB-kapcsolat, két jog.** Az agent `runSql`-je READ-ONLY kapcsolaton fut (`DATABASE_URL_READONLY`), csak SELECT. A Prisma READ-WRITE kapcsolaton (`DATABASE_URL`) viszi a sémát, migrációt, seedet. Az agent NEM Prismán kérdez.
   Ugyanez az elv érvényes a RAG tudásbázisra (`knowledge_chunks`, F2, `docs/implementation/05-rag-pipeline.md`): az agent-facing olvasás (`searchKnowledge` tool, F6) a meglévő RO kapcsolaton megy, a `runSql`-lel megegyező módon. Az ingest (a 202 cikk feldolgozása → chunkolás → embedding → beírás, F5) egy ÚJ, kizárólag erre a célra létrehozott RW poolon ír — ez SOSEM az agent útján fut, csak az ingest-scriptből.
3. **Agent-loop.** Eredetileg (A–F rész) az `askAgent` az Anthropic SDK-ra (hivatalos kliens, nem nyers HTTP) épülő, kézzel írt tool-use loop volt, agent-framework nélkül, hogy a mechanika látható maradjon ("az alapoktól"). **G1-nél (`docs/implementation/06-web-chat.md`) felülírva**: a kézzel írt `for` ciklust a Vercel AI SDK `streamText`+`tool()`+`stopWhen: stepCountIs(MAX_TOOL_ITERATIONS)` váltotta — a pedagógiai cél (a mechanika megértése) az A–F részben már teljesült, a G rész a termék-minőséget (streaming, típusos tool-ok) célozza. Az `AskResult.messages` típusa emiatt `ModelMessage[]` (AI SDK), nem `Anthropic.MessageParam[]`.
4. **Átláthatóság beépítve.** Minden interakció JSONL-be naplózva; `--show-prompt` a teljes prompt megjelenítéséhez.
5. **Lokális DB.** docker-compose Postgres, OrbStack futtatja. Helyben dolgozunk, nincs felhő-DB.
6. **Prisma külön Nx lib.** A Prisma (séma, migráció, kliens, seed) a `packages/db` libben él, NEM a repo gyökerében: a séma az Nx graph része, a core és a seed onnan importál.
7. **Library-doksi munka előtt.** Új vagy ritkán használt API-nál (pl. Prisma) ELŐBB beolvassuk a doksit Context7-tel, csak utána kódolunk, mert így kevesebb a hiba a tesztek alatt.

Konvenciók: `konvenciok.md`. Git/hook/automatizmus: `dev-workflow.md`.
