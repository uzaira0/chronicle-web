// Vendored code states where it came from, and no orphan
// tarballs ride along in the repo.
import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const web = join(import.meta.dir, '..');
const vendor = join(web, 'vendor/equal');

test('no tarballs are tracked in chronicle-web', () => {
  const tracked = execFileSync('git', ['ls-files', '*.tgz'], { cwd: web, encoding: 'utf-8' })
    .split('\n')
    .filter((path) => path && existsSync(join(web, path)));
  expect(tracked).toEqual([]);
});

test('vendor/equal has a provenance note naming source, version and reason', () => {
  const note = readFileSync(join(vendor, 'PROVENANCE.md'), 'utf-8');
  for (const heading of ['## Source', '## Version', '## Why vendored', '## Updating']) {
    expect(note).toContain(heading);
  }
});

// A reader must be able to find the exact source the packages were generated from.
test('vendor/equal names its source repository and the 40-hex source commit', () => {
  const note = readFileSync(join(vendor, 'PROVENANCE.md'), 'utf-8');
  const source = note.split('## Source')[1]?.split('\n## ')[0] ?? '';
  expect(source).toMatch(/^Source location: `(https:\/\/|git@)[^`\s]+`$/m);
  expect(source).toMatch(/^Source commit: `[0-9a-f]{40}`/m);
});

test('vendored READMEs only point at regenerate scripts that exist here', () => {
  for (const pkg of readdirSync(join(vendor, 'packages'))) {
    const readme = join(vendor, 'packages', pkg, 'README.md');
    if (!existsSync(readme)) continue;
    expect(readFileSync(readme, 'utf-8')).not.toContain('ontology/scripts/sync_packages.py');
  }
});

test('the vendored OFL fonts carry their license', () => {
  expect(readFileSync(join(vendor, 'packages/tokens/dist/fonts/OFL.txt'), 'utf-8')).toContain('SIL OPEN FONT LICENSE');
});

test('every recorded vendored-file hash matches the file', () => {
  const note = readFileSync(join(vendor, 'PROVENANCE.md'), 'utf-8');
  const recorded = [...note.matchAll(/^- `([^`]+)` `([0-9a-f]{64})`/gm)];
  expect(recorded.length).toBeGreaterThan(0);
  for (const [, path = '', hash = ''] of recorded) {
    const actual = new Bun.CryptoHasher('sha256').update(readFileSync(join(vendor, path))).digest('hex');
    expect({ hash: actual, path }).toEqual({ hash, path });
  }
});
