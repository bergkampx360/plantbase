# HF4 — Ki felel, ha az agent hibázik? (AI Act megfelelőség)

## 1. A kiindulási use case

> Kiindulási use case: **A) plantbase**, a jelenlegi projekt (`docs/brs-plantbase.md`,
> `docs/hf3-megfeleles.md`). A use case tényszerű bemutatása a 4. pont emailjében történik, ahogy a
> feladat A/B választásánál a HF engedi.

## 2. AI Act besorolás, indoklással

### Mit csinál ténylegesen a plantbase

Agent, amit a **belsőépítész** (nem a végfelhasználó/vásárló) használ: természetes nyelvű
kérdést fordít SQL-re a növény-katalógus (`products`) felett, read-only lekérdez, és
gondozási-tanácsadó RAG-válaszokat ad egy cikk-tudásbázisból. Két felületen érhető el: **CLI**-n
(`apps/cli`) és egy **böngészőben futó webes chat-felületen** (`apps/web`: React SPA, streamelt
válasz, tool-hívás-kártyák; `apps/server`: Express, streamelő `POST /api/chat` — a G-rész,
`docs/implementation/06-web-chat.md`, G1–G7, mind lezárva). A két felület ugyanazt az
agent-logikát (tool-ok, system prompt, modellválasztás) használja a `packages/core`-ból, csak a
belépési pont más. A CLI-interakciók a `logs/*.jsonl`-be naplóznak; a webes felület emellett a
beszélgetés-történetet (`Thread`/`Message`) **adatbázisban is perzisztálja** (Prisma, RW
kapcsolat), hogy a "korábbi beszélgetések" lista működjön. Nincs vásárlói/ügyfél-fiók, nincs
rendelés-írás, nincs pontozás vagy döntés természetes személyekről — a kimenet mindkét felületen
egy növénylista-javaslat egy szobához. **Fontos árnyalat**: a webes felületen nincs
alkalmazás-szintű autentikáció/jogosultságkezelés (`docs/brs-plantbase.md` szerint ez explicit
kívül esik a v1 hatókörön) — a "csak a belsőépítész használja" állítás jelenleg szervezési/
hálózati hozzáférés-korlátozáson nyugszik, nem technikai kényszerítésen.

### Kockázati szint: minimális/nem szabályozott kockázat

Az AI Act (2024/1689 rendelet) 6. cikke szerint egy rendszer akkor magas kockázatú, ha (1) az I.
melléklet szerinti uniós harmonizációs jogszabály hatálya alá tartozó termék biztonsági
komponense, vagy (2) a III. melléklet valamelyik pontjában felsorolt céllal használják.

- **[I. melléklet](#i-melléklet)**: a plantbase nem biztonsági komponens semmilyen szabályozott terméktípusban
  (nem gép, orvostechnikai eszköz, játék stb.) — nem releváns.
- **[III. melléklet, 8 kategória](#iii-melléklet)** (biometria; kritikus infrastruktúra; oktatás; foglalkoztatás;
  alapvető magán- és közszolgáltatásokhoz való hozzáférés — ide tartozik pl. a hitelképesség-
  értékelés és a szociális támogatásra jogosultság elbírálása; bűnüldözés; migráció/határellenőrzés;
  igazságszolgáltatás/demokratikus folyamatok): a plantbase **egyik pontba sem tartozik**. Nem
  értékel természetes személyt (sem alkalmazottat, sem vásárlót), nem dönt hozzáférésről vagy
  jogosultságról, nem foglalkoztatási vagy bűnüldözési kontextusban fut.

Mivel a 6. cikk egyik feltétele sem teljesül, a rendszer **nem esik a III. fejezet (8–27. cikk)
kötelezettségei alá**. Ami marad: a 4. cikk szerinti AI-műveltségi (AI literacy) kötelezettség a
csapat felé, és önkéntesen csatlakozhatunk a 95. cikk szerinti magatartási kódexekhez. Limited-risk
(50. cikk, átláthatósági kötelezettség chatbotoknál) sem alkalmazandó szigorúan, mert a plantbase-t
nem a végfelhasználó/vásárló használja közvetlenül, hanem a belsőépítész (szakmai, nem laikus
felhasználó) — ez a webes felületre is igaz, csak a _csatorna_ böngésző, a _célközönség_ nem
változik. Mivel viszont a belsőépítész (mint természetes személy) most már ténylegesen, élőben,
egy böngészős chat-UI-n keresztül beszélget egy AI-rendszerrel (nem csak parancssori
kérés-válasz), az 50. cikk szellemisége (legyen egyértelmű, hogy AI-jal beszélgetünk) gyakorlatilag
is releváns lett, nem csak elméletileg — a plantbase-branding és a chat-UI kontextusa miatt ez ma
egyértelmű, de **best practice-ként** érdemes lenne ezt explicit is kimondani a felületen, és
ugyanígy jelezni, ha valaha a kimenet közvetlenül az ügyfélhez kerülne (ld. Határeset-elemzés 3.
sora — ami a meglévő webes UI miatt már nem csak elméleti eset).

### Szerep a láncban: szolgáltató és üzembe helyező egyszerre

A csapat saját magának fejleszti és saját belső célra üzemelteti a rendszert (nem adja el, nem
licenceli más cégnek) → a 3. cikk (3) és (4) bekezdése szerinti **szolgáltató és üzembe helyező
szerep egybeesik**. Nincs harmadik fél, aki "piacra helyezné" a rendszert tőlünk függetlenül.

**Mikor válna szét a szerep:** ha a plantbase-t más lakberendező cégeknek is elkezdenénk
kínálni (SaaS-ként vagy licencben) — attól a pillanattól mi lennénk a szolgáltató (25. cikk), az
átvevő cégek pedig üzembe helyezők, saját, önálló kötelezettségekkel (26. cikk).

### Határeset-elemzés: mitől ugrana egy szinttel feljebb

| #   | Apró változtatás                                                                                                                                                                                                                                                                                                                                                                                                                                          | Miért ugratná a szintet                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A naplózott interakciókból **belsőépítész-teljesítmény pontszámot** vagy feladatkiosztást képeznénk (pl. "ki dolgozik gyorsabban, kire bízzunk több ügyfelet")                                                                                                                                                                                                                                                                                            | [Annex III 4. pont](#iii-melléklet-4-pont-foglalkoztatás) (foglalkoztatás: munkavállalók teljesítményének értékelése/feladatkiosztás) — a **munkavállalóra**, nem a vásárlóra vonatkozó automatizált értékelés triggereli, függetlenül attól, hogy a végfelhasználó felé a rendszer változatlan marad                                                           |
| 2   | Az agent elkezdene **ügyfél-fizetőképességet/hitelezhetőséget** értékelni (pl. egy jövőbeli "vásároljon most, fizessen később" bútor-finanszírozási funkcióhoz pontszámot adna a vásárlóról)                                                                                                                                                                                                                                                              | [Annex III 5(b) pont](#iii-melléklet-5b-pont-alapvető-szolgáltatások) (természetes személy hitelképességének értékelése) — még akkor is, ha a végső döntést ember hozza, az **értékelő funkció** maga triggerel, a [6. cikk (3) bekezdés](#6-cikk-3-bekezdés) szűk kivétele csak akkor védene, ha a pontszám bizonyíthatóan nem befolyásolja érdemben a döntést |
| 3   | A meglévő webes chat-UI (`apps/web`) hozzáférését **kiterjesztenénk az ügyfélre** (pl. egy ügyfélportálra beágyazva, vagy a jelenlegi, auth nélküli felület URL-jét egyszerűen megosztva vásárlókkal) — ez **nem új komponens megépítését**, csak egy hozzáférés-kiterjesztési döntést igényelne, mert a technikai alap már készen áll — és a válaszok finomhangolt meggyőzési/sürgetési mintázatot (pl. mesterséges sürgősség, "csak ma") tartalmaznának | 5. cikk szerinti tiltott gyakorlat (manipulatív technika) kockázata — nem "egy szinttel feljebb", hanem a legszigorúbb kategóriába; **ez a sor a webes UI megléte miatt ma közelebbi, valós határeset, mint egy pusztán hipotetikus jövőbeli fejlesztés**                                                                                                       |

## 3. Átfedő szabályozások

| Szabályozás                                                 | Érinti-e?           | Indoklás                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GDPR**                                                    | **Igen**            | A belsőépítész szabad szöveges kérdésekben ügyfél-adatokat írhat be (pl. "X ügyfél nappalija, 25 m², 400e Ft büdzsé, allergiás gyermek van otthon") — ez a szöveg a jelenlegi stack szerint (`docs/stack.md`) **egy amerikai LLM-szolgáltatóhoz (Anthropic/OpenAI API)** megy ki feldolgozásra. Ha bármely mező azonosítja a természetes személy ügyfelet (név, cím), ez a GDPR hatálya alá tartozó adatkezelés (5., 6. cikk jogalap; 28. cikk adatfeldolgozói szerződés az LLM-vendorral; nemzetközi továbbítás esetén SCC/megfelelőségi mechanizmus a III. fejezet szerint). **Két, egymástól független tárolási felület** hordozza ezt az adatot: a CLI-oldali naplózás (`logs/*.jsonl`, FR4), és a webes felület `Thread`/`Message` adatbázis-táblái (Postgres, Prisma RW) — utóbbi azért is releváns, mert lekérdezhető, kereshető formában, auth nélkül elérhető UI mögött perzisztál, ami a megőrzési idő, a törlési kérelem (17. cikk) kezelhetősége és a hozzáférés-szabályozás kérdését mindkét tárolóra külön-külön felveti. |
| **MDR** (orvostechnikai eszköz rendelet)                    | **Nem**             | A plantbase növénykatalógus-lekérdezés és gondozási tanács — nem diagnosztizál, nem kezel, nem orvosi rendeltetésű terméket támogat. A gondozási RAG-tartalom sem egészségügyi állapotra, hanem növényápolásra vonatkozik. Nincs átfedés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **DORA** (digitális működési reziliencia, pénzügyi szektor) | **Nem**             | A plantbase üzemeltetője nem DORA-hatálya alá tartozó pénzügyi entitás (nem bank, biztosító, befektetési szolgáltató); a rendszer nem kritikus pénzügyi funkciót lát el. Nincs átfedés.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Fogyasztóvédelmi irányelvek (UCPD)**                      | Csak látens, ma nem | Amíg az agent kimenete a belsőépítészhez megy (B2B-szerű belső eszköz), nem releváns. Ha a Határeset-elemzés táblázat 3. sora szerinti közvetlen ügyfél-interakció megvalósulna, a tisztességtelen kereskedelmi gyakorlatok szabályai (pl. megtévesztő ár-összehasonlítás, mesterséges sürgetés) élesbe lépnének.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 4. Email a jogi csapatnak

> Terjedelem: max. 1 oldal, ahogy a feladat kéri.

```
Tárgy: AI Act besorolási javaslat és megerősítés-kérés — plantbase belső agent

Kedves Jogi Csapat!

A plantbase egy belső AI-eszköz, amit a lakberendezőink használnak: természetes nyelven kérdeznek
a növénykatalógusunkról (méret, fény- és vízigény, ár, készlet), az agent SQL-t generál, lekérdezi
a (kizárólag olvasható) adatbázist, és a lakberendezőnek ad választ. Kiegészítő funkcióként egy
gondozási cikk-adatbázisból is tud tanácsot adni, forrásra hivatkozva. Két felületen érhető el:
parancssorból (CLI) és egy böngészőben futó webes chat-felületről (streamelt válasz, korábbi
beszélgetések listája) — ugyanaz az agent-logika áll mindkettő mögött, csak a belépési pont más.

Kulcsfontosságú tények a besoroláshoz:
- Ki használja: kizárólag a saját, belső lakberendező kollégáink — nem a végfelhasználó/vásárló.
  A webes felületen jelenleg nincs alkalmazás-szintű bejelentkezés/jogosultságkezelés, ezt a
  hozzáférést szervezési/hálózati korlátozással biztosítjuk — ezt tudatosan jelezzük, mert ez a
  besorolás egyik hallgatólagos előfeltétele.
- Milyen adatot kezel: a növénykatalógus (nem személyes adat), valamint a lakberendező szabad
  szöveges kérdései, amelyek alkalmanként ügyfél-releváns részleteket tartalmazhatnak (pl. szoba
  mérete, büdzsé, esetenként az ügyfél neve). Ez a szöveg egy amerikai LLM-szolgáltató (Anthropic/
  OpenAI) API-jához megy ki feldolgozásra. A CLI-interakciók fájlba naplózódnak, a webes felület
  beszélgetés-története emellett adatbázisban is tárolódik (visszakereshető formában).
- Milyen döntést hoz vagy befolyásol: az agent NEM hoz és NEM befolyásol döntést emberről —
  növénylista-javaslatot ad egy szobához. Nincs pontozás, rangsorolás vagy értékelés természetes
  személyről.
- Mi történik hibánál: rossz növényjavaslat esetén a lakberendező (szakmai felhasználó) észreveszi
  és korrigálja a végleges ajánlatban — nincs automatikus, felügyelet nélküli kimenet az ügyfél felé.

Javasolt besorolás: az AI Act 6. cikke szerint a rendszer NEM minősül magas kockázatúnak — nem
biztonsági komponens (I. melléklet), és egyik III. mellékleti kategóriába sem tartozik (nem
biometrikus, nem foglalkoztatási, nem alapvető szolgáltatáshoz való hozzáférést érintő stb.).
Javaslatom: minimális kockázat, a 4. cikk szerinti AI-műveltségi kötelezettség betartásával.
Szerepünk: egyszerre szolgáltató és üzembe helyező (saját fejlesztés, saját belső használat).

Amit figyelni fogunk, mert szintet ugrathat: ha a rendszert (a) munkavállalói teljesítményméréshez,
vagy (b) ügyfél-hitelképesség/fizetőképesség értékeléséhez kezdenénk használni, vagy (c) a kimenet
(akár a meglévő webes felület hozzáférésének kiterjesztésével) közvetlenül az ügyfélhez kerülne.

Kérésünk: kérjük, erősítsék meg a fenti besorolást és a szerep-meghatározást, és jelezzék, ha az
LLM-szolgáltatóval kötött adatfeldolgozói szerződést (GDPR 28. cikk), a nemzetközi adattovábbítás
jogalapját, vagy a webes felület auth nélküli, adatbázisban is naplózó jellegét szükségesnek látják
felülvizsgálni, mielőtt a naplózott/tárolt ügyfél-releváns szövegmezőket éles használatban
bővítenénk.

Köszönjük,
[Mérnöki csapat]
```

## 5. A kapott use case elemzése — Fintech „QueueGenius"

> A négy közül a **QueueGenius**-t választom: ez adja a legélesebb besorolási feszültséget, mert
> közvetlenül egy Annex III-listás terület (hitelkérelem) szomszédságában mozog anélkül, hogy
> állítása szerint azt a funkciót látná el.

### 5.1 Saját elemzés

**Mi szól a "minimális kockázat" mellett:**

- A [III. melléklet 5(b) pontja](#iii-melléklet-5b-pont-alapvető-szolgáltatások) kifejezetten a **hitelképesség értékelését vagy hitelpontszám
  megállapítását** nevesíti. A QueueGenius ezt nem végzi — a teljességi pontszám a _dokumentáció
  hiánytalanságáról_ szól (van-e minden irat), nem az ügyfél fizetőképességéről. Ez tartalmilag más
  attribútum.
- A végső döntést minden esetben az ügyintéző hozza; az agent kimenete a munkalista sorrendje, nem
  egy ajánlás vagy pontszám a hitelkérelemről magáról.
- Emiatt szerintem a helyes érvelési sorrend NEM az, hogy "III. mellékletbe esik, de a [6. cikk (3)
  bekezdés](#6-cikk-3-bekezdés) szűk kivétele miatt mégsem magas kockázatú" — hanem az, hogy a rendszer **be sem lép** a
  III. melléklet hatókörébe, mert a tervezett rendeltetése (dokumentum-teljesség + sorba rendezés)
  nem azonos az 5(b) pontban megnevezett rendeltetéssel (hitelképesség-értékelés). A 6. cikk (3)
  bekezdés csak tartalék érv, ha valaki utólag azt állítaná, hogy a teljességi pontszám burkoltan
  hitelképességi jelzésként funkcionál.

**Mi szól a "magas kockázat" / legalábbis "figyelendő, határeset" mellett:**

- A sorba rendezés **funkcionálisan befolyásolja a kimenetet**: ha egy ügy szisztematikusan hátrébb
  kerül (pl. mert az ügyfél nehezebben tud dokumentumot beszerezni — ami korrelálhat védett
  tulajdonságokkal, pl. jövedelmi helyzettel, lakóhellyel), az érdemi hátrányt okozhat, még ha a
  "döntést" formálisan az ügyintéző hozza is. Az AI Act indokolása (Recital 53) és a 6. cikk (3)
  bekezdés is kimondja: ha a rendszer _érdemben befolyásolja_ egy Annex III-hoz kapcsolódó
  eredményt, a kivétel nem alkalmazható.
- Ha a "gördülékeny ügyek előre" logika azt jelenti, hogy a hiányos dokumentációjú ügyek a
  gyakorlatban **soha nem jutnak sorra ésszerű időn belül**, ez de facto elutasításhoz vezethet
  emberi felülvizsgálat nélkül — ez már nem "szűk, eljárási feladat" (6. cikk (3) a) pont), hanem
  érdemi kimenet-befolyásolás.
- Az, hogy a rendszer **amerikai SaaS-ra épül**, és a bank csak promptot/szabályt konfigurál, nem
  változtat a kockázati szinten (a rendeltetés/funkció számít, nem a technikai megvalósítás helye),
  de élesíti a szerep-kérdést (ld. lent).

**Saját álláspontom, feltételekhez kötve:** **minimális kockázatúnak** sorolnám, **három feltétellel**,
amit dokumentálni és auditálhatóan bizonyítani kell:

1. a teljességi pontszám **soha nem jut vissza** a hitel-scoring rendszerbe vagy az elbíráló
   döntéstámogató felületére másik jelzésként (architektúra-szintű "tűzfal");
2. a sorba rendezés **maximális várakozási idő-korlátot** garantál minden ügynek (nincs
   "végtelenül hátrasorolt" eset — időszakos audit ezt igazolja);
3. az ügyintéző ténylegesen hozzáfér és megvizsgálja a teljes iratanyagot minden ügyben, függetlenül
   a sorrendtől (a sorrend a _feldolgozás ütemezését_, nem a _feldolgozás mélységét_ befolyásolja).

Ha bármelyik feltétel sérül, az érvelés átbillen a "érdemi befolyásolás" oldalra, és a rendszert
[Annex III 5(b)](#iii-melléklet-5b-pont-alapvető-szolgáltatások) alá kellene sorolni, teljes III. fejezet kötelezettséggel.

**Szerep-kérdés:**

- **Szolgáltató**: elsődlegesen az amerikai SaaS-vállalat (ő fejleszti/hozza piacra az alap
  AI-rendszert). A bank csapata, amely promptokat és szabályokat konfigurál, a 25. cikk (1)
  bekezdés szerint akkor válna (társ-)szolgáltatóvá, ha a módosítása **"lényeges módosításnak"**
  minősül (pl. a rendeltetést megváltoztatja, vagy a rendszert saját név/márka alatt piacra helyezi
  _mások_ felé). Mivel itt a bank **kizárólag saját belső használatra**, saját márkanév alatt (nem
  piacra helyezve harmadik feleknek) használja, ez inkább üzembe helyezői pozíció, nem
  szolgáltatóvá válás — de a prompt/szabály-konfiguráció mértéke (mennyire változtatja meg a
  rendszer viselkedését) jogi véleményt igényel.
- **Üzembe helyező**: a bank — ő használja saját felelősségi körben, saját üzleti tevékenysége
  során (3. cikk (4) bekezdés).
- Ha a rendszer valaha **magas kockázatúvá** válna (ld. feltételek fent), a bank üzembe helyezői
  kötelezettségei (26. cikk) élesben aktiválódnának, és tisztázni kellene, hogy a SaaS-vendor és a
  bank közötti szerződés hogyan osztja meg a szolgáltatói kötelezettségeket (technikai dokumentáció,
  naplózás-hozzáférés stb.) — enélkül a bank nem tudná teljesíteni a 26. cikk szerinti kötelezettséget.

### 5.2 LLM-teszt

**Módszer:** egy külön, a saját elemzésemtől független, kontextus nélküli Claude-subagentnek adtam
oda a use case-t **pontosan a fenti (PDF-ből vett) szöveggel**, és megkértem, hogy önállóan
sorolja be. A cél: valódi, nem "elsimított" összevetés.

- **Használt modell:** Claude Sonnet 5 (`claude-sonnet-5`) — a subagent saját maga nyilatkozott a
  modellazonosítóról a válasz végén.
- **Prompt** (a subagentnek adott instrukció, tömörítve — a teljes instrukció tartalmazta a
  QueueGenius-brief szó szerinti szövegét is):

  > "Classify this system under the EU AI Act. Specifically answer: 1. What risk tier does this
  > fall under (...)? Cite the specific article or Annex III point you rely on. 2. Who is the
  > provider and who is the deployer in this chain (...)? Could roles shift? 3. What would need to
  > change for this to move to a different risk tier?"

- **A kapott válasz (teljes, szerkesztetlen chat-átirat):**

  > 1. Risk tier: This is minimal risk under the EU AI Act, not high-risk. The obvious trap is
  >    Annex III point 5(b) ("AI systems intended to be used for evaluating the creditworthiness of
  >    natural persons or establishing their credit score"), which is high-risk under Article 6(2).
  >    QueueGenius sits adjacent to that use case but, as described, does not perform this function:
  >    it does not touch scoring, does not evaluate creditworthiness, and does not influence the
  >    substantive credit decision. Its function is document-completeness checking (an OCR/checklist-
  >    type task) and work-queue triage/prioritization for human caseworkers. Prioritizing whose file
  >    gets looked at first is an operational/workflow-efficiency function, not an evaluation of the
  >    applicant's creditworthiness or credit risk.
  >
  > Two caveats I'd flag to the business, not resolve unilaterally: Recital 53 / Article 6(3)
  > offers a narrower-task carve-out from high-risk classification even for Annex III-listed
  > purposes (...) Watch function creep: if "completeness scoring" starts being used as a de facto
  > pre-screen (...) that starts to look like an input into the creditworthiness evaluation, and
  > the classification would need to be revisited.
  >
  > Given the facts as stated, this is minimal risk (...)
  >
  > 2. Provider vs deployer, and role-shifting: The US SaaS vendor is the upstream provider (...).
  >    The company configuring prompts and rules (...) becomes a provider for AI Act purposes if it
  >    makes "substantial modifications" (Article 25(1)) — inheriting full Chapter III obligations
  >    if and only if the system is high-risk. Since I'm classifying this as minimal risk, that
  >    provider-substitution mechanism doesn't bite yet (...) The bank is the deployer (Article 3(4))
  >    (...) Role-shift risk: If your team (...) makes "substantial modification" (...) you become
  >    the provider (...) if the reclassified system is high-risk.
  >
  > 3. What would move this to a different tier: Completeness score or its downstream
  >    deprioritization starts materially influencing who gets approved, delayed indefinitely, or
  >    rejected without full human review → triggers Annex III(5)(b) properly (...) The system starts
  >    interacting directly with natural persons in a way that could pass as human, or performs
  >    biometric/emotion inference on applicants → Article 50 transparency obligations attach (...)
  >    If completeness scoring is later reused to also feed a scoring/decisioning system (...) the
  >    "does not touch scoring" boundary that currently keeps this minimal-risk collapses (...)
  >
  > Bottom line for the file note: Minimal risk today, resting on (a) no creditworthiness
  > evaluation function and (b) the Article 6(3) narrow-task/no-material-influence argument as
  > backup.

### 5.3 Összevetés, dokumentált eltérések

| Szempont                        | Saját elemzés                                                                                                                                                  | LLM (Claude Sonnet 5)                                                                                                                                                         | Eltérés?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Végső besorolás                 | Minimális kockázat, **3 feltételhez kötve**                                                                                                                    | Minimális kockázat, "backup"-ként említve a 6. cikk (3) bek.                                                                                                                  | **Nincs érdemi eltérés** a végkövetkeztetésben                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Érvelési útvonal                | A rendszer **be sem lép** a III. mellékletbe (a rendeltetés nem azonos 5(b)-vel) → 6. cikk (3) csak tartalék érv                                               | A 6. cikk (3) bekezdést **elsődleges védőérvként** kezeli, mintha a rendszer alapból Annex III-hatókörben lenne                                                               | **Valódi eltérés**: az LLM jogilag "biztonságosabb", de kevésbé precíz utat választott — a különbség gyakorlati jelentőségű, mert ha valaki elfogadja, hogy a rendszer Annex III-hatókörben van (csak kivétellel mentesül), az erősebb dokumentációs terhet ró a szolgáltatóra (6. cikk (4): a kivétel igénybevételét dokumentálni és nyilvántartásba kell venni), mint ha a rendszer eleve kívül esik a hatókörön. Ezt nem simítom el: érdemes jogi véleményt kérni, melyik értelmezést fogadja el a hatóság. |
| Feltételek/monitorozandó pontok | 3 konkrét, auditálható feltétel (tűzfal a scoring felé, max. várakozási idő, teljes iratvizsgálat sorrendtől függetlenül)                                      | Hasonló szellemű, de kevésbé konkrét ("function creep", "material influence") — nincs számszerű/auditálható kritérium javasolva                                               | Az LLM helyesen azonosította a kockázati irányt, de **kevésbé operacionalizálható** ajánlást adott — ez emberi kiegészítést igényelt                                                                                                                                                                                                                                                                                                                                                                           |
| Szerep-elemzés                  | Szolgáltató = SaaS-vendor elsődlegesen; a bank promptkonfigurációja csak akkor húzza át szolgáltatóvá, ha "lényeges módosítás" — ehhez jogi véleményt javaslok | Gyakorlatilag azonos érvelés, 25. cikk (1) bekezdésre hivatkozva                                                                                                              | Nincs eltérés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Art. 50 (átláthatóság)          | Nem tárgyaltam külön                                                                                                                                           | Külön kiemelte, hogy ha a rendszer emberként "passzolható" ügyfél felé, vagy biometrikus/érzelem-inferenciát végezne, az Art. 50 függetlenül a kockázati szinttől aktiválódik | **Az LLM hozzáadott értéket adott** — ezt a saját elemzésembe visszaépítettem (ld. fenti táblázat, nem volt benne az első körben)                                                                                                                                                                                                                                                                                                                                                                              |

**Tanulság:** az LLM helyes végkövetkeztetésre jutott, de az érvelési útvonala jogi szempontból
kevésbé pontos (Annex III-hatókörbe sorolás + kivétel, ahelyett hogy a hatókörön kívüliséget
mondaná ki elsőként), és az ajánlásai kevésbé operacionalizálhatók. A felelősség (a végső besorolás
és a hozzá tartozó feltételek) az enyém marad — az LLM kutatási/sparring-segéd volt, nem döntéshozó.

## 6. Válasz a jogi csapat levelére: teendők és mérések

> A jogi csapat scenáriója (dr. Kertész Anna levele): egy ügyfélszolgálati AI-asszisztens
> bővítése, amely panaszok alapján kártérítési/kompenzációs javaslatot készít elő, és hozzáfér az
> ügyfelek szerződés- és tranzakciótörténetéhez — **magas kockázatú** besorolással (Annex III,
> alapvető szolgáltatásokhoz való hozzáférés befolyásolása). Az alábbi válasz erre a scenárióra
> vonatkozik, kötelezettségenként intézkedéssel és méréssel.

```
Tárgy: RE: AI-asszisztens — magas kockázatú besorolás, intézkedési terv

Kedves Anna!

Köszönjük az elemzést, a besorolással egyetértünk. Az alábbiakban kötelezettségenként a tervezett
műszaki/folyamat-intézkedést és a hozzá tartozó, auditkor bemutatható mérést/bizonyítékot adjuk meg.

**9. cikk — Kockázatkezelési rendszer**
Intézkedés: a fejlesztési életciklus részeként negyedéves kockázat-felülvizsgálati kör (design →
teszt → éles üzem → monitorozás), írásos kockázatnyilvántartással (azonosított kockázat, súlyosság,
mitigáció, felelős).
Mérés/bizonyíték: kockázatnyilvántartás verziótörténete (ki, mikor, mit módosított); legalább 1
dokumentált "red-team" teszteset negyedévente, ami kifejezetten a téves kompenzációs javaslat
kockázatát célozza.

**10. cikk — Adat-governance**
Intézkedés: a tanító/kontextus-adat (szerződés-, tranzakciótörténet) forrás- és minőség-ellenőrzése;
elfogultság-vizsgálat arra, hogy a javaslat nem korrelál-e védett tulajdonsággal (pl. lakóhely,
életkor-proxy).
Mérés/bizonyíték: adatforrás-leltár dátumozott verzióval; negyedéves elfogultság-riport (pl.
javasolt kompenzáció mértékének szórása demográfiai alcsoportok között, statisztikai szignifikancia-
teszttel).

**12. cikk — Naplózás és eseményrögzítés**
Intézkedés: minden javaslat-generáláshoz kötelező, törölhetetlen napló: bemenet (panasz + elért
adatok), modellverzió, generált javaslat, emberi döntés (elfogadva/módosítva/elutasítva), időbélyeg.
Mérés/bizonyíték: naplók megőrzési ideje és integritás-ellenőrzése (checksum/write-once tárolás);
lekérdezhető audit-riport bármely 90 napos időszakra 1 munkanapon belül.

**14. cikk — Emberi felügyelet**
Intézkedés: a rendszer kimenete kizárólag **javaslat**, jóváhagyás nélkül nem érvényesül; az
ügyintéző felületén kötelező "miért ezt javasolja" magyarázat jelenik meg minden javaslathoz;
"stop" gomb a rendszer teljes leállítására incidens esetén.
Mérés/bizonyíték: havi mintavételes audit — az ügyintézők hány %-ban módosítják/utasítják el a
javaslatot (ha ez tartósan 0% közelében van, az felülvizsgálatot indít: valódi felügyelet
történik-e, vagy "rubber-stamping").

**15. cikk — Pontosság és robusztusság**
Intézkedés: kiadás előtti és negyedéves regressziós teszt egy rögzített, emberi szakértő által
validált golden setre (releváns, tipikus és szélsőséges panasz-esetek); célzott teszt zajos/hiányos
bemenetre (pl. hiányos tranzakciótörténet).
Mérés/bizonyíték: golden-set pontosság-riport (elfogadási küszöb rögzítve, pl. ≥95% egyezés a
szakértői elbírálással); minden éles kiadás előtt kötelező, dokumentált teszt-futtatás blokkolja a
kiadást hiba esetén.

**26. cikk — Üzembe helyezői kötelezettségek**
Intézkedés: a rendszert kizárólag a rendeltetése szerint (kompenzációs *javaslat* előkészítés, nem
végleges döntés) használjuk; a szolgáltatóval (ha külső) szerződésben rögzítjük a technikai
dokumentáció és a naplózáshoz való hozzáférés biztosítását; belső képzés az ügyintézőknek a
rendszer korlátairól.
Mérés/bizonyíték: aláírt szolgáltatói szerződés-melléklet a dokumentáció-hozzáférésről; képzési
jelenléti ív + éves ismétlő teszt az ügyintézőknek.

**27. cikk — Alapjogi hatásvizsgálat szükségességének vizsgálata**
Intézkedés: elvégezzük a szükségesség-előszűrést (a rendszer alapvető szolgáltatáshoz — kártérítés/
kompenzáció — való hozzáférést befolyásol, érintett ügyfélkör mérete jelentős) → ez alapján teljes
alapjogi hatásvizsgálatot indítunk, jogi csapat bevonásával.
Mérés/bizonyíték: az előszűrés és a hatásvizsgálat írásos dokumentuma, dátumozva, jóváhagyva; a
hatásvizsgálat eredményeként azonosított mitigációk nyomon követése (backlog-tételek, határidővel).

Kérjük, erősítsék meg, hogy ez a lefedettség és mélység megfelel az auditelvárásoknak, és jelezzék,
ha valamelyik ponton szigorúbb mérési küszöböt (pl. konkrét %-os elfogadási határ a 15. cikknél)
szükségesnek látnak.

Üdvözlettel,
Mérnöki csapat
```

## Függelék — hivatkozott jogszabályhelyek összefoglalva

> A fenti pontok több helyen hivatkoznak az AI Act (Regulation (EU) 2024/1689) I. és III.
> mellékletére, valamint a 6. cikk (3) bekezdésére, anélkül hogy a tartalmukat idéznék. Az alábbi
> táblázatok **saját szavakkal összefoglalva**, forrásra hivatkozva adják vissza ezeket — nem szó
> szerinti jogszabályi idézetek —, hogy a fenti "nem tartozik egyik pontba sem" / "Annex III 4.
> pont" / "Annex III 5(b) pont" típusú állítások a rendelet szövegének külön elővétele nélkül is
> ellenőrizhetők legyenek.

### I. melléklet

Uniós harmonizációs jogszabályok listája (pl. gépek, játékok, liftek,
rádióberendezések, orvostechnikai eszközök, repülés, gépjárművek stb.), amelyek hatálya alá tartozó
termékekhez harmadik féltől független megfelelőségértékelés szükséges. Egy AI-rendszer az AI Act 6.
cikk (1) bekezdése alapján akkor magas kockázatú ezen az úton, ha egy ilyen termék **biztonsági
komponenseként** működik, vagy maga is ilyen termék. _(2. és 4. pontban hivatkozva — a plantbase nem
ilyen termék/komponens.)_

### III. melléklet

A 6. cikk (2) bekezdése alapján automatikusan magas kockázatúnak minősülő 8
felhasználási terület:

| Pont | Terület                                      | Rövid tartalom                                                                                                                                 |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Biometria                                    | Távoli biometrikus azonosítás, biometrikus kategorizálás érzékeny tulajdonság szerint, érzelemfelismerés                                       |
| 2    | Kritikus infrastruktúra                      | AI biztonsági komponensként digitális infrastruktúra, közúti forgalom, közművek (víz, gáz, fűtés, áram) kezelésében                            |
| 3    | Oktatás/szakképzés                           | Felvételi döntés, tanulási eredmény értékelése, oktatási szint megállapítása, vizsga alatti magatartás-monitorozás                             |
| 4    | Foglalkoztatás                               | Toborzás, jelöltszűrés, munkaviszonnyal kapcsolatos döntés, feladatkiosztás, teljesítmény-monitorozás                                          |
| 5    | Alapvető magán-/közszolgáltatások            | Közjuttatásra jogosultság elbírálása, **hitelképesség/hitelpontszám értékelése (5(b) pont)**, biztosítási kockázat árazása, segélyhívás-triázs |
| 6    | Bűnüldözés                                   | Kockázatértékelő eszközök, poligráf-jellegű rendszerek, bizonyíték-megbízhatóság értékelése, visszaesés-előrejelzés, bűnügyi profilalkotás     |
| 7    | Migráció, menekültügy, határellenőrzés       | Poligráf-alternatívák, belépési kockázatértékelés, vízumkérelem-elbírálás, személyazonosítás (úti okmány ellenőrzésén kívül)                   |
| 8    | Igazságszolgáltatás, demokratikus folyamatok | Bírói jogértelmezést segítő rendszerek, választási eredményt/szavazói magatartást befolyásoló rendszerek                                       |

A "plantbase egyik pontba sem tartozik" állítás (2. pont) e táblázat mind a 8 sorára nézve
igaz: nincs biometrikus adatkezelés (1), nem kritikus infrastruktúra-komponens (2), nem oktatási
kontextus (3), nem munkavállalót értékel (4 — csak feltételes, jövőbeli forgatókönyvben, ld.
Határeset-elemzés), nem ad hozzáférést/jogosultságot alapvető szolgáltatáshoz és nem értékel
hitelképességet (5), nem bűnüldözési, migrációs vagy igazságszolgáltatási kontextusban fut (6–8).

### III. melléklet 4. pont: Foglalkoztatás

Toborzás, jelöltszűrés, munkaviszonnyal kapcsolatos döntés, feladatkiosztás, teljesítmény-
monitorozás. _(A Határeset-elemzés 1. sorában hivatkozva.)_

### III. melléklet 5(b) pont: Alapvető szolgáltatások

Közjuttatásra jogosultság elbírálása, **hitelképesség/hitelpontszám értékelése**, biztosítási
kockázat árazása, segélyhívás-triázs. _(A Határeset-elemzés 2. sorában és az 5. pont
QueueGenius-elemzésben hivatkozva.)_

### 6. cikk (3) bekezdés

A III. mellékletben listázott rendszerek kivételt kaphatnak a magas
kockázatú besorolás alól, ha **nem jelentenek érdemi kockázatot** a természetes személyek egészségére,
biztonságára vagy alapjogaira, és az alábbi 4 feltétel valamelyike teljesül:

1. a rendszer **szűk, eljárási feladatot** lát el;
2. egy **már lezárt emberi tevékenység eredményét javítja**;
3. **döntési mintázatot vagy eltérést észlel**, anélkül hogy a korábbi emberi értékelést helyettesítené
   vagy érdemben befolyásolná, megfelelő emberi felülvizsgálat nélkül;
4. egy értékeléshez kapcsolódó **előkészítő feladatot** lát el.

Fontos kivétel: ha a rendszer **természetes személyek profilalkotását** végzi, a fenti feltételek
egyike sem menti fel a magas kockázatú besorolás alól. _(Az 5.1 pontban — "Saját elemzés" — és az
5.2 pontban — LLM-teszt összevetés — hivatkozva a QueueGenius kapcsán.)_

**Forrás:** Regulation (EU) 2024/1689 (AI Act), 6. cikk és I., III. melléklet — az összefoglalók a
rendelet hivatalos szövegének és az `artificialintelligenceact.eu` cikkelyenkénti feldolgozásának
felhasználásával készültek.
