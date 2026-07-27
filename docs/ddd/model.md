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

## Chat domain (G rész, `docs/implementation/06-web-chat.md`, G3–G4; H rész, `07-web-ux-improvements.md`, H3)

### `Thread` (aggregátum-gyökér, `threads` tábla) és `Message` (entitás, `messages` tábla)

```
Thread                          Message
├── id (String, kliens adja)    ├── id
├── title (nullable, LLM adja)  ├── threadId    (FK → Thread.id)
├── createdAt                   ├── role         ("user" / "assistant")
├── updatedAt (minden új        ├── content
│   üzenetnél frissül)          └── createdAt
└── messages  (1:N)
```

**`Thread.title` (H3)**: nullable — a szerver tölti ki egy rövid, LLM-generált összefoglalóval
(`generateThreadTitle()`, `packages/core/src/title-agent.ts`) az ÚJ szál első kérdéséből, nem a
kliens. A H3 előtt létrehozott szálaknál `null` marad (nincs visszamenőleges kitöltés) — a
webes UI ekkor egy dátum-fallbackre esik vissza (`apps/web/src/app/thread-sidebar.tsx`).

**`Thread.id` String, NEM autoincrement (G4-től)**: az AI SDK `useChat` natív mintájában a chat
id-t a kliens generálja (`generateId()`), mielőtt az első üzenet elmenne — a szerver sosem talál
ki saját azonosítót. Ez G3-hoz képest változás (ott még `Int @default(autoincrement())` volt, az
`X-Thread-Id` response header-rel kommunikálva vissza) — G4 kutatása közben derült ki, hogy ez
ütközik a `useChat` natív, kliens-generált-id mintájával.

**Aggregátum-határ**: a `Thread` az aggregátum-gyökér, a `Message` csak `Thread`-en belül
értelmezett (mindig egy adott `threadId`-hez tartozik, önálló élettartama nincs). A
`GET /api/threads/:id` a teljes aggregátumot adja vissza (`Thread` + rendezett `Message[]`).

**Perzisztencia**: `apps/server` Prisma Clienten (RW) keresztül írja/olvassa — ez alkalmazás-adat
(UI-history), nem agent-facing tudásbázis-olvasás, ezért a `runSql`/`searchKnowledge` RO-elve
(`docs/architektura.md` 2. döntés) itt nem vonatkozik rá; nincs RO grant rá a `db-role-setup`
skillben.

**Kapcsolat a `logs/` JSONL-naplózással**: két független, párhuzamos mechanizmus, NEM ugyanaz az
adat két helyen. A CLI (`logInteraction`) a `logs/<timestamp>.jsonl`-be ír, minden interakcióról
(system prompt, teljes üzenet-tömb, token-használat) — audit/debug-trail célra. A `Thread`/
`Message` a webes UI beszélgetés-történetének forrása — csak a kérdést és a végső választ tárolja,
tool-hívások nélkül. A CLI és a Web history-ja explicit NEM egyesül: egy CLI-munkamenet nem
jelenik meg a webes "korábbi beszélgetések" listában, és fordítva sincs átjárás (tudatos,
egyszerűsítő döntés, `06-web-chat.md` 9–10. döntése).
