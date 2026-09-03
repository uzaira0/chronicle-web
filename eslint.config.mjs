// Type-aware lint (ts-type-aware-lint): chronicle-web's primary linter is biome 2.x
// (fast, AST-only). biome structurally cannot provide type-aware rules —
// no-floating-promises, no-misused-promises, no-unsafe-*, await-thenable,
// no-unnecessary-condition — because it has no TS type graph. This thin eslint layer
// adds ONLY that type-aware delta (no base/style rules, which biome already owns), so
// the two linters do not double-report. typescript-eslint >=8.61 supports the repo's
// TS 6.0.x (supported range >=4.8.4 <6.1.0); projectService auto-discovers the
// tsconfig; vendor/ is third-party and excluded.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'build/**',
      'coverage/**',
      'dist/**',
      'docs/**',
      'flow-typed/**',
      'node_modules/**',
      'vendor/**',
      '**/*.config.*',
      '**/*.js.flow',
    ],
  },
  {
    files: [
      'src/modern/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'scripts/**/*.ts',
    ],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },
  {
    files: [
      'src/modern/**/*.{ts,tsx}',
      'e2e/**/*.{ts,tsx}',
      'scripts/**/*.ts',
    ],
    ignores: [
      'src/modern/**/*.test.{ts,tsx}',
      'src/modern/test/**',
      'e2e/**/*.test.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
  {
    files: [
      'e2e/dsl/cleanup/cleanup-stack.test.ts',
      'e2e/dsl/di/api-client.test.ts',
      'e2e/dsl/scopes/export-scope.test.ts',
      'src/modern/lib/auth-utils.test.ts',
      'src/modern/lib/bootstrap-auth.behavior.test.ts',
    ],
    rules: {
      // Bun's `.rejects` matcher is awaitable at runtime but is not represented
      // as a Thenable in the current bun:test type declarations. Keep this
      // exception limited to files that exercise that matcher.
      '@typescript-eslint/await-thenable': 'off',
    },
  },
);
