import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectThirdPartyNotices } from './third-party-notices';

function pkg(dir: string, json: object, license?: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(json));
  if (license) writeFileSync(join(dir, 'LICENSE'), license);
}

describe('collectThirdPartyNotices', () => {
  it('ships license text for every production dependency, transitively, skipping private and dev', () => {
    const root = mkdtempSync(join(import.meta.dir, '../node_modules/.cache-notices-'));
    pkg(root, { dependencies: { a: '^1', own: 'file:vendor/own' }, devDependencies: { dev: '^1' } });
    pkg(
      join(root, 'node_modules/a'),
      { name: 'a', version: '1.0.0', license: 'MIT', dependencies: { b: '^2' } },
      'MIT text A',
    );
    pkg(
      join(root, 'node_modules/a/node_modules/b'),
      { name: 'b', version: '2.0.0', license: 'BSD-3-Clause' },
      'BSD text B',
    );
    pkg(join(root, 'node_modules/own'), { name: 'own', version: '0.1.0', private: true, license: 'MIT' }, 'own');
    pkg(join(root, 'node_modules/dev'), { name: 'dev', version: '1.0.0', license: 'MIT' }, 'dev text');

    let text: string;
    try {
      text = collectThirdPartyNotices(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }

    expect(text).toContain('a@1.0.0 (MIT)');
    expect(text).toContain('MIT text A');
    expect(text).toContain('b@2.0.0 (BSD-3-Clause)');
    expect(text).toContain('BSD text B');
    expect(text).not.toContain('own@');
    expect(text).not.toContain('dev text');
  });
});
