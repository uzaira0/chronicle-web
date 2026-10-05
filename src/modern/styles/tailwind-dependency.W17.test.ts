import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workspace = resolve(import.meta.dir, '../../..');
const packageJson = JSON.parse(readFileSync(resolve(workspace, 'package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>;
};
const lock = readFileSync(resolve(workspace, 'bun.lock'), 'utf8');
const workspaceLock = lock.split('"packages": {', 1)[0] ?? '';

test('Tailwind CSS imports are backed by a matching direct development dependency and lock entry', () => {
  const styles = readFileSync(resolve(import.meta.dir, 'index.css'), 'utf8');
  const importedPackage = [...styles.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
  expect(importedPackage).toContain('tailwindcss');
  const tailwindPackage = 'tailwindcss';

  const version = packageJson.devDependencies?.[tailwindPackage];
  expect(version).toMatch(/^\^4\.2\.1$/);
  expect(workspaceLock).toMatch(/"tailwindcss": "\^4\.2\.1"/);
});
