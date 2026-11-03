import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import config from '../knip.config';

test('production Knip follows local production calls and still catches test-only code', () => {
  const root = resolve('build/operator-test-runs/knip-production');
  mkdirSync(`${root}/fixture`, { recursive: true });
  mkdirSync(`${root}/scripts`, { recursive: true });
  writeFileSync(`${root}/scripts/i18n-sync-catalog.ts`, 'export {};');
  writeFileSync(
    `${root}/package.json`,
    JSON.stringify({ name: 'chronicle-knip-fixture', private: true, dependencies: { 'styles-used': '1.0.0' } }),
  );
  writeFileSync(
    `${root}/fixture/main.tsx`,
    "import './index.css'; import { live } from './policy'; console.log(live());\n",
  );
  writeFileSync(
    `${root}/fixture/policy.ts`,
    'export const local = () => 1; export const live = () => local(); export const dead = () => 2;\n',
  );
  mkdirSync(`${root}/node_modules/styles-used`, { recursive: true });
  writeFileSync(
    `${root}/node_modules/styles-used/package.json`,
    JSON.stringify({ name: 'styles-used', version: '1.0.0' }),
  );
  writeFileSync(`${root}/node_modules/styles-used/styles.css`, 'body { color: black; }');
  writeFileSync(`${root}/fixture/index.css`, '@import "styles-used/styles.css";');
  writeFileSync(`${root}/fixture/test-only.ts`, 'export const onlyTested = () => 3;\n');
  writeFileSync(
    `${root}/fixture/policy.test.ts`,
    "import { dead } from './policy'; import { onlyTested } from './test-only'; console.log(dead(), onlyTested());\n",
  );
  const patterns = (value: unknown) => {
    if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
      throw new Error('Expected Knip entry/project patterns');
    return value.map((item) => item.replace('src/modern', 'fixture'));
  };
  writeFileSync(
    `${root}/knip.ts`,
    `import config from ${JSON.stringify(resolve('knip.config.ts'))}; export default { ...config, entry: ${JSON.stringify(patterns(config.entry))}, project: ${JSON.stringify(patterns(config.project))}, ignoreDependencies: [] };`,
  );
  const result = Bun.spawnSync([
    process.execPath,
    resolve('node_modules/knip/bin/knip.js'),
    '--directory',
    root,
    '--config',
    `${root}/knip.ts`,
    '--production',
    '--no-progress',
    '--reporter',
    'json',
  ]);
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout.toString()) as {
    issues: {
      file: string;
      exports?: { name: string }[];
      files?: { name: string }[];
      dependencies?: { name: string }[];
    }[];
  };
  expect(report.issues.flatMap((row) => row.dependencies ?? []).map(({ name }) => name)).not.toContain('styles-used');
  expect(report.issues.find((row) => row.file.endsWith('policy.ts'))?.exports?.map(({ name }) => name)).toEqual([
    'dead',
  ]);
  expect(report.issues.some((row) => row.file.endsWith('test-only.ts') && (row.files?.length ?? 0) > 0)).toBe(true);
});

test('Knip compiles real quoted CSS imports and refuses unsupported import syntax', () => {
  const compiler = config.compilers.css;
  expect(typeof compiler).toBe('function');
  expect(
    compiler(
      '@import "@eqds/tokens/tokens.css"; @import "tailwindcss"; @import "@eqds/css/equal.css" layer(components);',
      'fixture.css',
    ),
  ).toBe('import "@eqds/tokens/tokens.css";\nimport "tailwindcss";\nimport "@eqds/css/equal.css";');
  expect(() => compiler('@import url("styles.css");', 'fixture.css')).toThrow('Unsupported CSS @import');
  expect(() => compiler('@import "escaped\\\\path.css";', 'fixture.css')).toThrow('Unsupported CSS @import');
});
