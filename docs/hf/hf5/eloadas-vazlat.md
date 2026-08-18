# HF5 — Prezentáció vázlat (üzleti indoklás, ~5 perc, 6-8 dia)

> A use case-t a PoC mutatja meg (mit csinál a rendszer); ez a diasor a business case-re
> fókuszál (miért éri meg). Minden itt szereplő állítást a repóban lévő PoC ténylegesen
> igazol.

---

## 1. dia — Cím és kontextus

- **Cím:** Az ügyfélszolgálati asszisztens — a belső eszközünk kifelé fordítva
- Ami eddig megvolt: a lakberendező kollégák napi szinten használják a katalógus- és
  gondozási asszisztenst.
- A kérdés, amit ma megválaszolunk: mit kapnak ebből **a mi ügyfeleink**?
- Amit hoztam: egy működő PoC + egy döntés-előkészítő anyag — nem ígéret, hanem kipróbálható
  rendszer.

## 2. dia — A probléma: melyik három fájdalmat célozzuk

- **#1 — nincs válasz munkaidőn kívül.** A vásárlók akkor is keresnének minket, amikor a
  csapat nem elérhető.
- **#2 — ugyanazok a kérdések naponta százszor.** Termék- és gondozási kérdések nagy része
  ismétlődik, staff-időt visz el olyasmitől, amit jobban tudnának csinálni.
- **#8 — a sürgős ugyanabban a sorban áll, mint a triviális.** Nincs triázs a bejövő
  kérdések között.
- Amit **nem** vállalunk ma: új ügyfél onboardingja, rendelés-státusz láthatóság, mélyebb
  személyre szabás, panaszokból való szisztematikus tanulás, szerződéskötés gyorsítása,
  staff-staff válasz-konzisztencia, csendes lemorzsolódás előrejelzése — ezek külön
  kezdeményezések lennének.

## 3. dia — A megoldás: két út, egy demó

- **Közvetlen válasz-ág:** a chat termék- és gondozási kérdésekre azonnal, forráshivatkozással
  válaszol a meglévő katalógus és tudásbázis alapján.
- **Eszkalációs ág (az emberi jóváhagyási pont):** ha a rendszer bizonytalan, vagy a kérés
  ítélőképességet igényel (egyedi rendelés, panasz), **nem válaszol találgatva** — jóváhagyásra
  küldi egy munkatársnak, és semmi nem jut el a vásárlóhoz addig, amíg valaki jóvá nem hagyja.
- Élő demó: mindkét út valós adaton, élőben generált válasszal fut, nincs előre megírt
  szöveg.
- **Beépített védelem, nem utólagos ötlet:** a chat mindig jelzi, hogy AI-asszisztenssel
  beszélgetünk, és a rendszer explicit tiltja a mesterséges sürgetést/nyomásgyakorlást —
  ez pontosan az a kockázat, amit a korábbi AI Act-elemzésünk (HF4) már jelzett, ha
  valaha kiterjesztjük a webes felületet az ügyfelekre.

## 4. dia — Adattérkép (kötelező dia)

Egyetlen vásárlói kérdés útja, teljes körűen:

| Adat                                                                                                                                                             | Hova megy                                                                                                                                                                                                                                                                                                              | Mi marad nálunk                                                                                                                | Mi NEM megy ki sosem                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| A vásárló szabadszöveges kérdése                                                                                                                                 | Anthropic (válaszgenerálás, és gondozási kérdésnél egy hipotetikus-válasz-lépéshez is); gondozási kérdésnél emellett OpenAI is **kétszer** megkapja: egyszer a kereséshez használt szöveg embeddingjeként, egyszer pedig közvetlenül, a találatok relevancia-pontozásához — mindkét szolgáltató amerikai, harmadik fél | A kérdés+válasz szövege naplófájlban és adatbázisban                                                                           | A termékkatalógus és a gondozási cikkek tartalma helyben marad, ezt csak olvassuk, nem küldjük ki egyben |
| A beszélgetés-előzmény                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                      | Helyi Postgres (`Thread`/`Message` tábla)                                                                                      | —                                                                                                        |
| Eszkalált esetek (ha a rendszer bizonytalan)                                                                                                                     | —                                                                                                                                                                                                                                                                                                                      | Helyi Postgres, egy külön, csak-beszúrható táblában                                                                            | A jóváhagyás/elutasítás státusza sosem kerül vissza a modellhez tanulási célra                           |
| Minden interakció **teljes** naplója — nem csak metaadat: a rendszer-utasítás és a teljes üzenetváltás szövege is, plusz válaszidő, token-használat, eszkalált-e | —                                                                                                                                                                                                                                                                                                                      | Helyi naplófájl (JSONL) — ez egy **második, önálló** másolata a kérdés-válasz szövegnek, a beszélgetés-előzménytől függetlenül | —                                                                                                        |

- **Nyílt pont, amit nem szépítünk:** ma nincs automatikus anonimizálás és nincs
  hozzáférés-/megőrzési szabály a naplózott adatra — ez egy előfeltétele az éles
  bevezetésnek, nem egy már megoldott kérdés.

## 5. dia — Rollout terv (kötelező dia)

- **Pilot:** egy szűk vásárlói kör (pl. egyetlen termékkategória vagy egy kiválasztott
  ügyfélszegmens), 2-4 hét, staff minden eszkalációt manuálisan felülvizsgál (nem csak
  mintavételesen).
- **Döntési pont:** a pilot után akkor lépünk tovább, ha (a) a válaszidő és az eszkalációs
  arány a mérési tervben rögzített tartományban van, ÉS (b) a havi minőségi audit nem talál
  rendszerszintű hibát a nem-eszkalált válaszokban.
- **Teljes bevezetés:** fokozatos kiterjesztés a teljes vásárlói körre, a staff jóváhagyási
  átfutási idejének folyamatos figyelésével.
- **Gazda a go-live után:** a folyamatgazda (napi eszkaláció-triázs, riportok fogyasztása) és
  a technikai gazda (fejlesztő, aki a rendszert karbantartja) — a felelősségmegosztás
  részletesen a mérési terv táblában.

## 6. dia — Mérési terv (kötelező dia, összefoglaló)

- **Válaszidő** (#1) és **eszkalációs arány** (#8) — mindkettő automatikusan mérhető, már
  ma is naplózva.
- **FAQ-deflekciós arány** (#2) — hány kérdést old meg a rendszer staff nélkül.
- **Staff jóváhagyási átfutási idő** és **elutasítási arány** — a jóváhagyási pont
  hatékonyságát méri.
- **Hiba-metrika, nem csak siker-metrika:** havi mintavételes audit arra, hogy hány
  nem-eszkalált válasz bizonyul utólag hibásnak — ez a legfontosabb védőháló-jelzés.
- A teljes tábla (adatforrás, riportálás, forrás-megjelölés sorononként) a repóban:
  `docs/hf/hf5/meresi-terv.md`.

## 7. dia — Amit tudatosan nem vállalunk

- Nincs vásárlói azonosítás/bejelentkezés — demó-célú PoC, nem éles, publikus rendszer.
- Nincs tényleges automatikus értesítési csatorna a jóváhagyás után a vásárló felé.
- Nincs rendeléskezelő-integráció, nincs anonimizálás, nincs megőrzési-idő szabály.
- Ezek nem elfelejtett részletek — explicit, dokumentált előfeltételei egy éles
  bevezetésnek.

## 8. dia — Összegzés és kérdések

- A PoC ténylegesen fut, valós adaton, mindkét úttal (közvetlen válasz + eszkaláció).
- Három fájdalmat old meg tényleg, hetet nem — ezt nyíltan vállaljuk.
- A humán jóváhagyási pont garantálja, hogy semmi ne jusson el a vásárlóhoz felülvizsgálat
  nélkül, ha a rendszer bizonytalan.
- Kérdések? — a kérdéslapon (`docs/hf/hf5/qna.md`) a legkényesebb pontokra is előre
  válaszoltunk.
