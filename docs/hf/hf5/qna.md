# HF5 — Kérdéslap (kötekedőknek szánt kérdések)

## A hat megadott kérdés

**1. Milyen személyes adat kerül a rendszerbe, és melyik pontján tűnik el vagy
anonimizálódik?**

A vásárló szabadszöveges kérdése kerülhet be név, cím vagy más azonosító adattal, ha a
vásárló önként begépeli (pl. "a Kovács utcai lakásomba kell egy növény"). Ez a szöveg a
kérdés-válasz feldolgozásához eljut az Anthropic és — gondozási kérdés esetén — az OpenAI
API-jához, illetve tárolásra kerül a beszélgetés-előzményben és a naplófájlban. Őszintén
kell mondanom: ma **nincs automatikus anonimizálás vagy szűrés** egyik ponton sem — ez nem
egy megoldott probléma, hanem egy nyitott, dokumentált hiányosság, amit éles bevezetés előtt
kötelezően rendezni kell (pl. PII-szűrés a naplózás előtt, vagy explicit felhasználói
tájékoztatás, hogy ne osszon meg azonosító adatot).

**2. Hol fut a modell, hova utazik az adat, és mi az, ami sosem hagyja el a saját
környezetünket?**

A válaszgenerálás az Anthropic infrastruktúráján fut (egy gyors, olcsó modell), a gondozási
tudásbázis-keresés embedding- és rendezési lépései pedig az OpenAI-nál — mindkettő
amerikai, harmadik féltől üzemeltetett szolgáltatás. Ami sosem hagyja el a saját
környezetünket: a termékkatalógus és a gondozási cikkek tárolása (helyi Postgres), a
beszélgetés-előzmény és az eszkalációs várólista adatbázis-táblái, valamint a
JSONL-naplófájlok — ezek mind a saját, helyi infrastruktúránkon élnek.

**3. Melyik lépésnél hagy jóvá ember, mit lát a döntés előtt, és mit tud visszavonni
utána?**

Amikor a rendszer bizonytalan, vagy a kérés olyan, amit nem szabad automatikusan
megválaszolni, egy várakozó sor jön létre — a vásárló ekkor csak annyit lát, hogy a
kérdését kollégának továbbították, konkrét ígéret nélkül. A munkatárs a jóváhagyási
felületen látja az eredeti kérdést, az eszkalálás okát, a beszélgetés kontextusát és — ha a
rendszer generált — egy javasolt válasz-vázlatot, és ez alapján hagyja jóvá vagy utasítja
el. Amit ma **nem** tud a rendszer: tényleges üzenetet küldeni a vásárlónak a döntés után —
ez egy nyitott, a leírásban is jelzett hiányosság, éles bevezetés előtt kell hozzá csatornát
építeni. A "visszavonás" ebben a keretben egyszerű: egy elutasított vagy tévesen jóváhagyott
eset a várólista-táblában marad, semmilyen más rendszerállapotot nem módosít, tehát nincs
mit "visszaállítani" rajta kívül.

**4. Mi kerül naplóba, ki fér hozzá, és mennyi ideig marad meg?**

Minden interakcióról egy naplósor készül: a rendszer-utasítás, a teljes üzenetváltás, a
végső válasz, a token-felhasználás, a válaszidő és az, hogy történt-e eszkaláció. Emellett a
beszélgetés-előzmény és az eszkalációs várólista is adatbázisban tárolódik. Őszinte válasz:
ma **nincs hozzáférés-szabályozás** ezekre az adatokra (bárki, akinek szerver-hozzáférése
van, olvashatja őket), és **nincs megőrzési idő/törlési szabály** — mindkettő nyitott,
dokumentált előfeltétele lenne egy éles bevezetésnek, nem megoldott kérdés.

**5. Mi történik, ha az agent téved, és mennyi idő alatt állítható vissza az előző
állapot?**

A legrosszabb eset az, amikor a rendszer egy hibás, de magabiztosnak tűnő választ ad
közvetlenül a vásárlónak anélkül, hogy eszkalálna — erre ma nincs automatikus védőháló,
csak a mérési tervben szereplő, havi mintavételes emberi audit deríthetné ki utólag. Az
egyetlen tényleges *írás*, amit a rendszer végez (az eszkalációs várólista-sor létrehozása),
triviálisan visszaállítható: egy elutasított vagy tévesen létrejött sor egyszerűen elutasított
állapotba kerül, semmilyen más adatot nem módosít, tehát nincs kaszkádolt hatás, amit vissza
kellene görgetni.

**6. Ki lesz a rendszer gazdája a bevezetés után, és miből fogja látni, hogy jól
működik?**

Napi szinten a folyamatgazda (aki a mérési terv szerinti riportokat kapja: válaszidő,
eszkalációs arány, staff-átfutási idő), technikai szempontból pedig a fejlesztő, aki a
rendszert építette. Azt, hogy jól működik-e, a mérési terv tábla adja meg: nem egyetlen
számból, hanem együtt nézve a válaszidőt, az eszkalációs arányt és — ami a legfontosabb — a
hiba-metrikát (a nem-eszkalált, de utólag hibásnak bizonyuló válaszok arányát). Ha ez utóbbi
tartósan magas, az arra utal, hogy a rendszer túl magabiztos, és szigorítani kell az
eszkalációs szabályon.

## A két saját, kényes kérdés

**7. Mi történik, ha valaki csak a chat-ablakon keresztül, más vásárlónak kiadva magát,
hozzáfér-e olyan információhoz, ami nem az övé?**

Ez a rendszer legőszintébb gyenge pontja: nincs vásárlói azonosítás vagy munkamenet-védelem
— bárki, aki eléri a chat felületet, bármit kérdezhet, és a rendszer nem tudja megkülönböztetni
a valódi vásárlókat egymástól vagy egy visszaélő szereplőtől. Mivel a rendszer ma nem fér
hozzá személyes/rendelési adatokhoz (nincs bekötve rendeléskezelő rendszer), ez önmagában
nem jelent közvetlen adatszivárgást, de nyitva hagyja az utat visszaélésre (pl. tömeges,
automatizált lekérdezésekre, amik költséget generálnak, vagy a jóváhagyási várólista
elárasztására). Ez egy olyan pont, amit egy publikus, valódi bevezetés előtt mindenképp
kezelni kell — ez a PoC szándékosan demó-célra épült, hitelesítés nélkül.

**8. Mi van, ha a modell egyszerűen csak *állítja*, hogy megtette a dolgát, anélkül hogy
ténylegesen megtenné?**

Ez nem elméleti kockázat volt — a fejlesztés végigviteli tesztelése során ténylegesen
előfordult: egy hosszabb beszélgetésben a rendszer szövegesen azt állította, hogy a kérdést
kollégának továbbította, miközben a ténylegesen ehhez szükséges lépés nem futott le, és a
jóváhagyási várólista üres maradt. A gyökérokot (a korábbi beszélgetési kör helytelen
visszaadása a modellnek, illetve az eszkalációs szabály nem elég erős megfogalmazása)
megtaláltam és javítottam, és a javítást többszöri, egymást követő éles teszttel is
megerősítettem — de ez rávilágít egy általánosabb kockázatra: egy nyelvi modell **szövegesen
bármit állíthat**, függetlenül attól, hogy ténylegesen megtörtént-e. Ez azt jelenti, hogy
minden olyan állítást, amit a rendszer a saját működéséről tesz ("továbbítottam",
"elmentettem", "jeleztem"), csak a mögöttes adatbázis-állapottal együtt szabad elhinni — soha
nem elég csak a válasz szövegét ellenőrizni.
