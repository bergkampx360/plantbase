# Plantbase — ubiquitous language (glossary)

> `ddd-audit` skill tartja karban (`docs/dev-workflow.md`). Első létrehozás: F2
> (`docs/implementation/05-rag-pipeline.md`) — új domain-fogalom (RAG) volt a trigger, de a
> `dev-workflow.md` saját meghatározása szerint a **meglévő** termék-domain szótárt is fel kell
> vennie, nem csak az új RAG-fogalmakat.

## Termék-katalógus domain (`docs/brs-plantbase.md`, `docs/stack.md`)

- **Növény (product)** — a katalógus egy tétele (`products` tábla). Attribútumai: köznapi és
  latin név, kategória, ár/akciós ár, készlet, gondozási jellemzők.
- **Kategória (category)** — a növény típusa: szobanövény, kerti, pozsgás, kaktusz, fűszer,
  fa-cserje, lógó, virágzó.
- **Elhelyezés (location)** — beltéri / kültéri / mindkettő.
- **Fényigény (light)** — árnyék / alacsony / közepes / erős / direkt nap.
- **Öntözési igény (watering)** — ritka / közepes / gyakori / állandóan nedves.
- **Nehézségi szint (difficulty)** — kezdő / haladó / profi (mennyire igényes a gondozása).
- **Háziállat-barát / gyerekbiztos / légtisztító** — bool jellemzők, nem mérgező háziállatra
  ill. gyerekre, illetve légtisztító hatás.
- **Lakberendező (persona)** — a rendszer fő felhasználója; szobák adottságai és ügyféligények
  alapján állít össze növénycsomagot (ld. `docs/brs-plantbase.md`, "Üzleti igény").

## Agent domain (`docs/architektura.md`, `docs/system-prompt.md`)

- **Agent** — az `askAgent` tool-use loop, ami természetes nyelvű kérdésből SQL-t/tool-hívást
  generál, majd természetes nyelvű választ ad.
- **Tool** — az agent által hívható függvény (`runSql`, `listCategories`, F6-tól
  `searchKnowledge`).
- **runSql** — read-only SQL-futtató tool a `products` katalógus felett.
- **Guard** — a `runSql` biztonsági rétege (csak `SELECT`, tiltott kulcsszavak, string-literál
  maszkolás, ld. `docs/implementation/03-runsql-guard-hardening.md`,
  `04-runsql-guard-refinements.md`).

## RAG domain (`docs/implementation/05-rag-pipeline.md`, F rész, HF3)

- **Tudásbázis (knowledge base)** — a gondozási cikkek gyűjteménye (202 md-fájl,
  `packages/db/prisma/seed/knowledge/`), a `products` katalógustól elkülönült, második
  adatforrás.
- **Cikk (article)** — egy gondozási md-fájl (cím, forrás, kategória + markdown törzs).
- **Chunk (tudás-darab)** — egy cikk H2-szakasz-alapú, kereshető egysége
  (`knowledge_chunks` tábla), a hozzá tartozó embedding-vektorral.
- **Embedding** — egy chunk (kontextus-prefixszel ellátott) szövegéből számított 1536-dimenziós
  vektor (OpenAI `text-embedding-3-small`).
- **HyDE (Hypothetical Document Embeddings)** — a felhasználói kérdésből egy hipotetikus válasz
  generálása (Anthropic), ami jobb embeddinget ad a kereséshez, mint a nyers kérdés.
- **Rerank** — a vektorkereséssel talált chunk-jelöltek LLM-alapú (OpenAI, strukturált 0–10
  pontozás) újrarendezése relevancia szerint.
- **searchKnowledge** — a RAG-pipeline-t az agentnek elérhetővé tevő tool (F6), ami a
  rerank-pontszámokat és a találatszámot is visszaadja.
- **Grounding** — a válasz forráshoz kötése (mely cikkből származik az állítás); ha nincs
  releváns találat, az agent ezt explicit kimondja, nem fabrikál választ.
- **Önreflektáló/iteratív keresés** — ha a `searchKnowledge` gyenge/kevés találatot ad, az agent
  a `MAX_TOOL_ITERATIONS` korláton belül újrafogalmazott kérdéssel újra hívhatja a toolt.
- **Ingest** — a cikkek egyszeri feldolgozási folyamata: beolvasás → chunkolás → embedding →
  RW-írás a `knowledge_chunks` táblába (F5).

## Ügyfél-eszkaláció domain (`docs/implementation/09-customer-facing-poc.md`, J rész, HF5)

- **Ügyfél (customer)** — a client webshopjának végfelhasználója, aki a `/customer` chaten
  keresztül kérdez; nem azonos a lakberendezővel (aki a belső agent-felhasználó).
- **Eszkaláció / humán jóváhagyási pont (handoff)** — az a pont, ahol az agent egy kérdést nem
  válaszol meg közvetlenül, hanem emberi felülvizsgálatra küld (`requestHumanHandoff` tool),
  mert bizonytalan (`searchKnowledge` `weak:true`) vagy a kérés a katalógus/gondozás hatókörén
  kívül esik (egyedi/nagytételes rendelés, panasz).
- **CustomerHandoff** — a `customer_handoffs` táblában rögzített, `pending` állapotú sor, amit
  az eszkaláció létrehoz; ember hagyja jóvá vagy utasítja el a staff felületen, mielőtt bármi
  eljutna az ügyfélhez.
- **Insert-only szerepkör (`plantbase_handoff`)** — a customer-facing agent egyetlen írási
  jogosultsága: kizárólag INSERT a `customer_handoffs` táblára, SELECT-et sem lát (még a
  saját beírt sorát sem tudja visszaolvasni — a tool nem is kér `RETURNING`-et).
- **searchProducts** — ügyfél-biztonságos, whitelistelt szűrőkkel (kategória, fény-/öntözési
  igény, nehézségi szint, háziállat-/gyerekbiztonság, légtisztító hatás, maximum ár)
  paraméterezett termékkeresés a RO poolon; a customer-facing perzóna ezt kapja a belső
  `runSql` helyett, hogy szabad SQL-generálás sosem legyen elérhető egy publikus felületről.
- **Thread origin** — a `Thread.origin` mező (`'internal' | 'customer'`), ami elválasztja a
  lakberendezői és az ügyfél-beszélgetéseket a megosztott `Thread`/`Message` táblákban.
