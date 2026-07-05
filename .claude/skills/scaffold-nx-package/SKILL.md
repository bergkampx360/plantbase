---
name: scaffold-nx-package
description: Use when adding a new package under packages/ (e.g. core, db) or app under apps/ (e.g. cli, later api/web) in the plantbase Nx monorepo — sets up TS-strict tsconfig, Vitest, ESLint+Prettier and pnpm workspace wiring consistently, per docs/stack.md and docs/architektura.md.
---

# Scaffold an Nx package or app

Plantbase's target layout (docs/architektura.md):

```
plantbase/
├── packages/core   agent logic (LLM call, runSql tool, schema context, logging)
├── packages/db     Prisma lib (schema, migration, client, seed) — NOT at repo root
├── apps/cli        CLI (ask command + interactive mode)
```

Later (not yet): `apps/api`, `apps/web`. `packages/core` must stay framework/entrypoint-agnostic — it must not
import from `apps/*`.

## Steps

1. **Use Nx's generator if the workspace has one configured** (check for `@nx/js`/`@nx/node` plugin in the root
   `package.json`):
   ```bash
   pnpm nx g @nx/js:library core --directory=packages/core --unitTestRunner=vitest --bundler=none
   pnpm nx g @nx/node:application cli --directory=apps/cli --unitTestRunner=vitest
   ```
   If no Nx generator plugin is installed yet, scaffold by hand following the structure below — do not add a
   heavyweight generator plugin just for this.

2. **Per-package conventions** (docs/konvenciok.md), applied to every new package/app:
   - `package.json` name: `@plantbase/<name>` (e.g. `@plantbase/core`, `@plantbase/db`).
   - `tsconfig.json` extends the root strict config; don't loosen `strict`.
   - `vitest.config.ts` present, tests colocated as `*.spec.ts` next to source (kebab-case filenames).
   - ESLint/Prettier configs extend the root config — no per-package style overrides.
   - `src/index.ts` as the single public entry point; internal modules not re-exported wholesale.
   - Files stay small and single-responsibility (~200-400 lines, 400 hard cap per docs/konvenciok.md).

3. **Workspace wiring:**
   - Confirm the new path is covered by `pnpm-workspace.yaml` globs (`packages/*`, `apps/*`); add an explicit
     entry only if it isn't.
   - Add cross-package deps via `workspace:*` protocol in `package.json`, never a relative `file:` path or a
     published version.
   - Run `pnpm install` after adding the package so the lockfile picks it up.

4. **Respect the dependency direction:** `apps/*` may depend on `packages/core` and `packages/db`;
   `packages/core` may depend on `packages/db`'s types/client but never on `apps/*`. If a new package would
   invert this, stop and flag it instead of scaffolding.

5. **Before writing code against an unfamiliar library API** (e.g. first time touching Prisma in `packages/db`),
   fetch its docs via Context7 first (docs/architektura.md decision #7) — don't guess the API from memory.

6. Verify the scaffold builds and tests run before considering it done:
   ```bash
   pnpm nx run <project>:build
   pnpm nx run <project>:test
   ```
