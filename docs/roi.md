# Plantbase — ROI-levezetés (5 fős iroda)

> Kurzus-melléklet. A `docs/brs-plantbase.md` "ROI / mérőszámok" szakaszának (1 fős keret) kiterjesztése egy 5 fős lakberendező-iroda szintjére, pénzben kifejezve.

## 1. Alapadatok és feltevések

A `brs-plantbase.md`-ből átvéve (1 fő szintjén), és a pénzbeli számításhoz szükséges új feltevésekkel kiegészítve:

| Paraméter | Érték | Forrás |
|---|---|---|
| Iroda mérete | 5 lakberendező | user megadta |
| Ügyfél/hó/fő | 5 | BRS |
| Szoba/ügyfél | 3 | BRS |
| **Havi szoba-mennyiség (iroda)** | **75 szoba/hó** (900/év) | számított: 5 fő × 5 ügyfél × 3 szoba |
| Kézi idő/szoba | 10–15 perc, átlag **12,5 perc** | BRS |
| Agent idő/szoba | **5 perc** (KPI) | BRS |
| Betöltött órabér (lakberendező) | **6.000 Ft/óra** | becslés — nincs tényleges adat, ±25% érzékenységi sávval kezelve |
| Átlagos csomag-érték/szoba | **25.000 Ft** | becslés — ld. levezetés a 3. pont alatt |
| "Olcsóbb kosár" megtakarítás | **5%** | BRS szerint Hard, de a legbizonytalanabb szám — ±50% sávval kezelve |
| Query/szoba (API-költséghez) | ~2 kérdés/szoba | becslés, a multistep NL→SQL loop miatt |

## 2. Hard ROI — Időmegtakarítás

- Idő/szoba megtakarítás: 12,5 − 5 = **7,5 perc/szoba**
- Havi óra-megtakarítás: 75 szoba × 7,5 perc = 562,5 perc = **9,375 óra/hó**
- Havi megtakarítás: 9,375 óra × 6.000 Ft/óra = **56.250 Ft/hó**
- **Éves: 675.000 Ft/év**

## 3. Hard ROI — Olcsóbb kosár

**A 25.000 Ft/szoba csomagérték levezetése (fontos: tisztán becslés, nincs mögötte tényleges adat):**

- Egy szoba növénycsomag jellemzően ~3–5 növényből áll — ez maga is feltevés, a BRS nem rögzít pontos darabszámot.
- Egy átlagos szobanövény ára Magyarországon kb. 3.000–15.000 Ft sávban mozog (kis-közepes cserépméret, nem egzotikus fajta) — ez egy piaci becslés, **nem** a repóból származik.
- 3–5 db × kb. 5.000–8.000 Ft átlag ≈ 15.000–40.000 Ft, ebből kerekítve egy 25.000 Ft-os középérték.
- **Nincs valódi seed-adat ehhez**: a `packages/db` még nem létezik, a `docs/stack.md` csak a `price` mező típusát rögzíti (`numeric`, HUF), konkrét ár-tartományt vagy minta-adatot nem. Ez a legbizonytalanabb feltevés a levezetésben — valós ártapasztalattal pontosítható.

Számítás:

- Havi becsült beszerzési érték: 75 szoba × 25.000 Ft = 1.875.000 Ft/hó
- Megtakarítás (5%): **93.750 Ft/hó**
- **Éves: 1.125.000 Ft/év**

## 4. Összesített éves Hard haszon (alapeset)

**675.000 + 1.125.000 = 1.800.000 Ft/év**

## 5. Költségoldal

### 5.1 Egyszeri bevezetési költség

Fejlesztői idő becslése (kurzus-jellegű, saját fejlesztés): ~60 óra × 15.000 Ft/óra (szerződéses fejlesztői órabér) = **900.000 Ft egyszeri**.

### 5.2 Havi üzemeltetési költség (Anthropic API)

Hivatalos Anthropic árazás (2026. júliusi állapot):

| Modell | Input $/1M token | Output $/1M token |
|---|---|---|
| Claude Haiku 4.5 | $1,00 | $5,00 |
| Claude Sonnet 5 | $3,00 | $15,00 |

Becsült token-felhasználás (rövid system prompt + séma-kontextus + 2-lépéses tool-use loop: LLM → `runSql` → LLM):

- ~2 kérdés/szoba × 75 szoba/hó = **150 kérdés/hó**
- Kérdésenként ~2 LLM-hívás → input ~2.200 token, output ~250 token összesen/kérdés (becslés, nincs mért adat)
- Havi összesen: ~0,33M input token, ~0,0375M output token

| Modell | Havi becsült költség |
|---|---|
| Haiku 4.5 | 0,33×$1,00 + 0,0375×$5,00 ≈ **$0,52/hó** |
| Sonnet 5 | 0,33×$3,00 + 0,0375×$15,00 ≈ **$1,55/hó** |

**Mindkét esetben elhanyagolható** (kb. 200–600 Ft/hó, 380 Ft/$ árfolyamon) — nem befolyásolja érdemben a megtérülést. Nincs extra felhő-DB költség (lokális docker-compose Postgres, `stack.md`).

## 6. Nettó megtérülés (alapeset)

- Havi nettó haszon: 1.800.000 / 12 = 150.000 Ft/hó
- **Megtérülési idő: 900.000 Ft / 150.000 Ft/hó ≈ 6 hónap**
- 1. évi nettó haszon: 1.800.000 − 900.000 − ~7.000 (API) ≈ **893.000 Ft**
- 2. évtől: ~**1.793.000 Ft/év** (csak API-költséggel csökkentve)

## 7. Érzékenységi sáv

A két legbizonytalanabb paraméter (órabér, kosár-megtakarítás %) ±25–50%-os sávban:

| Szcenárió | Órabér | Kosár-megtakarítás | Éves Hard haszon | Megtérülési idő |
|---|---|---|---|---|
| Alacsony | 4.500 Ft/óra | 2,5% | 1.068.750 Ft | ~10,1 hónap |
| **Alapeset** | 6.000 Ft/óra | 5% | **1.800.000 Ft** | **~6 hónap** |
| Magas | 7.500 Ft/óra | 7,5% | 2.531.250 Ft | ~4,3 hónap |

## 8. Soft haszon (nem forintosított, BRS szerint)

- Magasabb ügyfélélmény (gyorsabb, pontosabb ajánlat)
- Jobb minőségű munka (jobb illeszkedés a tér és ügyfél igényeihez)
- Bővítési potenciál: korábbi döntések elemzése → jobb javaslat (v2+)

## 9. Összegzés

Még a legkonzervatívabb (Alacsony) szcenárióban is **10 hónapon belül megtérül** az 5 fős iroda szintjén, az Alapesetben **~6 hónap alatt**, és az üzemeltetési (API) költség minden szcenárióban elhanyagolható a haszonhoz képest. A legnagyobb bizonytalanság a "kosár-megtakarítás" és az órabér — ezek valós adattal (tényleges fizetés, tényleges rendelés-történet) pontosíthatók lennének.
