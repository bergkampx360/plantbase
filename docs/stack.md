# Plantbase — tech stack

Elv: iparági best practice, legfrissebb STABIL verzió (se cutting-edge, se elavult).

- Nyelv / monorepo: TypeScript (strict), Nx, pnpm, Node LTS
- DB: PostgreSQL lokálisan docker-compose-ban (OrbStack futtatja), image `pgvector/pgvector:0.8.5-pg17`
  (pgvector extension a RAG tudásbázis embeddingjeihez), Prisma (ORM: séma, migráció, seed, typed
  query). Helyben dolgozunk, nincs felhő-DB.
- Agent: Anthropic SDK (hivatalos kliens, nem nyers HTTP) + saját tool-use loop, agent-framework nélkül. Zod (validáció)
- RAG (`packages/core/src/rag`, scope-olt kivétel — ld. `docs/architektura.md`): Vercel `ai` SDK +
  `@ai-sdk/openai` (embedding, rerank) + `@ai-sdk/anthropic` (HyDE) — csak az egylövéses
  RAG-hívásokra, az `askAgent` tool-use loopját nem érinti. `js-tiktoken` (`cl100k_base` encoding) a
  chunkolás token-alapú méretezéséhez (F4) — pontos, kiszámítható tokenszám a karakter-becslés
  helyett.
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
