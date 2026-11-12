// bunfig.toml sets `peer = false`: an install adds no peer dependency by itself, so a package
// finds its required peer only when package.json or another package's dependencies install it.
// bun.lock lists every package's peers, so the gap shows without an install; a checkout whose
// node_modules predates `peer = false` still holds the peer and hides it. Packages this
// repository's own files import are Knip's to check (`bun run dead-code`, unlisted dependencies).
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Names = Record<string, string>;
interface Manifest {
  dependencies?: Names;
  devDependencies?: Names;
  optionalDependencies?: Names;
}
interface LockPackage {
  dependencies?: Names;
  optionalDependencies?: Names;
  peerDependencies?: Names;
  optionalPeers?: string[];
}

const web = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8')) as Manifest;
const declared = Object.keys({
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.optionalDependencies,
});
const lock = Bun.JSONC.parse(readFileSync(join(web, 'bun.lock'), 'utf8')) as {
  packages: Record<string, [string, ...unknown[]]>;
};
const packages = Object.values(lock.packages).map(([id, ...rest]) => ({
  name: id.slice(0, id.indexOf('@', 1)),
  ...(rest.find((part): part is LockPackage => typeof part === 'object' && part !== null) ?? {}),
}));

// "<package> needs <peer>" for every required peer left out of an install of these direct dependencies.
function requiredPeersLeftOut(direct: string[]): string[] {
  const installed = new Set<string>();
  const queue = [...direct];
  for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
    if (installed.has(name)) continue;
    installed.add(name);
    for (const entry of packages.filter((candidate) => candidate.name === name)) {
      queue.push(...Object.keys({ ...entry.dependencies, ...entry.optionalDependencies }));
    }
  }
  return packages
    .filter(({ name }) => installed.has(name))
    .flatMap(({ name, peerDependencies = {}, optionalPeers = [] }) =>
      Object.keys(peerDependencies)
        .filter((peer) => !optionalPeers.includes(peer) && !installed.has(peer))
        .map((peer) => `${name} needs ${peer}`),
    )
    .sort();
}

test('an install provides every required peer except the bun npm package', () => {
  // bun-plugin-tailwind's peer is the `bun` npm package, left out on purpose: its bin is a
  // placeholder until its postinstall runs and would shadow the Bun runtime (bunfig.toml).
  expect(requiredPeersLeftOut(declared)).toEqual(['bun-plugin-tailwind needs bun']);
});

test('a required peer that package.json stops declaring is reported', () => {
  expect(requiredPeersLeftOut(declared.filter((name) => name !== '@testing-library/dom'))).toEqual([
    '@testing-library/react needs @testing-library/dom',
    'bun-plugin-tailwind needs bun',
  ]);
});
