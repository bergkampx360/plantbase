import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
          // a generált Prisma Client (src/generated/prisma) belülről importálja
          // az "@prisma/client/runtime/client"-et bare specifierrel — a
          // dependency-checks ezt nem látja, mert mi csak relatív úton
          // importálunk, de a csomagnak futásidőben szüksége van rá.
          ignoredDependencies: ['@prisma/client'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
