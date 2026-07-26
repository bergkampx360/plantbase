# Plantbase — RAG-pipeline: chunking-stratégia és visszakeresés-minőség

> A HF3 (F rész, `docs/implementation/05-rag-pipeline.md`) által megkövetelt, saját, indokolt
> chunking-döntés (F4) és a golden-set kiértékelés (F7) leírása. A teljes fázisbontás és
> git-workflow ott van; ez a dokumentum a `packages/core/src/rag/chunk.ts` mögötti indoklást ÉS a
> teljes keresési pipeline (`hyde.ts`/`rerank.ts`/`retrieve.ts`) mért hatékonyságát rögzíti.

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

---

## Multi-provider routing

A pipeline **két különböző LLM/embedding-providert** használ, tudatos szereposztással:

| Lépés                 | Provider  | Modell                   | Miért ez                                                                                                                                                                                                                 |
| --------------------- | --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Embedding             | OpenAI    | `text-embedding-3-small` | Iparágilag bevett, ár/minőség arányban erős embedding-modell.                                                                                                                                                            |
| Rerank                | OpenAI    | `gpt-4.1-mini`           | A rerankhez strukturált kimenet kell (pontszám chunkonként) — az `ai` SDK `generateObject`-je ehhez OpenAI-oldalon illeszkedik jól a projektben már használt zod-sémákkal.                                               |
| HyDE                  | Anthropic | `claude-haiku-4-5`       | Ugyanaz a szöveg-generálási feladat (hipotetikus válasz írása), mint amit az `askAgent` már csinál — nincs ok külön providerre váltani egy olyan lépésnél, ami nem strukturált kimenetet, hanem szabad szöveget generál. |
| askAgent végső válasz | Anthropic | `claude-haiku-4-5`       | Az `askAgent` már eleve Anthropic-alapú (`docs/architektura.md`, 3. döntés) — a RAG-réteg ebbe illeszkedik, nem vezet be egy harmadik providert erre a lépésre.                                                          |

**A tényleges elv**: OpenAI a **struktúra/pontosság**-igényes lépéseknél (embedding-vektor,
pontszám-JSON), Anthropic a **szöveg-generálásnál** (hipotetikus válasz, végső válasz) — ez adja
a valódi multi-provider orchestration-t, nem egy tetszőleges szétosztás. Részletes indoklás:
`docs/implementation/05-rag-pipeline.md`, "Rögzített döntések" 2. pont.

---

## Golden set — visszakeresés-minőség (F7)

> `packages/core/src/rag/golden-set.ts` (`pnpm --filter @plantbase/core run golden-set`) —
> egyszeri kiértékelő szkript, nincs saját `.spec.ts`-je (ld. `docs/testing-strategy.md`).
> A lenti eredmények egy konkrét, valós futásból származnak (768 chunkos korpusz, éles
> `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`).

### Módszertan és óvintézkedések

- **Modellek**: HyDE — Anthropic `claude-haiku-4-5` (a futás idején tényleges `.env`
  `ANTHROPIC_MODEL` értéke, nem csak a kódbeli fallback); Rerank — OpenAI `gpt-4.1-mini`
  (`RERANK_MODEL`, `rerank.ts`); Embedding — OpenAI `text-embedding-3-small` (`EMBEDDING_MODEL`,
  `embed.ts`). Ezek konkrét, jelen pillanatban élő értékek — modellváltás után a lenti számok nem
  reprodukálhatók ugyanígy.
- **Nem-determinizmus**: a HyDE és a rerank LLM-hívás, tehát ugyanaz a kérdés más futásban más
  pontszámot/sorrendet adhat (ezt korábban, F6 manuális tesztjénél is megfigyeltük). A lenti
  táblázat egy pillanatkép, nem garantált, bitre-pontosan reprodukálható eredmény.
- **Nyers vs. rerank előtti/utáni**: a "nyers" oszlop a literal kérdés embeddjéből, közvetlenül
  `TOP_N` (4) találatot kér (nincs utána szűkítő lépés). A "pipeline" oszlop **egyetlen**
  HyDE-hívásból számolt jelölt-halmazon (mind a `CANDIDATE_LIMIT`, 10 jelölt) mutatja a rerank
  előtti (distance) és utáni (score) sorrendet — szándékosan **nem** két külön `retrieve()`-hívás
  eredménye, mert az két különböző (nem-determinisztikus) HyDE-választ jelentene, és a "mit
  rendezett át a rerank" kérdés csak közös jelölt-halmazon értelmezhető.
- **A `distance` és a `score` nem közös skála** — az egyik minél kisebb, annál jobb (koszinusz-
  távolság), a másik minél nagyobb (0–10 LLM-pontszám). A nyers-oszlop `distance`-e sem vethető
  össze közvetlenül a pipeline-oszlop `distance`-ével, mert más embeddingből jönnek (literal
  kérdés vs. HyDE-válasz).
- **A `score` kérdések között sem egy kalibrált abszolút skála** — egy adott kérdésen belül
  rangsorol jelölteket; "Q1 topScore 10" és "Q6 topScore 8" összevetése nem jelenti, hogy Q1
  retrievációja objektíven jobb volt, csak azt, hogy Q1-nél volt egyértelműen erős találat az
  adott ítélet szerint.
- **`hitCount` minden kérdésnél pontosan 4 volt** (a futás ezt megerősítette) — a 768 chunkos
  korpuszban `CANDIDATE_LIMIT=10` mellett mindig van legalább `TOP_N` jelölt, tehát `hitCount`
  jelenleg nem megkülönböztető adat, ezért nem szerepel önálló oszlopként a táblázatban.
- **"Negatív" ≠ nulla találat** — a vektorkeresés sosem ad üres eredményt (mindig visszaadja a
  legközelebbi szomszédokat, akkor is, ha tartalmilag irrelevánsak). A negatív kérdésnél (7.) a
  `hitCount` ugyanúgy 4, csak a találatok tartalmilag nem a kérdezett fajról szólnak.

### Eredménytáblázat (top-1 forrás kérdésenként)

| #   | Kérdés                                                          | Nyers top-1 (distance)                             | Pipeline végleges top-1 (score)                                                                               | weak  | Megjegyzés                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Milyen gyakran öntözzem a szukkulenseimet?                      | _How to Care for a Schefflera_ (0.814)             | _Our Top 10 Plant Care Tips_ / _How Often & How Much You Should Water Houseplants_ (10 pontos döntetlen: 9/9) | false | A nyers teljesen más növényről (Schefflera/Bonsai) szóló cikkeket talált; a pipeline releváns öntözési cikkeket.                                                                                                                                                                                                                                                                                                 |
| 1   | Miért sárgulnak a leveleim?                                     | _5 Causes For Your Plant's Yellow Leaves_ (0.828)  | _5 Causes For Your Plant's Yellow Leaves_ (10)                                                                | false | **Rerank-átrendezési részlet lent.**                                                                                                                                                                                                                                                                                                                                                                             |
| 2   | Mennyi fényre van szüksége egy monsterának?                     | _The Hole Truth: Monsteras_ (0.665)                | _How To Care for a Monstera Deliciosa_ (10)                                                                   | false | A nyers egy tematikusan közeli, de nem fény-specifikus cikket talált; a pipeline a fény-releváns gondozási cikket hozta elő.                                                                                                                                                                                                                                                                                     |
| 3   | Hogyan ismerem fel a pajzstetűt a növényemen?                   | _Key Plant Terms Glossary_ (0.640)                 | _Bug Off: All About Mealybugs_ (10)                                                                           | false | A kérdés kifejezetten pajzstetűre (scale) kérdez, a pipeline legjobb találata mégis a mealybugs-cikk — a _Bug Off: All About Scale_ is bekerült a top-4-be (score 8), csak 3. helyen, nem 1.-ként. Nem hibás, de nem pontosan a kérdezett kártevő az élen.                                                                                                                                                       |
| 4   | Milyen páratartalmat igényelnek a páfrányok?                    | _Between Two Ferns_ (0.760)                        | _Between Two Ferns_ (10)                                                                                      | false | Mindkét ág fern-specifikus tartalmat talált, de más chunköt (a nyers és a HyDE-embedding más H2-szakaszt preferált ugyanabból a cikkből).                                                                                                                                                                                                                                                                        |
| 5   | Hogyan ültessem át a növényemet nagyobb cserépbe?               | _Plant Care for Large Plants_ (0.617)              | _Our Top 10 Plant Care Tips_ (8)                                                                              | false | **Őszinte korlát**: a nyers megtalálta a dedikált _How to Pot Your Houseplant Step By Step_ cikket (3. helyen), a pipeline rerank-előtti 10 jelöltje között ez **egyáltalán nem szerepelt** — a HyDE-válasz embeddingje ezúttal "elmiszte" a legdirektebb forrást, a végleges válasz csak általános tippekre támaszkodott. Ez a leggyengébb eredmény a 8 kérdés közül (max score 8, a többinél jellemzően 9–10). |
| 6   | _(negatív)_ Hogyan gondozzam a Xylorhiza nevű ritka növényemet? | _Oxalis_ (0.624)                                   | _Patio Gardening 101_ / _Our Top 10 Plant Care Tips_ (döntetlen 7/7)                                          | false | Sem a nyers, sem a pipeline nem talál Xylorhiza-specifikus tartalmat (nincs is a korpuszban) — csak generikus növénygondozási cikkeket. Agent-szintű bizonyíték lent.                                                                                                                                                                                                                                            |
| 7   | _(retry-jelölt)_ Mit tegyek, ha nem néz ki jól a növényem?      | _Health Is Wealth, Get That (Plant) Green_ (0.589) | _Health Is Wealth, Get That (Plant) Green_ (10)                                                               | false | Ez a golden-set-scriptes (retrieve-szintű) futás erős találatot adott — az agent-szintű retry-demonstráció ehelyett külön CLI-futásokból származik, ld. lent.                                                                                                                                                                                                                                                    |

### Rerank-átrendezési részlet (1. kérdés: "Miért sárgulnak a leveleim?")

A rerank **előtt** (a HyDE-válasz embeddingjéből, distance szerint) az 1. helyen egy **fern-specifikus** cikk állt, a valódi, dedikált "sárguló levelek" cikk csak a 4. helyen:

1. _Between Two Ferns_ #6 (distance 0.610)
2. _5 Causes For Your Plant's Browning Leaves_ #3 (0.612)
3. _A is for Aroids_ #3 (0.613)
4. _5 Causes For Your Plant's Yellow Leaves_ #1 (0.613)

A rerank **után** a sorrend megfordult — a dedikált cikk lett az 1. (holtversenyben egy másik szakaszával), a fern-cikk a 3. helyre csúszott:

1. _5 Causes For Your Plant's Yellow Leaves_ #1 (score 10)
1. _5 Causes For Your Plant's Yellow Leaves_ #3 (score 10)
1. _Between Two Ferns_ #6 (score 9)
1. _5 Causes For Your Plant's Yellow Leaves_ #2 (score 9)

**Miért jobb az új sorrend** — a tényleges chunk-tartalmat elolvasva: a _Between Two Ferns_ #6 chunk egy páfrány-specifikus, több témát (fény/öntözés/páratartalom/hőmérséklet/gyakori problémák) felsoroló szakasz, amiben a sárgulás csak **egy sor** egy szimptóma-lista közepén ("Yellowing lower leaves, wet potting mix → Overwatered") — a nyers vektor-hasonlóság valószínűleg a "yellowing" szó és az általános gondozási regiszter miatt kerül közel, nem azért, mert a cikk témája a sárgulás. A _5 Causes For Your Plant's Yellow Leaves_ #1 chunk ezzel szemben **kizárólag** és **kimerítően** a kérdés témájáról szól (több különálló sárgulás-ok, tünet szerint bontva, bármely növényre alkalmazható) — a rerank helyesen ismerte fel, hogy ez a direktebb, teljesebb válasz a kérdésre, és előre hozta.

### Agent-szintű bizonyíték: negatív kérdés (7.) és önreflektáló keresés (8.)

Ezek **külön, valós CLI-futásokból** (`pnpm run plantbase ask "..." --show-prompt`) származnak, nem a golden-set táblázat retrieve-szintű soraiból — a negatív-kérdés-kimondás és az önreflektáló újrahívás **agent-szintű** (system prompt által vezérelt) viselkedés, amit a `retrieve()`/`searchKnowledge` közvetlen hívása nem tud demonstrálni. Emiatt a lenti pontszámok eltérhetnek a fenti táblázat 6–7. sorától (más futás, más HyDE-válasz).

**Negatív teszt (Xylorhiza) — PASS-kritérium**: a végső válasz (a) nem állít konkrét, Xylorhiza-specifikus tényt, ÉS (b) explicit jelzi a hiányzó/korlátozott információt. Valós transzkript-kivonat:

> 🔧 `searchKnowledge({"query":"Xylorhiza gondozása, ápolása, tippek"})` → `topScore: 8, weak: false`
> (találatok: Dino Plant, Tradescantia stb. — más fajokról)
>
> 🌱 _"Sajnálom, de a tudásbázisban **nincs konkrét információ a Xylorhiza növényről**. Az eredmények más növényekről szólnak (Dino Plant, Tradescantia stb.), nem az általad említett fajról. [...] **Általános alapelvek** ritka/speciális növényekhez: [...]"_

A válasz PASS: a generikus tanácsot egyértelműen "általános alapelvekként" különítette el, nem Xylorhiza-tényként adta elő — **annak ellenére, hogy `weak: false` volt**. Ez azt mutatja, hogy a negatív-teszt-védelem **nem csak** a kódszintű `weak`-jelzésből jön, hanem az agent saját tartalmi összevetéséből is (felismerte, hogy a talált cikkek nem a kérdezett fajról szólnak) — a két réteg együtt ad robusztus groundingot.

**Önreflektáló keresés (8.) — őszinte eredmény, nem a várt "gyenge→jobb" ív.** 5 próbálkozásból (különböző, szándékosan homályos/szokatlan megfogalmazású kérdésekkel) 3 esetben a `searchKnowledge` **egyetlen hívásra** erős találatot adott (score 6–10) — ez azért van, mert a HyDE pontosan arra való, hogy a homályos megfogalmazásból is jó embeddinget csináljon, tehát egy valóban "gyenge" első kör strukturálisan nehezen idézhető elő, ha a HyDE jól működik. 2 esetben az agent **valóban kétszer hívta meg** a `searchKnowledge`-et, más megfogalmazással — ez az iteratív keresési **mechanizmus** valós, agent-vezérelt bizonyítéka:

> 🔧 `searchKnowledge({"query":"hidroponikus tápoldati EC pH értékek optimalizálása fura levelek"})` → `topScore: 6, weak: false`
> 🔧 `searchKnowledge({"query":"EC érték pH hidroponika optimális tartomány tápoldati kimaradás tünetei"})` → `topScore: 5, weak: false`
> 🌱 _"Sajnos a tudásbázisban **nincs megfelelő információ a hidroponikus EC/pH értékek konkrét optimalizálásáról**. [...] szakosított hidroponikus tudásbázisra van szükséged."_

Mindkét kör után a válasz **továbbra sem talált specifikusan releváns tartalmat**, és ezt az agent őszintén kimondta — ez tehát nem "gyenge→jobb" javulást bizonyít, hanem egy **második, iteratív negatív-tesztet**: a mechanizmus (kétszeri hívás, más megfogalmazással) működik, de az eredmény attól függ, hogy a hiány megfogalmazási (reformulálással javítható) vagy valódi tartalmi hiány (reformulálással sem javítható) — ez utóbbi esetben a helyes viselkedés éppen a kitartó, de végül őszinte elutasítás, nem egy erőltetett "jobb" válasz. Ezt a jelenséget a HF3 saját, a rerank-átrendezésre vonatkozó megengedő logikájával analóg módon dokumentáljuk: ha a kívánt ív nem jelenik meg természetesen, ezt magyarázattal együtt rögzítjük, nem szimulált eredménnyel pótoljuk.

---

## Költségbecslés (F9)

> Módszertan: minden szám vagy **valós mért adat** (a `logs/` mappa tényleges `tokenUsage`-a,
> illetve egy élesben lefuttatott HyDE/embedding/rerank hívás valós `usage`-a), vagy ebből
> számított — nincs benne hüvelykujj-szabály-becslés. Az árak **aktuális, 2026. júliusi
> web-keresésből** származnak, nem képzésadatból (linkek lent).

### Árazás (2026-07-26, hivatalos/aggregált források)

| Modell                          | Szerep                       | Ár                                              |
| ------------------------------- | ---------------------------- | ----------------------------------------------- |
| Anthropic `claude-haiku-4-5`    | HyDE + askAgent végső válasz | $1,00 / 1M input token, $5,00 / 1M output token |
| OpenAI `text-embedding-3-small` | embedding                    | $0,02 / 1M token                                |
| OpenAI `gpt-4.1-mini`           | rerank                       | $0,40 / 1M input token, $1,60 / 1M output token |

Forrás: [Anthropic — Claude Haiku 4.5 pricing (OpenRouter-tükrözve)](https://openrouter.ai/anthropic/claude-haiku-4.5),
[OpenAI — text-embedding-3-small pricing](https://openrouter.ai/openai/text-embedding-3-small),
[OpenAI — GPT-4.1 mini pricing](https://inworld.ai/models/openai-gpt-4-1-mini) — mindegyik legalább
két független forrásból keresztellenőrizve.

### Ingest-összköltség (egyszeri)

A 768 chunk **valós, DB-ben tárolt** tartalmán mérve (`js-tiktoken`, `cl100k_base` — ugyanaz az
encoding, mint a `chunk.ts`-ben): **218 676 token** összesen (átlag 284,7 token/chunk).

- 218 676 token × $0,02 / 1M = **$0,0044** (kb. 1,7 Ft, 380 Ft/$ árfolyamon) — egyszeri,
  elhanyagolható.

### Egy kérdés költsége

Egy valós, éles hívással mérve (`Miért sárgulnak a leveleim?` kérdésre, a teljes pipeline-on
végigfuttatva):

| Lépés                                                | Modell                 | Input token | Output token | Költség       |
| ---------------------------------------------------- | ---------------------- | ----------- | ------------ | ------------- |
| HyDE                                                 | claude-haiku-4-5       | 102         | 169          | $0,000947     |
| Embedding                                            | text-embedding-3-small | 179         | –            | $0,0000036    |
| Rerank                                               | gpt-4.1-mini           | 3 451       | 86           | $0,001518     |
| askAgent (system prompt + tool-loop + végső válasz)¹ | claude-haiku-4-5       | 2 778       | 288          | $0,004218     |
| **Összesen (1 `searchKnowledge`-hívás)**             |                        |             |              | **≈ $0,0067** |

¹ Az askAgent-sor **nem** ebből az egy hívásból, hanem a `logs/` mappa 5 db, valós, egyszeri
`searchKnowledge`-hívást tartalmazó (2 üzenetes) interakciójának **átlaga** (`tokenUsage`,
JSONL-naplózás, `docs/architektura.md` 4. döntés) — ez reprezentatívabb egy egyetlen mért
példánynál.

**Önreflektáló retry eset** (2 `searchKnowledge`-hívás egy kérdésben — a `logs/` mappa 4 db,
6 üzenetes interakciójának átlaga az askAgent-részre, a HyDE/embed/rerank duplázva): input
≈13 387 / output ≈808 token az askAgent-hurokban → **≈ $0,0224 összesen** egy ilyen kérdésre.

### Havi vetítés és a `docs/roi.md` keresztellenőrzése

A `docs/roi.md` 5.2 szakasza (150 kérdés/hó, `runSql`-alapú, RAG nélkül készült) becslése
(~$0,52/hó) most a fenti, mért RAG-adatokkal frissül — ld. ott. **Konklúzió: az "elhanyagolható"
állítás továbbra is igaz** — a legrosszabb esetben (mind a 150 havi kérdés `searchKnowledge`-en
menne át) is csak **≈$1,00/hó** (kb. 380 Ft/hó, 380 Ft/$ árfolyamon), szemben az 1,8M Ft/év Hard
haszonnal — részletek: `docs/roi.md`, 5.2 szakasz.
