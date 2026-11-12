import type { KnipConfig } from 'knip';
import postcss from 'postcss';

const config = {
  entry: [
    'src/modern/main.tsx!',
    // This generator supplies the translation catalog shipped by the application.
    'scripts/i18n-sync-catalog.ts!',
    // Test files are entrypoints, not ignored: this makes their imports count as
    // real usage, so test-only modules (zod-schemas, etc.)
    // and test-only dependencies (@testing-library/react, happy-dom, zod) are
    // not flagged as dead. Bun's test preload lives in src/modern/test/setup-dom.ts.
    'src/modern/**/*.test.{ts,tsx}',
    'src/modern/**/*.property.test.{ts,tsx}',
    'src/modern/**/*.security.test.{ts,tsx}',
    'src/modern/test/**/*.{ts,tsx}',
    // Build scripts and their tests, the Playwright suite and the root configuration files are
    // entrypoints so that Knip reports any package they import without package.json declaring
    // it (an unlisted dependency). Such an import resolves only while another package happens
    // to install the same name.
    'scripts/**/*.ts',
    'e2e/**/*.ts',
    '*.{ts,mjs}',
  ],
  project: ['src/modern/**/*.{ts,tsx,css}!', '!src/modern/**/*.test.{ts,tsx}!', '!src/modern/test/**!'],
  ignore: [
    // Generated from chronicle-api/chronicle.yaml via `bun run generate:api-types`;
    // contract surface, not hand-maintained, so unused members are expected.
    'src/modern/types/chronicle-api.generated.ts',
    'src/modern/generated/**',
  ],
  // Local production use is reachability; direct unit-test exports do not make that code dead.
  ignoreExportsUsedInFile: true,
  compilers: {
    css: (source, path) => {
      const imports: string[] = [];
      postcss.parse(source, { from: path }).walkAtRules('import', (rule) => {
        // Only quoted imports with an optional layer; extend when application styles use another form.
        const match = /^(['"])([^'"\\]+)\1(?:\s+layer(?:\([-\w.]+\))?)?$/.exec(rule.params);
        const specifier = match?.[2];
        if (!specifier) throw new Error(`Unsupported CSS @import for Knip: ${rule.params}`);
        imports.push(`import ${JSON.stringify(specifier)};`);
      });
      return imports.join('\n');
    },
  },
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
    // Transitive runtime helper pinned via package.json `overrides`; no direct import.
    '@babel/runtime',
  ],
} satisfies KnipConfig;

export default config;
