import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'api/_data', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // консоль только через src/lib/log.ts; скрипты и тесты пишут в stdout сознательно
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // идиома `условие && действие()` и тернарник-действие допустимы
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // разбор сырых YAML/JSON в одноразовых и проверочных скриптах: типы входа заранее не известны
  { files: ['scripts/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  // тесты подменяют окружение браузера заглушками
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  {
    files: ['src/lib/log.ts', 'scripts/**', 'tests/**', 'e2e/**', '**/*.test.ts', '*.config.ts'],
    rules: { 'no-console': 'off' },
  },
)
