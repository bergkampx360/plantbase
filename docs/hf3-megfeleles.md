# HF3 — Megfelelőségi összefoglaló

> A 6. óra házifeladatának (RAG-pipeline, "Honnan tudja az agent, amit tud?") pontjait végigvéve:
> minden szakaszhoz megadva, **hol** van nálunk a válasz (konkrét fájl/szekció-hivatkozás), és
> **van-e eltérés** a szó szerinti kéréstől — ha igen, indoklással. Ez a dokumentum nem duplikálja
> a tartalmat, csak térképez.

## 1. Use case és tudásbázis

**Kért**: A) saját use case, vagy B) Plantbase továbbvitele — saját implementációval, saját
döntésekkel, az órai kód csak referencia.

**Nálunk**: B opció — a 202 gondozási cikk (kurzus-repóból vendorolva, F3). A chunking-stratégia,
a keresési pipeline (HyDE+rerank+önreflektáló keresés), a golden set, az architektúra-terv és a
költségbecslés mind saját, önállóan indokolt döntés — ld. az alábbi pontokat.
Hivatkozás: `docs/implementation/05-rag-pipeline.md` (kontextus + rögzített döntések),
`docs/brs-plantbase.md` (a bővített hatókör, F2-ben rögzítve).

**Eltérés**: nincs.

## 2. Chunking-stratégia — és az indoklás

**Kért**: a bekezdés-alapú minta továbbfejlesztése + indoklás, hogy mi következik a tudásbázis
tagoltságából; legalább pár unit teszt.

**Nálunk**: H2-szakasz-alapú vágás (nem bekezdés-alapú), kontextus-prefix, token-alapú méretezés,
mondat-szintű átfedés, bolti-zaj-szűrés — mindegyik a **ténylegesen mért** korpusz-struktúrából
indokolva (202/202 cikknek van H2-je, minden cikk végén ugyanaz a zaj-heading stb.), nem
elvi/általános érveléssel. Hivatkozás: `docs/rag-pipeline.md` "Döntések és indoklásuk" +
"A forrás-adat tényleges szerkezete" szakasz. Tesztek: `packages/core/src/rag/chunk.spec.ts` (18
teszt, mind az 5 döntésre + F11-ben pótolt edge case-ek).

**Eltérés**: nincs.

## 3. A keresési pipeline

**Kért elemek**: embedding+vektor-tárolás, HyDE, rerank, grounding (forráshivatkozás + explicit
"nincs találat" kimondás), multi-provider routing (≥2 provider, indokolt szereposztás).

| Elem                                         | Hol                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding + vektor-tárolás (pgvector)        | `packages/core/src/rag/embed.ts`, `knowledge-store.ts`; `docs/tech/infra.md` (pgvector-döntés)                                                        |
| HyDE                                         | `packages/core/src/rag/hyde.ts`                                                                                                                       |
| Rerank                                       | `packages/core/src/rag/rerank.ts`                                                                                                                     |
| Grounding (forráshivatkozás + "nincs infóm") | `packages/core/src/system-prompt.ts` / `docs/system-prompt.md` szabályok; valós bizonyíték: `docs/rag-pipeline.md` "Agent-szintű bizonyíték" szakasza |
| Multi-provider routing + indoklás            | `docs/rag-pipeline.md` "Multi-provider routing" szakasz (OpenAI: embedding+rerank, Anthropic: HyDE+végső válasz)                                      |

**Eltérés**: nincs.

## 4. Golden set — bizonyítsd, hogy a pipeline csinál valamit

**Kért**: 5–10 kérdés, mindegyik nyers-vs-teljes-pipeline összevetéssel; legalább 1 konkrét
rerank-átrendezési példa indoklással (vagy magyarázat, ha nincs ilyen); legalább 1 negatív kérdés,
bizonyítva, hogy az agent kimondja a hiányt.

**Nálunk**: 8 kérdés (`docs/rag-pipeline.md` "Golden set" szakasz), mindegyikre nyers/rerank-előtti/
rerank-utáni összevetés táblázatban, 1 részletes, tartalmilag indokolt rerank-átrendezési példa
("Miért sárgulnak a leveleim?" — a rerank egy fern-specifikus, csak véletlenül közeli chunköt
lecserélt egy ténylegesen a témáról szóló cikkre), 1 negatív kérdés (Xylorhiza) explicit
PASS-kritériummal és valós CLI-transzkripttel. Reprodukálható: `pnpm --filter @plantbase/core run
golden-set` (README "Futtatás és tesztelés").

**Eltérés**: nincs — de egy őszinte megjegyzés: az **önreflektáló-retry** "gyenge→jobb" mintáját
(amit a HF nem kér explicit, de a mi saját tervünk — `docs/implementation/05-rag-pipeline.md` F6 —
igen) 5 valós kísérletből sem sikerült természetesen előidézni; ehelyett egy "gyenge→retry→még
mindig gyenge, de őszinte elutasítás" mintát dokumentáltunk, a jelenséget magyarázattal együtt
(`docs/rag-pipeline.md`, "Önreflektáló keresés (8.)" szakasz) — ugyanazzal az elvvel, amit a HF a
rerank-átrendezés hiányára enged ("ha nem, magyarázd meg, miért nem").

## 5. Architektúra-spec: a tudásbázis karbantartása

**Kért**: `docs/ARCHITEKTURA.md` — hogyan derül ki, hogy egy dokumentum változott (és hogy a
változatlan ne vektorizálódjon újra); mi történik új/törölt dokumentummal; mikor triggerel az
újraindexelés; kötelező architektúra-ábra (screenshot/export a repóba), ami mutatja a teljes
adatfolyamot (forrás → változásérzékelés → chunk → embed → tárolás) + a törlés/módosítás útját.

**Nálunk**: `docs/rag-architektura.md` — hash-alapú (SHA-256, teljes nyers fájltartalom) sync-terv,
`KnowledgeSource` tervezett tábla, 4 per-fájl ág (ÚJ/VÁLTOZOTT/VÁLTOZATLAN — explicit skip/
TÖRÖLT), + egy globális ág (embedding-modell/chunking-verzió-migráció). Mermaid-ábra + renderelt
export: `docs/rag-architektura.assets/adatfolyam.png`.

**ELTÉRÉS (tudatos)**: a fájl neve `docs/rag-architektura.md`, nem a kért `docs/ARCHITEKTURA.md`.
**Indoklás**: macOS/APFS alapértelmezett, case-insensitive fájlrendszeren `ARCHITEKTURA.md` és a
repóban már létező, más tartalmú `docs/architektura.md` (a teljes rendszer — nem csak RAG —
architektúráját leíró, korábbi fájl) **ugyanaz a fájl** lenne. A szó szerinti név vagy hibázott
volna, vagy csendben felülírta volna a meglévő dokumentumot. A döntés F2-nél lett rögzítve
(`docs/implementation/05-rag-pipeline.md`, "Rögzített döntések" 5. pont: _"Dokumentáció-helyzet: új
fájl `docs/rag-architektura.md` (nem `ARCHITEKTURA.md`, case-insensitive FS miatt)."_). A tartalmi
követelmények (adatfolyam-ábra, összes felsorolt eset) maradéktalanul teljesülnek, csak a fájlnév
tér el.

## 6. Költségbecslés

**Kért**: rövid bekezdés a README-ben — mennyibe került az ingest, mennyibe egy kérdés a teljes
pipeline-nal, saját (nem órai) számokból.

**Nálunk**: README "Költség (RAG)" szakasz — ingest ≈$0,0044 (768 chunk, 218 676 token, valós DB-n
mérve), egy kérdés ≈$0,0067 (valós logolt/mért `tokenUsage`-ból, nem becslés). Részletes
módszertan és a `docs/roi.md` keresztellenőrzése: `docs/rag-pipeline.md` "Költségbecslés (F9)"
szakasz.

**Eltérés**: nincs.

---

## Leadandók — kereszthivatkozás

| Leadandó                                       | Hol                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Működő repo, futtatási instrukciók             | README "Futtatás és tesztelés"                                                                                |
| Chunking-stratégia + indoklás                  | `docs/rag-pipeline.md` "Döntések és indoklásuk"                                                               |
| Golden set + nyers-vs-pipeline + negatív teszt | `docs/rag-pipeline.md` "Golden set" szakasz                                                                   |
| Multi-provider szereposztás                    | `docs/rag-pipeline.md` "Multi-provider routing" szakasz                                                       |
| `docs/ARCHITEKTURA.md` + ábra                  | `docs/rag-architektura.md` (**fájlnév-eltérés, ld. 5. pont**) + `docs/rag-architektura.assets/adatfolyam.png` |
| Költségbecslés                                 | README "Költség (RAG)" szakasz + `docs/rag-pipeline.md` "Költségbecslés (F9)"                                 |

## Amit a HF értékel — önértékelés

- **"A chunking-döntéseid a tudásbázisodból következnek, nem másolatok"** — igen: mind az 5 döntés
  a 202 cikken ténylegesen mért struktúrára hivatkozik (H2-lefedettség, zaj-heading gyakorisága),
  nem generikus RAG-tanácsra. `docs/rag-pipeline.md`.
- **"A golden set valóban megmutatja, mit ad hozzá a HyDE és a rerank"** — igen, konkrét,
  tartalmilag indokolt példával (nem csak pontszám-hivatkozással): `docs/rag-pipeline.md`
  "Rerank-átrendezési részlet" szakasz.
- **"A grounding működik — a negatív teszt átmegy"** — igen, explicit PASS-kritériummal és valós
  CLI-transzkripttel bizonyítva, plusz egy extra megfigyeléssel (a grounding kettős rétegű: a
  kódszintű `weak`-jelzés ÉS az agent saját tartalmi ellenőrzése is védi): `docs/rag-pipeline.md`.
- **"Az architektúra-spec végiggondolt — az eseteket lefedi, az ábra követhető"** — igen, plusz a
  terven több önálló felülvizsgálati kör (séma-konvenció, diagram-szöveg konzisztencia,
  tranzakció-kezelés technikai korlátja) is átment, mielőtt lezárult: `docs/rag-architektura.md`.
- **"A routing-döntéseid indokoltak"** — igen, konkrét szerep-táblázattal: `docs/rag-pipeline.md`
  "Multi-provider routing" szakasz.

## Utólag pótolt tesztelési javítások (F10, F11)

**F10**: Az önellenőrzés során derült ki, hogy a `SYSTEM_PROMPT` (a grounding-szabályok forrása)
sem tartalom-asszerciós teszttel, sem a `docs/system-prompt.md`-vel való szinkron-ellenőrzéssel
nem volt védve — csak manuális CLI-teszttel. Pótolva: `packages/core/src/system-prompt.spec.ts`
(`docs/implementation/05-rag-pipeline.md`, F10). A szinkron-teszt írás közben egy valós,
formázási eredetű (prettier) driftet is elkapott a `docs/system-prompt.md` és a `SYSTEM_PROMPT`
között — ez önmagában igazolta a teszt hasznosságát.

**F11**: `npx vitest run --coverage` (`packages/core`) futtatásával konkrét, mérhető rések
derültek ki a "ránézésre jónak tűnő" tesztlefedettség mögött (94%/86%/91% → 98%/92%/94%
stmt/branch/func, 57→66 teszt) — legjelentősebb: a `logInteraction` (a `--show-prompt`/audit-
naplózás mögötti logika) **0%-on** állt, mert minden hívó helyen mockolva volt. Pótolva:
`packages/core/src/log-interaction.spec.ts` (ÚJ), plusz kisebb rések (`ask-agent.ts` ismeretlen-
tool ág, `ANTHROPIC_MODEL` env-fallback ágak, `chunk.ts` frontmatter/üres-input edge case-ek) —
`docs/implementation/05-rag-pipeline.md`, F11.
