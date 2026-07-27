# Implementációs terv — státusz

Egyetlen hely, ahol a teljes terv állapota egy pillantásra látszik. A README "Állapot" szakasza és
minden más docs-fájl **ide hivatkozzon vissza**, ne duplikálja a táblázatot.

| Rész | Fájl                                                                   | Fázisok      | Státusz |
| ---- | ---------------------------------------------------------------------- | ------------ | ------- |
| A–B  | [`01-environment-and-agent-core.md`](01-environment-and-agent-core.md) | A1–A7, B1–B5 | ✅ Kész |
| C    | [`02-ux-dx-improvements.md`](02-ux-dx-improvements.md)                 | C1–C3        | ✅ Kész |
| D    | [`03-runsql-guard-hardening.md`](03-runsql-guard-hardening.md)         | D1–D3        | ✅ Kész |
| E    | [`04-runsql-guard-refinements.md`](04-runsql-guard-refinements.md)     | E1–E3        | ✅ Kész |
| F    | [`05-rag-pipeline.md`](05-rag-pipeline.md)                             | F1–F11       | ✅ Kész |
| G    | [`06-web-chat.md`](06-web-chat.md)                                     | G1–G7        | ✅ Kész |
| H    | [`07-web-ux-improvements.md`](07-web-ux-improvements.md)               | H1–H4        | ✅ Kész |

## Új rész indításának szabálya

Új fájl csak akkor nyílik, ha **minden** meglévő fájl lezárt (nincs ⏳ Nyitott fázisa). Amíg egy
fájl nyitott, az új fázisok **oda** kerülnek, nem új fájlba. Névminta:
`<kétjegyű sorszám>-<rövid, beszédes kebab-case téma>.md`.

**Kivétel, ami nem sérti a szabály szellemét**: a G rész (F alatt, vázlatszinten, F1–F11 mellett élt
`05-rag-pipeline.md`-ben) F lezárása után külön fájlba (`06-web-chat.md`) került — ez nem új munka
indítása egy nyitott fájl mellett, hanem már megtervezett, de F-hez tartozó fájlból eltávolított
tartalom átmozgatása egy dedikált fájlba, miután a befogadó fájl (F) teljesen lezárult.

Egy fázis csak akkor jelölhető **✅ Kész**, ha az általa érintett logikához tartozó tesztek is
megvannak és zöldek — nem elég, hogy a kód fut (ld. `docs/testing-strategy.md`).

Ezt a táblázatot a `ddd-audit` skill (ld. `docs/dev-workflow.md`) tartja karban minden PR nyitása
előtt.
