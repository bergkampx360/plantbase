# Plantbase — UX/DX fejlesztési terv (C rész)

> Kurzus-melléklet, az `docs/implementation-plan-1.md` (A1–A7, B1–B5) folytatása — külön dokumentumként, hogy az eredeti terv lezárt maradjon. Ugyanazt a stílust és git-workflow szabályt követi.

## Kontextus

A teljes A1–A7/B1–B5 terv elkészült és mergelve van, a `plantbase ask`/interaktív mód működik. Napi használat közben 3 hiányosság merült fel:

1. **Futtatás nehézkes** — jelenleg `pnpm exec nx run cli:build` + `node dist/apps/cli/main.js ask "..."`, vagy globális telepítés kell.
2. **Nincs kontextus-kezelés** — az interaktív mód minden kérdésnél elfelejti az addigi beszélgetést (kérdéseket, válaszokat, tool-hívásokat és azok eredményeit egyaránt).
3. **Nehezen olvasható konzol-kimenet** — nincs vizuális elválasztás a körök között, a `--show-prompt` egy nyers `JSON.stringify` dump, és a `console.log` szórtan, közvetlenül van használva a CLI kódban (nincs kiíró-absztrakció).

## Rögzített döntések

- **Kontextus hatóköre:** csak az **interaktív mód** kap memóriát, a folyamat élettartamáig (in-memory, `exit`-nél elvész). A `tool_use`/`tool_result` blokkok is részei a megőrzött kontextusnak — ez automatikusan adott, mert a teljes `messages` tömböt adjuk tovább, nem csak a végső szöveges választ. Az `ask` parancs (egyszeri process) stateless marad.
- **Nincs kontextus-tömörítés/limit** — a növekvő beszélgetés-hossz (token-fogyasztás) kezelése kimarad, ld. "Kimarad" szakasz.
- **Kimeneti absztrakció:** minden konzolra írás egyetlen modulon (`apps/cli/src/output.ts`) megy át — a `main.ts`-ben a jóváhagyás utáni állapotban nem marad közvetlen `console.log` hívás.
- **Csomag-granularitás:** 3 önálló fázis (C1–C3), a projekt már rögzített szabálya szerint — saját branch, saját lokális commit, megállok tesztelésre, push/PR csak külön jóváhagyás után.

## Git-workflow (átvéve `docs/implementation-plan-1.md`-ből, változatlanul)

1. Feature branch létrehozása fázisonként, implementáció, helyi commit.
2. Megállok, kérem a tesztelést.
3. Push (és PR nyitás) csak explicit jóváhagyás után.

---

### C1 — `pnpm run plantbase` shortcut ✅ KÉSZ

Context7-vel megerősítve (`/websites/pnpm_io`): a `pnpm run <script> <extra args>` a szkript-string végéhez fűzi az extra argumentumokat (nincs szükség `--`-re), és `pnpm <script-name>` a `pnpm run <script-name>` rövidítése, amíg a névnek nincs ütközése beépített pnpm paranccsal.

- Gyökér `package.json`:
  ```json
  {
    "scripts": {
      "plantbase": "nx run cli:build && node dist/apps/cli/main.js"
    }
  }
  ```
  Az `nx run cli:build` láncolása biztosítja, hogy a build mindig friss legyen — Nx cache miatt változatlan forrás esetén szinte azonnali.
- Ezzel `pnpm run plantbase ask "melyik a 3 legolcsóbb pozsgás növény raktáron?"` (vagy `pnpm plantbase ask "..."`) pontosan a kért szintaxist adja.
- `README.md` "Futtatás és tesztelés" szakasza frissül: a shortcut kerül előre, a jelenlegi `node dist/apps/cli/main.js` forma alternatívaként marad.

**Teszt:** `pnpm run plantbase ask "milyen kategóriák érhetők el?"` build+futtatás egy lépésben; másodszorra (változatlan forrás) gyorsabb (cache-hit); `pnpm run plantbase` (argumentum nélkül) interaktív módot indít.
**Commit:** `feat: add pnpm run plantbase shortcut for build+run`
→ **megállok, kérem a tesztelést.**

### C2 — Kontextus-kezelés (interaktív módban)

- `packages/core/src/ask-agent.ts` — új opcionális `history` paraméter:
  ```ts
  export async function askAgent(
    question: string,
    history: Anthropic.MessageParam[] = [],
  ): Promise<AskResult> {
    const client = new Anthropic();
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: question },
    ];
    // a tool-use loop, logolás stb. változatlan innentől
    ...
  }
  ```
- `apps/cli/src/main.ts` — `handleQuestion` is átveszi az opcionális history paramétert:
  ```ts
  export async function handleQuestion(
    question: string,
    history: Anthropic.MessageParam[] = [],
  ): Promise<AskResult> {
    return askAgent(question, history);
  }
  ```
  `runInteractive()` egy helyi `let history: Anthropic.MessageParam[] = []`-t tart fenn a teljes session alatt:
  ```ts
  rl.pause();
  handleQuestion(question, history)
    .then((result) => {
      history = result.messages;
      // C3: printTurn(question, result)
    })
    .finally(() => { ... });
  ```
  Az `ask` parancs (`program.command('ask')...`) nem hív history-t — minden hívás új, üres historyval indul (egyszeri process, lásd fenti döntés).
- Naplózás változatlan — a JSONL log soronként a teljes, addig felhalmozott `messages`-t tartalmazza, ami többfordulós beszélgetésnél ténylegesen több üzenetet fog tartalmazni.

**Teszt:** interaktív módban két egymást követő kérdés, ahol a második névmással hivatkozik az elsőre (pl. "Milyen pozsgás növényeitek vannak?" majd "És ezek közül melyik a legolcsóbb?") — a modell helyesen érti az "ezek" hivatkozást, nem kérdez vissza értelmetlenül. Egy harmadik kérdés egy korábbi tool-eredményre (pl. egy előzőleg listázott kategóriára) hivatkozva is helyesen működik, bizonyítva hogy a tool_use/tool_result blokkok is átkerülnek. Az `ask` parancs két külön hívása továbbra is függetlenül viselkedik.
**Commit:** `feat: carry conversation history across turns in interactive mode`
→ **megállok, kérem a tesztelést.**

### C3 — Kimeneti absztrakció + olvashatóság

- **Új `apps/cli/src/format-messages.ts`** — tiszta formázó-logika, mellékhatás nélkül:
  ```ts
  import type Anthropic from '@anthropic-ai/sdk';

  export function formatMessages(messages: Anthropic.MessageParam[]): string {
    return messages.map(formatMessage).join('\n\n');
  }

  function formatMessage(message: Anthropic.MessageParam): string {
    const role = message.role === 'user' ? '▶ user' : '▶ assistant';
    if (typeof message.content === 'string') {
      return `${role}\n${message.content}`;
    }
    return `${role}\n${message.content.map(formatBlock).join('\n')}`;
  }

  function formatBlock(block: Anthropic.ContentBlockParam): string {
    switch (block.type) {
      case 'text':
        return block.text;
      case 'tool_use':
        return `🔧 ${block.name}(${JSON.stringify(block.input)})`;
      case 'tool_result': {
        const content =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
        return `↩ eredmény: ${content}`;
      }
      default:
        return JSON.stringify(block);
    }
  }
  ```
- **Új `apps/cli/src/output.ts`** — az egyetlen hely, ami ténylegesen `console.log`-ot hív:
  ```ts
  import type { AskResult } from '@plantbase/core';
  import { formatMessages } from './format-messages';

  const SEPARATOR = '─'.repeat(60);

  export function printTurn(
    question: string,
    result: AskResult,
    options?: { showPrompt?: boolean },
  ): void {
    console.log(SEPARATOR);
    console.log(`🙋 Te: ${question}`);
    if (options?.showPrompt) {
      console.log(formatMessages(result.messages));
    }
    console.log(`🌱 Plantbase: ${result.answer}`);
  }
  ```
  (A readline `rl.setPrompt('plantbase> ')`/`rl.prompt()` hívásai maradnak — azok nem `console.log`-ok, hanem a readline API része.)
  A kérdés kifejezett kiírása (`🙋 Te: ...`) azért kell, mert a build-kimenet zaja és a válasz között e nélkül nem egyértelmű, melyik kérdésre érkezett a válasz (ezt a user egy éles tesztnél konkrétan hiányolta).
- `apps/cli/src/main.ts`: mind az `ask` parancs action-je (`printTurn(question, result, options)`), mind az interaktív mód `.then()`-je (`printTurn(question, result)`) ezt hívja a jelenlegi `console.log(result.answer)` / `console.log(JSON.stringify(...))` helyett.

**Teszt:** `pnpm run plantbase ask "..." --show-prompt` → jól tagolt, olvasható kimenet, nem nyers JSON-blob, a kérdés (`🙋 Te:`) és a válasz (`🌱 Plantbase:`) egyértelműen elkülönül a build-zajtól; interaktív módban több kör vizuálisan jól elkülönül; `grep -n "console\." apps/cli/src/main.ts` nem ad találatot.
**Commit:** `feat: improve console output readability (turn separators, formatted --show-prompt)`
→ **megállok, kérem a tesztelést.**

---

## Kimarad (tudatosan, ebben a körben NEM)

- Az `ask` parancs (egyszeri process) cross-invocation kontextus-perzisztencia (session-fájl) — csak az interaktív mód kap memóriát.
- Kontextus-tömörítés / token-limit hosszú beszélgetéseknél.
- Színezett/egyéb terminál-esztétika az `output.ts`-en túl (pl. ANSI színek) — jelenleg csak a szeparátor+formázás készül el.

## Critical files

- `package.json` (gyökér) — `plantbase` script (C1)
- `packages/core/src/ask-agent.ts` — `history` paraméter (C2)
- `apps/cli/src/main.ts` — `handleQuestion` history-paraméter, `runInteractive` state, `printTurn` hívások (C2+C3)
- `apps/cli/src/format-messages.ts` — új (C3)
- `apps/cli/src/output.ts` — új (C3)
- `README.md` — "Futtatás és tesztelés" frissítése (C1)

## Verification

- Minden fázis után: `pnpm exec nx run-many -t build,typecheck,test,lint` zöld.
- C1: `pnpm run plantbase ask "..."` és `pnpm run plantbase` ténylegesen lefut.
- C2: kétfordulós (és egy tool-eredményre hivatkozó harmadik) interaktív kérdés helyesen kezeli a kontextust.
- C3: `--show-prompt` és a kör-elválasztók vizuálisan ellenőrizve olvashatóbbak; nincs közvetlen `console.log` a `main.ts`-ben.

Nincs több nyitott kérdés ebben a részben — implementáció kezdhető C1-gyel, jóváhagyás után.
