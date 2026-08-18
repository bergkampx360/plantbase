import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/packages/core',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'core',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // *.integration.spec.ts fájlok valódi, futó Postgrest igényelnek (docs/testing-strategy.md
    // "Integration" szintje) — kizárva az alap `test` targetből, hogy az minden más
    // packages/core-tesztet (és a dev-workflow.md szerinti PostToolUse Vitest-hookot) gyorsan,
    // DB nélkül, tisztán mockolva futtasson. Külön futtatva: `pnpm test:integration`
    // (vitest.integration.config.mts).
    exclude: ['**/*.integration.spec.ts', 'node_modules/**'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/packages/core',
      provider: 'v8' as const,
    },
  },
}));
