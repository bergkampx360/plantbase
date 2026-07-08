# Seed adat — `products`

Ez a mappa a `products` tábla **kanonikus, kézzel írt seed-adatát** és a betöltő scriptet tartalmazza.

- **`plants.ts`** — fix, ~30 elemű lista, valós fajnevekkel (`docs/stack.md` séma és értékkészletek szerint). Ez a lista **a projekt egyetlen forrása** a katalógus-adatra: a B) rész egyike sem generálja újra vagy módosítja futásidőben. Ha bővíteni vagy javítani kell, ezt a fájlt szerkesztjük — nem hozunk létre mellé egy másik generátort.
- **`seed.ts`** — a `plants.ts` tömböt tölti be a `products` táblába, `prisma.product.upsert`-tal a `latin_name` mezőn. Ez **idempotens**: többszöri futtatás sem hoz létre duplikátumot, és ha egy növény adatai megváltoznak `plants.ts`-ben, a meglévő sor frissül (nem csak beszúrás történik).

## Futtatás

```bash
pnpm --filter @plantbase/db run db:seed
```

Ez a `packages/db/prisma.config.ts`-ben rögzített `migrations.seed` parancsot hívja (`tsx prisma/seed/seed.ts`), ugyanazon a Prisma Clienten keresztül, amit a csomag `src/client.ts`-e exportál.
