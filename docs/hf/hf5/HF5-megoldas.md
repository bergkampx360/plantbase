# HF5 — Ügyfélirányú PoC és üzleti döntéselőkészítő anyag

## 1. A use case

A plantbase eddig kizárólag befelé dolgozott: a lakberendező kollégák kérdeztek tőle a
katalógusról és a gondozásról. Ez a házi ezt a rendszert fordítja kifelé — nem újat épít,
hanem a meglévő agent-logikát (tool-ok, RAG-tudásbázis, modellhívás) új bejárattal látja el,
hogy a webshop **saját vásárlói** is közvetlenül használhassák.

Az új felület egy 24/7 elérhető ügyfél-chat (`/customer`), ami:

1. **Termékkérdésekre válaszol** egy szűkített, biztonságos termékkereséssel (kategória, fény-
   és öntözési igény, ár, háziállat-/gyerekbiztonság szerint szűrve).
2. **Gondozási kérdésekre válaszol** a meglévő, 202 cikkes tudásbázisból, forráshivatkozással.
3. **Emberhez irányít**, ha bizonytalan a válasz, vagy a kérés olyan, ami ítélőképességet
   igényel (egyedi/nagytételes rendelés, panasz, számlázási kérdés) — ez az **emberi
   jóváhagyási pont**: semmi nem jut el az ügyfélhez addig, amíg egy munkatárs jóvá nem
   hagyja a `/staff/handoffs` felületen.

### Kapcsolódás a HF4-hez: egy tudatosan kezelt kockázat

A HF4-es AI Act-elemzésem saját maga jelezte előre ezt a lépést mint kockázat-ugrató
tényezőt: ha a meglévő, addig csak belső webes chat-felületet valaha kiterjesztjük az
ügyfelekre, és a válaszok meggyőzési/sürgetési mintázatot tartalmaznának, az a
legszigorúbb szabályozási kategóriába (tiltott gyakorlat) ugratná a rendszert — és
kifejezetten megjegyeztem, hogy ez nem elméleti, hanem közeli határeset, mert a technikai
alap (a webes UI) már készen állt. Ez a HF5 pontosan ez a lépés. Ezért a rendszer
tudatosan két konkrét védelmet épített be, nem utólag, hanem a tervezés részeként: az
ügyfél-chat mindig, állandóan jelzi, hogy AI-asszisztenssel beszélget a vásárló (nem élő
munkatárssal), és a rendszer-utasítás explicit tiltja a mesterséges sürgetést/nyomásgyakorlást
("csak ma", "utolsó darab" jellegű megfogalmazásokat), akkor is, ha egy adott állítás
igaz lenne. Az emberi jóváhagyási pont ezen felül egy második védelmi réteg: minden olyan
esetben, ami ítélőképességet igényelne, a rendszer nem is próbál meg maga dönteni.

## 2. Melyik fájdalmakat oldja meg — és melyiket nem

A cégvezető tíz fájdalma közül ez a PoC hármat old meg ténylegesen:

| #   | Fájdalom                                                  | Hogyan oldja meg                                                                                                                                                                                                              |
| --- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Munkaidőn kívül nincs válasz                              | A chat 24/7 elérhető, nem staff-órákhoz kötött.                                                                                                                                                                               |
| 2   | Ugyanazokat a kérdéseket válaszoljuk meg naponta százszor | A termék- és gondozási kérdések nagy része (méret, ár, fényigény, öntözés, gyakori betegségtünetek) közvetlenül, emberi beavatkozás nélkül megválaszolható.                                                                   |
| 8   | A sürgős ügy ugyanabban a sorban áll, mint a triviális    | Az emberi jóváhagyási pont ténylegesen **külön sorba** tereli azt, amit a rendszer nem tud vagy nem szabad megválaszolnia — a staff nem az összes bejövő üzenetet nézi végig, csak azokat, amik tényleg eldöntést igényelnek. |

**Amit ez a PoC kifejezetten NEM old meg:**

- **#3 — új ügyfél elveszettsége.** A chat válaszol kérdésekre, de nincs proaktív onboarding-
  folyamat, ami végigvezetné az új vásárlót az első heteken.
- **#4 — ügy-státusz láthatóság.** A chat nem tudja megmondani, hol tart egy már leadott
  rendelés vagy egy korábbi eszkaláció — nincs bekötve semmilyen rendeléskezelő rendszerhez.
- **#5 — személyre szabás.** Minden vásárló ugyanazt az egyen-élményt kapja, nincs vásárlói
  profil vagy korábbi vásárlási előzmény figyelembe vétele.
- **#6 — tanulás a panaszokból.** Az eszkalációk egyenként kerülnek a staff elé, de nincs
  automatikus összesítés vagy trendelemzés arról, mit kérdeznek/panaszolnak a vásárlók.
- **#7 — szerződéskötés gyorsítása.** Ez a PoC nem érinti az értékesítési/szerződéses
  folyamatot.
- **#9 — staff-staff válasz-konzisztencia.** A chat maga konzisztens, de ez nem javítja azt,
  hogy a kollégák egymástól eltérően válaszolnak — az emberi jóváhagyási pontnál a staff
  saját belátása szerint dönt, ott ugyanúgy jelen lehet az eltérés.
- **#10 — csendben távozó ügyfél.** Nincs semmilyen jelzés-aggregálás (rendelési gyakoriság,
  panaszok, e-mail-megnyitás) — ez egy teljesen más, adatvezérelt kezdeményezés lenne.

## 3. Az emberi jóváhagyási pont — hogyan működik ténylegesen

Ez a PoC szándékosan **egyetlen, szűk kivételt** tesz azon az elven, hogy az agent sosem
módosít adatot: egy új, `customer_handoffs` nevű váró-tábla, amibe az agent kizárólag
**beszúrhat** sort (egy külön, csak-erre-a-célra jogosult adatbázis-felhasználóval, ami
semmit nem tud visszaolvasni — még a saját beírt sorát sem). Minden más adatbázis-hozzáférés
változatlanul olvasás-only marad.

A folyamat:

1. Az agent felismeri, hogy a kérdésre nem tud/nem szabad választ adnia (két gyenge
   tudásbázis-találat, vagy nyilvánvalóan hatókörön kívüli/ítélőképességet igénylő kérés).
2. Egy pending státuszú sort hoz létre a váró-táblában, a kérdéssel, az indoklással és
   (ha van) egy javasolt válasz-vázlattal.
3. A vásárlónak jelzi, hogy a kérdését kollégának továbbította — **nem ígér konkrét
   határidőt, és nem generál végleges választ helyette**.
4. Egy munkatárs a `/staff/handoffs` felületen látja a függőben lévő eseteket, és
   Jóváhagyás/Elutasítás gombbal dönt. Amíg ez meg nem történik, semmi nem jut el a
   vásárlóhoz.

## 4. A végigvitt demó-forgatókönyv

A PoC-t három, valós adaton, élőben generált válasszal futó ággal mutatom be — egyik válasz
sincs előre megírva, csak a beírt kérdés választott.

**A ág — közvetlen válasz.** A vásárló egy gondozási kérdést tesz fel ("Sárgulnak a
szobanövényem levelei, mit rontok el?"). A rendszer a tudásbázisból ad választ,
forráshivatkozással, eszkaláció nélkül.

**B ág — hatókörön kívüli eszkaláció.** A vásárló egy egyedi, nagytételes céges megrendelést
kér egyedi árazással és számlázással. A rendszer felismeri, hogy ez a katalógus-keresés és a
gondozási tudásbázis hatókörén kívül esik, és azonnal jóváhagyásra küldi — nem próbál
találgatni árat vagy feltételeket.

**C ág — bizonytalanság-demó.** Egy olyan gondozási kérdésre, amit a tudásbázis nem fed le
kellő részletességgel (a tesztelés során ez organikusan előjött: egy olajfa sárgulásáról és
szokatlan virágzásáról szóló, kétkörös beszélgetés), a rendszer nem fabrikál választ — jelzi
a bizonytalanságot, és emberi felülvizsgálatra küldi.

Mindhárom ágat éles környezetben, valódi adatbázis és valódi modellhívás ellen futtattam
végig, a keletkezett napló- és adatbázis-bejegyzések ellenőrzésével együtt. A tesztelés
közben két, a végigviteli logikát érintő hibát is találtam és javítottam: egyet abban, ahogy
a rendszer a korábbi beszélgetési kört adta vissza a modellnek (emiatt hosszabb
beszélgetésben a modell a saját korábbi tool-használatát nem látta, és ez odáig fajult, hogy
egy eset azt állította, eszkalált, miközben ténylegesen nem hívta meg az erre szolgáló
funkciót), egyet pedig magában az eszkalációs szabály megfogalmazásában (ugyanez a
jelenség — a modell szövegesen "letudta" az eszkalációt anélkül, hogy ténylegesen
végrehajtotta volna). Mindkettőt javítottam, és a javítás után többszöri, egymást követő
éles újrafuttatással is megerősítettem, hogy a hibás forgatókönyv immár helyesen viselkedik.

## 5. Mi nem része a rendszernek

- **Nincs vásárlói azonosítás/bejelentkezés.** A demó egy böngésző-munkamenet = egy
  beszélgetés modellt követ, nincs fiók vagy korábbi vásárlási előzmény.
- **Nincs tényleges ügyfél-értesítési csatorna.** A staff "Jóváhagyás" gombja a belső
  állapotot állítja — a vásárló felé ma nem megy ki automatikus e-mail vagy egyéb üzenet a
  jóváhagyásról, ezt egy éles bevezetésnél pótolni kell.
- **Nincs rendeléskezelő-integráció.** A rendszer nem lát rendelést, számlát vagy szállítási
  státuszt.
- **Nincs automatikus anonimizálás vagy megőrzési-idő szabály** a naplózott/tárolt adatokra —
  ez nyílt, dokumentált hiányosság, nem elfelejtett részlet (ld. `qna.md`).

## 6. Kapcsolódó leadandók

- Prezentáció (üzleti indoklás, adattérkép, rollout terv, mérési terv): [`eloadas.html`](eloadas.html)
  (a tényleges, bemutatható diasor), tartalmi forrásként/előadói jegyzetként [`eloadas-vazlat.md`](eloadas-vazlat.md)
- Teljes mérési terv tábla: [`meresi-terv.md`](meresi-terv.md)
- Kérdéslap (6 megadott + 2 saját kérdés): [`qna.md`](qna.md)
- A tényleges kód: `packages/core/src/tools/request-human-handoff.ts`,
  `packages/core/src/tools/search-products.ts`,
  `packages/core/src/agent/system-prompt-customer.ts`, `apps/server/src/app.ts`
  (`/api/customer/chat`, `/api/handoffs`), `apps/web/src/app/customer-app.tsx`,
  `apps/web/src/app/staff-handoffs-page.tsx`.
