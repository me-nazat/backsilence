import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'scratch/**', 'public/**'],
  },
  {
    files: ['src/sim/**', 'src/net/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'three',
              message: 'src/sim must be pure TypeScript with no imports of three.',
            },
          ],
          patterns: [
            {
              group: ['three/**', '../engine/**', '../audio/**', '../ui/**', '../game/**', '../lab/**'],
              message: 'src/sim must be pure TypeScript simulation with no engine/audio/UI/presentation imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/sim must not access window.' },
        { name: 'document', message: 'src/sim must not access document.' },
        { name: 'AudioContext', message: 'src/sim must not access Web Audio.' },
        { name: 'webkitAudioContext', message: 'src/sim must not access Web Audio.' },
      ],
    },
  },
  {
    files: ['eslint.config.js'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
);
