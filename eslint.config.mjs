import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist', '**/node_modules', '**/.nx'],
  },
);
