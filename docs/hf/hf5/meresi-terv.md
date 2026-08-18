# HF5 — Mérési terv (teljes tábla)

> Forrás-jelölés minden sornál: **mért** = éles/teszt adatból ténylegesen számolható ma;
> **becsült** = ökölszám, konkrét mérés nélkül; **építendő** = a data source ma nem létezik,
> pilot előtt meg kell építeni. A prezentáció "Mérési terv" diája ennek a táblának az
> összefoglalója.

| Mit mérünk | Melyik fájdalomhoz kötődik | Honnan lesz adat | Hogyan riportáljuk | Kinek | Forrás |
| --- | --- | --- | --- | --- | --- |
| Válaszidő (p50/p95, ms) | #1 (munkaidőn kívüli elérhetőség) | `logs/*.jsonl` `durationMs` mezője, `persona: "customer"` sorokra szűrve | heti automatikus összesítő szkript | folyamatgazda | **mért** — a mezőt ez a PoC vezette be, egy helyi teszt-lekérdezésnél 3993 ms és 4774 ms közötti értékeket adott (nem statisztikailag reprezentatív minta, csak a mechanizmus igazolása) |
| Eszkalációs arány (%) | #8 (sürgős vs. rutin triázs) | `logs/*.jsonl` `escalated: true` aránya az összes `persona: "customer"` sorhoz képest, VAGY a `customer_handoffs` sorok száma / összes ügyfél-interakció | napi automatikus számolás | folyamatgazda, szponzor | **mért** — a mechanizmus valós adatbázis-sorokkal igazolt (ld. `HF5-megoldas.md` demó-forgatókönyv) |
| FAQ-deflekciós arány (%) | #2 (ismétlődő kérdések terhe) | `logs/*.jsonl`-ben azok az ügyfél-interakciók, ahol `escalated: false` ÉS volt `searchKnowledge` vagy `searchProducts` tool-hívás — ezek olyan kérdések, amik korábban staff-időt vettek volna igénybe | heti összesítő | folyamatgazda, vezetői kör | **mért**, de a "mi számít volna staff-időnek" besorolás **becsült** — nincs ma olyan adat, ami megmondaná, mennyi staff-percet spórolt egy adott kérdés |
| Staff jóváhagyási átfutási idő (a `pending` létrejötte és a `reviewedAt` közti idő) | #8 | `customer_handoffs.createdAt` — `customer_handoffs.reviewedAt` különbsége | heti összesítő, DB-lekérdezéssel | folyamatgazda | **mért** — mindkét időbélyeg ténylegesen tárolt mező |
| Elutasítási arány (`rejected` / összes elbírált) | minőségi jelzés, nem közvetlenül fájdalom | `customer_handoffs.status` szerinti csoportosítás | heti összesítő | folyamatgazda, szponzor | **mért** |
| **Nem-eszkalált, de utólag hibásnak bizonyuló válaszok aránya** (hiba-metrika) | minőség/kockázat — ez az agent hibáját méri, nem a sikerét | manuális, mintavételes audit: a staff (vagy kijelölt felülvizsgáló) havonta átnéz N darab, `escalated: false` interakciót a `logs/*.jsonl`-ből, és megjelöli, ha a válasz téves vagy félrevezető volt | havi mintavételes riport, rögzített minta-mérettel (pl. 30 interakció/hónap) | folyamatgazda, szponzor | **építendő** — a manuális felülvizsgálati folyamat maga (ki nézi át, milyen szempontok szerint) ma nem létezik, ezt a pilot előtt ki kell alakítani |
| Token-költség / ügyfél-beszélgetés | üzemeltetési költség, felső becslés a rollouthoz | `logs/*.jsonl` `tokenUsage` mezője, Anthropic/OpenAI aktuális árazással szorozva | heti összesítő | szponzor (költségkontroll) | **mért** a token-szám, **becsült** a Ft-összeg (árazás változhat) — a módszertan megegyezik a meglévő RAG-költségbecsléssel (`docs/rag-pipeline.md`) |

## Amit ez a tábla explicit kimond

- **Legalább egy metrika minden megoldott fájdalomhoz kötve** (#1: válaszidő, #2:
  FAQ-deflekció, #8: eszkalációs arány + átfutási idő).
- **Van hiba-metrika, nem csak siker-metrika**: a "nem-eszkalált, de hibás válasz" sor
  kifejezetten azt méri, amikor a rendszer *nem* eszkalált, pedig kellett volna — ez a
  legkockázatosabb hibamód, mert ilyenkor a vásárló egy rossz választ kap anélkül, hogy
  bárki tudna róla.
- **Minden sor létező vagy tervezhető adatforrásra épül** — ahol ma nincs adat (a manuális
  minőség-audit folyamata), azt kimondottan "építendő"-nek jelöltem, nem tettem úgy, mintha
  már működne.
