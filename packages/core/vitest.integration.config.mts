import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// Külön config a *.integration.spec.ts fájlokhoz (docs/testing-strategy.md "Integration"
// szintje) — valódi, futó Postgrest igényelnek (docker compose up -d, db-role-setup skill
// lefuttatva), ezért NEM része az alap `test` targetnek (vitest.config.mts `exclude`-ja
// zárja ki). Futtatás: `pnpm --filter @plantbase/core run test:integration`.
export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/core',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'core-integration',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.integration.spec.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
  },
}));
