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
          // RAG pipeline (F1, docs/implementation/05-rag-pipeline.md): a deps F1-ben kerülnek be,
          // a tényleges import csak F5/F6-ban jön (embed.ts, hyde.ts, rerank.ts). Törlendő innen,
          // amint az importok megjelennek.
          ignoredDependencies: ['@ai-sdk/anthropic', '@ai-sdk/openai', 'ai'],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
];
