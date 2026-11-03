import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('design lint has no warning-only rules or unused warning allowance', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, '../package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(manifest.scripts['lint:design']).toMatch(/--max-warnings(?:=|\s+)0(?:\s|$)/);
  const configuration = readFileSync(resolve(import.meta.dir, '../eslint.shadcn.mjs'), 'utf8');
  expect(configuration).not.toMatch(/['"]warn['"]/);
});
