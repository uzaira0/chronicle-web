import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Production + bridge entrypoints. `src/index.ts` is the legacy bootstrap that
  // lazily imports the modern shell (renderModernShell.tsx) — list the bridge
  // explicitly so it is not reported as unused even though its only importer
  // lives outside the `src/modern/**` project scope.
  entry: [
    'src/modern/main.tsx',
    'src/modern/app/modern-app.tsx',
    'src/modern/bootstrap/renderModernShell.tsx',
    // Test files are entrypoints, not ignored: this makes their imports count as
    // real usage, so test-only modules (zod-schemas, selected-org-store, etc.)
    // and test-only dependencies (@testing-library/react, happy-dom, zod) are
    // not flagged as dead. Bun's test preload lives in src/modern/test/setup-dom.ts.
    'src/modern/**/*.test.{ts,tsx}',
    'src/modern/**/*.property.test.{ts,tsx}',
    'src/modern/**/*.matrix.test.{ts,tsx}',
    'src/modern/**/*.snapshot.test.{ts,tsx}',
    'src/modern/**/*.security.test.{ts,tsx}',
    'src/modern/test/**/*.{ts,tsx}',
  ],
  project: ['src/modern/**/*.{ts,tsx}'],
  ignore: [
    // Generated from chronicle-api/chronicle.yaml via `bun run generate:api-types`;
    // contract surface, not hand-maintained, so unused members are expected.
    'src/modern/types/chronicle-api.generated.ts',
    'src/modern/generated/**',
    // Zustand store covered by selected-org-store.test.ts, which imports it via a
    // cache-busting dynamic specifier (`./selected-org-store.ts?v=${id}`) that
    // knip cannot resolve statically. Legitimate, test-exercised module.
    'src/modern/stores/selected-org-store.ts',
  ],
  // UI primitives are intentional component-family exports; application exports stay checked.
  ignoreIssues: { 'src/modern/components/ui/**': ['exports', 'types'] },
  tags: ['-@public'],
  exclude: ['enumMembers'],
  // POSIX diff, used by the check:api-types freshness gate; not an npm binary.
  ignoreBinaries: ['diff'],
  ignoreDependencies: [
    // Mutation testing tooling, invoked only via the `test:mutate` script /
    // stryker.config.json.
    '@stryker-mutator/*',
    // happy-dom is the peer of @happy-dom/global-registrator (imported by the
    // Bun test preload src/modern/test/setup-dom.ts); not imported directly.
    'happy-dom',
    // axe-core is the type/runtime peer of @axe-core/playwright, referenced only
    // by the (out-of-project) Playwright a11y spec e2e/accessibility.spec.ts.
    'axe-core',
    // Transitive runtime helper pinned via package.json `overrides`; no direct import.
    '@babel/runtime',
    // Consumed via CSS (@import) or the HTML/font bootstrap, not TS imports —
    // knip cannot trace these: see src/modern/styles/index.css and src/index.ts.
    '@eqds/react',
    // PostCSS/Tailwind pipeline used by the Bun build plugin + CSS, not imported.
    '@tailwindcss/postcss',
    'postcss',
    'postcss-loader',
    // Transitive supply-chain version pins declared in package.json `overrides`
    // (security cadence): not direct imports, must stay listed to hold the pin.
    'ajv',
    'brace-expansion',
    'fast-uri',
    'picomatch',
    'serialize-javascript',
    'webpack',
    'yaml',
    'validator',
  ],
};

export default config;
