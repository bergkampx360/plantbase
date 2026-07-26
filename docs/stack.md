# Plantbase — tech stack

Elv: iparági best practice, legfrissebb STABIL verzió (se cutting-edge, se elavult).

- Nyelv / monorepo: TypeScript (strict), Nx, pnpm, Node LTS
- DB: PostgreSQL lokálisan docker-compose-ban (OrbStack futtatja), image `pgvector/pgvector:0.8.5-pg17`
  (pgvector extension a RAG tudásbázis embeddingjeihez), Prisma (ORM: séma, migráció, seed, typed
  query). Helyben dolgozunk, nincs felhő-DB.
- Agent: Vercel `ai` SDK (`streamText` + `tool()` + `stopWhen: stepCountIs(...)`) — G1-től
  (`docs/implementation/06-web-chat.md`) a teljes agent-loop is ezt használja, nem csak a RAG-réteg
  egylövéses hívásai (a korábbi kézzel írt, Anthropic SDK-ra épülő loop erre lett átírva).
  `@ai-sdk/anthropic` a modell-hívásokhoz. Zod (validáció, `inputSchema` a tool-oknál)
- RAG (`packages/core/src/rag`, scope-olt kivétel — ld. `docs/architektura.md`): ugyanaz a Vercel
  `ai` SDK + `@ai-sdk/openai` (embedding, rerank) + `@ai-sdk/anthropic` (HyDE) — az egylövéses
  RAG-hívásokra. `js-tiktoken` (`cl100k_base` encoding) a chunkolás token-alapú méretezéséhez (F4) —
  pontos, kiszámítható tokenszám a karakter-becslés helyett.
- CLI: commander + node:readline
- Tooling: Vitest, ESLint + Prettier, tsx
- Eszköz: Zed, gh CLI

## products séma

```sql
products (
  id            serial primary key,
  name          text,        -- köznapi név
  latin_name    text,
  category      text,        -- szobanövény / kerti / pozsgás / kaktusz / fűszer / fa-cserje / lógó / virágzó
  location      text,        -- beltéri / kültéri / mindkettő
  price             numeric,  -- ár (HUF)
  sale_price        numeric,  -- akciós ár (ha van akció), különben null
  stock             int,      -- raktárkészlet (db)
  light             text,     -- árnyék / alacsony / közepes / erős / direkt nap
  watering          text,     -- ritka / közepes / gyakori / állandóan nedves
  difficulty        text,     -- kezdő / haladó / profi
  current_height_cm int,      -- aktuális magasság
  max_height_cm     int,      -- kifejlett (max) magasság
  current_pot_cm    int,      -- aktuális cserépméret
  pet_safe          boolean,  -- háziállat-barát
  kid_safe          boolean,  -- gyerekbiztos (nem mérgező)
  air_purifying     boolean,  -- légtisztító
  rating            numeric,  -- 0-5
  reviews_count     int,
  description       text
)
```

### Értékkészletek (kategorikus mezők)

- **category:** szobanövény, kerti, pozsgás, kaktusz, fűszer, fa-cserje, lógó, virágzó
- **location:** beltéri, kültéri, mindkettő
- **light:** árnyék, alacsony, közepes, erős, direkt nap
- **watering:** ritka, közepes, gyakori, állandóan nedves
- **difficulty:** kezdő, haladó, profi
- **bool:** pet_safe, kid_safe, air_purifying
