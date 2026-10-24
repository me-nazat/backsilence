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
    files: ['src/sim/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Authoritative simulation must use the seeded Rng stream.' },
        { object: 'Math', property: 'sin', message: 'Forbidden non-deterministic Math.sin in src/sim. Use dSin from ./dmath.js.' },
        { object: 'Math', property: 'cos', message: 'Forbidden non-deterministic Math.cos in src/sim. Use dCos from ./dmath.js.' },
        { object: 'Math', property: 'tan', message: 'Forbidden non-deterministic Math.tan in src/sim. Use dTan from ./dmath.js.' },
        { object: 'Math', property: 'atan2', message: 'Forbidden non-deterministic Math.atan2 in src/sim. Use dAtan2 from ./dmath.js.' },
        { object: 'Math', property: 'exp', message: 'Forbidden non-deterministic Math.exp in src/sim. Use dExp from ./dmath.js.' },
        { object: 'Math', property: 'log', message: 'Forbidden non-deterministic Math.log in src/sim. Use dLog from ./dmath.js.' },
        { object: 'Math', property: 'pow', message: 'Forbidden non-deterministic Math.pow in src/sim. Use dPow from ./dmath.js.' },
        { object: 'Math', property: 'hypot', message: 'Forbidden non-deterministic Math.hypot in src/sim. Use dHypot from ./dmath.js.' },
      ],
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
        { name: 'Date', message: 'src/sim must not access Date. Use simTime or seed.' },
        { name: 'performance', message: 'src/sim must not access performance. Use simTime.' },
      ],
    },
  },
  {
    files: ['src/sim/dmath.ts'],
    rules: {
      'no-loss-of-precision': 'off',
    },
  },
  {
    files: ['src/net/core/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Net core must use deterministic PRNG.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'three', message: 'src/net/core must have no three imports.' }],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/net/core must not access window directly.' },
        { name: 'document', message: 'src/net/core must not access document.' },
        { name: 'AudioContext', message: 'src/net/core must not access Web Audio.' },
        { name: 'webkitAudioContext', message: 'src/net/core must not access Web Audio.' },
      ],
    },
  },
  {
    files: ['src/procedural/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Procedural generation must use a seeded Rng stream.',
        },
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
