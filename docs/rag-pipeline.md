# Plantbase — RAG chunking-stratégia

> A HF3 (F rész, `docs/implementation/05-rag-pipeline.md`) által megkövetelt, saját, indokolt
> chunking-döntés leírása. A teljes fázisbontás és git-workflow ott van; ez a dokumentum csak a
> `packages/core/src/rag/chunk.ts` mögötti indoklást rögzíti.

## A forrás-adat tényleges szerkezete (nem feltételezés — a 202 vendorolt cikken lemérve)

- Minden cikk YAML frontmatter (`title`, `source`, `category`) + markdown törzs: egy H1 cím, majd
  H2 szakaszok, néhány cikkben H2 alatt H3 alszakaszokkal.
- **202 cikkből 202-nek** van legalább 1 H2 szakasza; a H2-k száma cikkenként 1 és 13 között
  szór (162 cikknek pontosan 1 valódi H2-je van — jellemzően az `ask-the-sill` Q&A-stílusú
  cikkek, ahol a tartalom a H1 utáni bevezető szövegben és H3-akban van, nem külön H2-kben).
- **Minden egyes cikk** (mind a 202) végén van egy `## Perfect Pairings For Your Plants` H2
  szakasz, ami kizárólag terméklistázás (bolti zaj), plusz egy záró "Words By The Sill" branding
  blokk — ez sosem tartalmaz gondozási információt.

## Döntések és indoklásuk

### 1. Bolti zaj kiszűrése a chunkolás előtt

Mind a 202 cikkben megjelenik a `## Perfect Pairings For Your Plants` szakasz és az utána
következő branding-szöveg. Ez zajt vinne a vektortérbe (minden cikk "hasonlítana" erre a
termékajánló blokkra), ezért a `stripStoreNoise` lépés a chunkolás **előtt**, egyértelműen,
determinisztikusan levágja mindent ettől a fix, mindig jelenlévő headingtől kezdve.

### 2. Csak H2-nél vágunk chunk-határt (nem minden `#`-nál)

A H2 szakaszok (Sunlight/Water/Humidity/stb.) a valódi, önálló ténydarabok — egy felhasználói
kérdés ("mennyi vizet igényel?") tipikusan egy H2 szakasz tartalmával válaszolható meg. A H3
alszakaszok (pl. "How To Repot Snake Plants" a "Learn More" H2 alatt) narratív továbbfejtések,
amik önmagukban túl rövidek/kontextusfüggőek lennének külön chunkként — ezért a `splitByH2` a H3
szinten NEM vág, azt a H2 szakasz szövegének része marad.

### 3. Kontextus-prefix minden chunk elé

A rövid, tényszerű mondatok ("Water thoroughly every two to eight weeks…") önmagukban nem
hordozzák, MELYIK növényről szólnak — több cikk közel azonos öntözési tanácsot ad, kontextus
nélkül a hozzájuk tartozó embedding-vektorok könnyen összemosódnak. Minden chunk tárolt/embedelt
szövege elé kerül a `{cím} — {H2 szakasz-cím}` prefix (a bevezető, H2 előtti szakasznál csak a
`{cím}`, mert ott nincs szakaszcím). Ez a `KnowledgeChunk.content` mezőben közvetlenül tárolva
van — nincs külön "csak embeddeléshez" mező, mert a grounding-hivatkozásnak (F6) ugyanez a
kontextus-jelölés hasznos, nem csak a keresésnek.

### 4. Token-alapú méretezés, nem karakter-alapú

A karakter-szám rossz becslés a tényleges token-költségre (ami az embedding és az LLM-kontextus
árát is meghatározza) — a `js-tiktoken` (`cl100k_base` encoding, ami a `text-embedding-3-small`
modell tokenizálásának felel meg) pontos, kiszámítható token-számot ad. A chunk-méret felső
határa **`MAX_CHUNK_TOKENS = 400`**: elég kicsi a pontos, egy-témájú visszakereséshez (egy H2
szakasz tipikusan ez alatt van, ld. lent a mérést), mégis elég nagy, hogy egy hosszabb szakasz
(pl. "Learn More", "Common Problems") ne törjön értelmetlenül apró darabokra.

### 5. Mondat-szintű átfedés, nem teljes bekezdés-átfedés

Amikor egy H2 szakasz túllépi a token-határt és több chunkra kell bontani, a szomszédos
al-chunkok között **`OVERLAP_SENTENCES = 2`** mondatnyi átfedés van (nem a teljes előző bekezdés
megismétlése) — ez elegendő, hogy a határon átnyúló gondolatmenet ne vesszen el a keresésnél,
miközben a duplikált tartalom (és így az embedding-költség) minimális marad.

## Lemért eredmény a teljes 202 cikkes korpuszon

`chunkArticle` a 202 vendorolt cikken (F3) **768 chunkot** termel — átlagosan 3.8 chunk/cikk,
maximum 13 (a leghosszabb, legtöbb H2-t tartalmazó gondozási útmutatóknál). Egyetlen cikk sem
termel 0 chunkot (minden cikknek van kereshető tartalma a zaj-szűrés után).

## Implementáció

- `packages/core/src/rag/chunk.ts` — `parseArticle` (frontmatter+H1 leválasztás),
  `stripStoreNoise`, `splitByH2`, `packIntoTokenChunks` (token-határ + mondat-átfedés),
  `chunkArticle` (a fenti lépések összefűzése, `KnowledgeChunk`-kompatibilis kimenet).
- `packages/core/src/rag/chunk.spec.ts` — a fenti 5 döntés mindegyikére unit teszt, valós
  mintaszövegekre alapozva (H2-vágás, mérethatár-csomagolás, kontextus-prefix, mondat-átfedés,
  zaj-kiszűrés).
