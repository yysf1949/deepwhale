import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.gate-targets/**',
      '**/*.tsbuildinfo',
      'vitest.config.ts',
    ],
  },
  js.configs.recommended,
  // ---- JS / .js file rules (bin, configs) ----
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
  // ---- TS / .ts file rules ----
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // 不开 projectService：test 目录被各包 tsconfig exclude
        // 用 allowDefaultProject fallback，让 test 文件用 default project（不基于 tsconfig）
      },
      globals: {
        ...globals.node,
        ...globals.browser, // Request / Response (also from node:undici)
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // 关闭 no-undef：TS 类型（NodeJS、RequestInit）不是 global；typescript-eslint 已接管
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': 'off',
    },
  },
  prettier,
];
