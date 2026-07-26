# Plantbase — domain modell (entitások, value objectek, aggregátumok)

> `ddd-audit` skill tartja karban (`docs/dev-workflow.md`). Első létrehozás: F2
> (`docs/implementation/05-rag-pipeline.md`) — a `dev-workflow.md` szerint a **meglévő** modellt
> is fel kell venni, nem csak az új RAG-entitásokat. Fogalmak: `docs/ddd/glossary.md`.

## Termék-katalógus domain

### `Product` (entitás, `products` tábla, Prisma `Product` modell)

Önálló azonosítóval rendelkező entitás (`id`), `latin_name` egyedi (idempotens seedhez).
Value object jellegű, kategorikus mezői (`category`, `location`, `light`, `watering`,
`difficulty`) zárt értékkészlettel bírnak (`docs/stack.md`). Nincs kapcsolt entitása — a `v1`
hatókör (`docs/brs-plantbase.md`) egyetlen aggregátuma önmagában a `Product`, nincs
gyűjtemény/rendelés entitás.

## Agent domain

Az agent maga nem perzisztens entitás — futásidejű folyamat (`askAgent` hívás), amely a
`Product` aggregátumot csak olvasva éri el (`runSql` tool, read-only kapcsolat). Az interakció
naplózása (`logs/<timestamp>.jsonl`) fájl-alapú, nem DB-entitás.

## RAG domain (F rész, `docs/implementation/05-rag-pipeline.md`)

### `KnowledgeChunk` (entitás, `knowledge_chunks` tábla, Prisma `KnowledgeChunk` modell)

```
KnowledgeChunk
├── id            (egyedi azonosító)
├── source        (a forrás-cikk fájlneve/azonosítója)
├── title         (a cikk címe — a chunk kontextus-prefixének része)
├── category      (a cikk altémája: plants-101 / ask-the-sill / outdoor-plant-care /
│                  care-miscellaneous / the-basics)
├── chunkIndex    (a chunk sorszáma a cikken belül — a H2-szakasz-sorrend)
├── content       (a chunk kereshető szövege, kontextus-prefixszel)
└── embedding     (vector(1536), pgvector)
```

**Aggregátum-határ**: egy `Cikk` (forrás md-fájl) nem külön DB-entitás — csak a
`knowledge_chunks` sorain keresztül létezik (`source`+`title` közösen azonosítja). A chunkok
nem hivatkoznak vissza egymásra (nincs "előző/következő chunk" kapcsolat) — a H2 szakasz az
önálló, kereshető egység, a kontextus-prefix (`{cím} — {H2 szakasz-cím}`) hordozza
a cikk-szintű kontextust chunk-szinten is, DB-kapcsolat nélkül.

**Value objectek**: az `embedding` (1536 dimenziós vektor) és a rerank-pontszám (a
`searchKnowledge` tool válaszában, NEM perzisztált — csak egy adott keresés élettartamára
számított érték) nem önálló entitások, hanem egy-egy `KnowledgeChunk`-hoz (ill. kereséshez)
kötött value objectek.

**Kapcsolat a termék-domainnel**: a `KnowledgeChunk` és a `Product` teljesen független
aggregátum — nincs köztük FK-kapcsolat. Az agent mindkettőt olvashatja (két külön tool:
`runSql` a `Product`-ra, `searchKnowledge` a `KnowledgeChunk`-ra), de a válaszban való
összekapcsolásuk (pl. "ez a növény milyen gondozást igényel") az agent LLM-szintű
következtetése, nem DB-szintű join.
