// Design-system lint (`bun run lint:design`). Separate from eslint.config.mjs
// so the repo's type-aware lint layer stays untouched.
//   bunx eslint --config eslint.shadcn.mjs src/modern
// Ratchet: package.json pins --max-warnings to the current count (run by `bun run check`,
// which scripts/local-ci.sh web runs). Lower the pin whenever a fix lands; never raise it.
// Rules already at zero are errors so a single regression fails the gate.
import { plugin as shadcn } from '@shadcn/lint';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['build/**', 'coverage/**', 'dist/**', 'node_modules/**', 'vendor/**', '**/*.test.tsx', '**/*.test.ts'],
  },
  {
    files: ['src/modern/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { shadcn },
    settings: { shadcn: { ui: '@/components/ui' } },
    rules: {
      'shadcn/no-restyle': ['warn', { allow: ['layout'] }],
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-arbitrary-values': 'warn',
      'shadcn/no-inline-styles': 'error',
      'shadcn/no-unknown-classes': 'error',
      'shadcn/require-static-classes': 'error',
    },
  },
];
