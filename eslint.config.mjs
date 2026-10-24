import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/api/assets/*.js'],
    languageOptions: {
      globals: Object.fromEntries(
        ['document', 'window', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout'].map(
          (name) => [name, 'readonly'],
        ),
      ),
    },
  },
  {
    files: ['apps/web/*.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'readonly' } },
  },
  {
    files: ['scripts/*.mjs'],
    languageOptions: {
      globals: Object.fromEntries(
        ['process', 'fetch', 'URL', 'setTimeout', 'console'].map((name) => [name, 'readonly']),
      ),
    },
  },
);
