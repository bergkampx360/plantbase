# Plantbase — plugin- és MCP-választások

Rövid összefoglaló arról, miért került be az egyes Claude Code marketplace plugin és MCP szerver a
projektbe. A részletes indoklás a hivatkozott bevezető commitban él, ez a doksi csak a "miért"-et
gyűjti egy helyre kereshetően.

## Marketplace pluginok (`.claude/settings.json` → `enabledPlugins`)

- **`commit-commands`** (05fec84) — hivatalos Anthropic plugin a git commit/push/PR workflow-hoz;
  közvetlenül támogatja a projekt már rögzített kis-fókuszált-commit és Conventional Commits
  szabályát (`dev-workflow.md`, `CLAUDE.md`).
- **`pr-review-toolkit`** (76d89d2) — automatizált review-réteget ad a `CLAUDE.md`/`dev-workflow.md`
  által amúgy is előírt feature-branch+PR workflow-hoz.
- **`typescript-lsp`** (76d89d2) — pontos TS-strict típus-intelligencia, ahogy a `packages/core`,
  `packages/db` és `apps/cli` feltöltődik kóddal.

## Egyedi skillek (`.claude/skills/`)

- **`db-role-setup`** (ffd37e4) — a dokumentált, de eddig implementálatlan read-only Postgres
  szerepkör-létrehozást ismételhető eljárássá alakítja, amitől az agent `runSql` toolja függ.
- **`scaffold-nx-package`** (ffd37e4) — konzisztens Nx package/app scaffoldingot ad, mielőtt a
  kódbázis tovább nő.

## MCP szerverek (`.mcp.json`)

- **`postgres`** (14dbe79) — a fenntartott `postgres-mcp` (crystaldba) csomag `--access-mode=restricted`
  kapcsolóval, **nem** a `@modelcontextprotocol/server-postgres` referencia-csomag: az utóbbi 2025
  júliusa óta deprecated/archivált, és volt benne dokumentált SQL-injection hiba, ami megkerülte a
  saját read-only wrapperét — pont azt a tulajdonságot törte volna, amire a projekt épít (NFR1,
  `brs-plantbase.md`). A kapcsolati string `${DATABASE_URL_READONLY}`-ból interpolálódik, sosem
  hardcode-olt.
- **`prisma`** (14dbe79) — a helyi Prisma CLI-t (migrate/db/Studio) wrappeli. Szándékosan a
  read-write `DATABASE_URL`-t használja (migrációhoz kell) — ez fejlesztői eszköz, nem a termék
  `runSql` toolja, tehát nem gyengíti az NFR1 read-only garanciát. Prisma beépített AI-agent
  védelme (drop/migrate reset blokkolása detektált agentnél) érintetlen maradt.

## Kimaradt/elvetett opció

- Postgres MCP szerver bevezetése elsőre elmaradt (76d89d2) — magasabb kockázatú, külső csomagnak
  minősült akkor; a `postgres`/`prisma` MCP-k csak egy külön lépésben (14dbe79) kerültek be, miután
  a fenti biztonsági szempontok (deprecated csomag, SQL-injection) tisztázódtak.
