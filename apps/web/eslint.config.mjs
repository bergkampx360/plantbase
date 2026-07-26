import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: [
      '**/*.ts',
      '**/*.cts',
      '**/*.mts',
      '**/*.tsx',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '**/*.jsx',
    ],
    // eslint-plugin-react (a nx flat/react preset "react/*" szabályai) jelenleg nem
    // kompatibilis az ESLint 10-zel (a `context.getFilename()`/`resolveBasedir` régi API-ra
    // épül, amit az ESLint 9+ eltávolított) — a plugin legfrissebb stabil kiadása (7.37.5)
    // sem oldja meg ezt, a peerDependencies szerint is csak ^9.7-ig támogatott. A
    // react-hooks (7.1.1-re frissítve) és a jsx-a11y szabályok külön csomagok, nem
    // érintettek, azok maradnak. Ha az eslint-plugin-react később ESLint 10-kompatibilis
    // verziót ad ki, ez a blokk törölhető.
    rules: {
      'react/forbid-foreign-prop-types': 'off',
      'react/jsx-no-comment-textnodes': 'off',
      'react/jsx-no-duplicate-props': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/jsx-no-undef': 'off',
      'react/jsx-pascal-case': 'off',
      'react/jsx-uses-vars': 'off',
      'react/no-danger-with-children': 'off',
      'react/no-direct-mutation-state': 'off',
      'react/no-is-mounted': 'off',
      'react/no-typos': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/require-render-return': 'off',
      'react/style-prop-object': 'off',
      'react/jsx-no-useless-fragment': 'off',
    },
  },
];
