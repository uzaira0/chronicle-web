// Builds dist/THIRD-PARTY-NOTICES.txt: the license text of every production dependency,
// walked transitively from package.json `dependencies` through node_modules. The minified
// bundle strips license comments, so MIT/BSD/CC-BY attribution ships in this file instead.
// Private (repo-owned `file:`) packages are skipped, matching check-frontend-licenses.sh.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface PackageJson {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  private?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function readPackage(dir: string): PackageJson {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as PackageJson;
}

// Node resolution: nearest node_modules/<name> walking up from the requiring package.
function resolveDependency(fromDir: string, name: string, root: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === root) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function licenseText(dir: string): string {
  const files = readdirSync(dir)
    .filter((file) => /^(licen[cs]e|copying|notice)/i.test(file))
    .sort();
  return files.map((file) => readFileSync(join(dir, file), 'utf-8').trim()).join('\n\n');
}

function noticeEntry(id: string, pkg: PackageJson, dir: string): string {
  const license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'UNKNOWN');
  const text = licenseText(dir) || `(no license file shipped; declared license: ${license})`;
  return `${id} (${license})\n\n${text}`;
}

export function collectThirdPartyNotices(root: string): string {
  const seen = new Map<string, string>();
  const queue: Array<[string, Record<string, string>]> = [[root, readPackage(root).dependencies ?? {}]];
  while (queue.length > 0) {
    const [fromDir, deps] = queue.shift() as [string, Record<string, string>];
    for (const name of Object.keys(deps)) {
      const dir = resolveDependency(fromDir, name, root);
      if (!dir) continue; // optional/platform-specific dependency not installed on this host
      const pkg = readPackage(dir);
      const id = `${pkg.name ?? name}@${pkg.version ?? '0.0.0'}`;
      if (seen.has(id) || pkg.private) continue;
      seen.set(id, noticeEntry(id, pkg, dir));
      queue.push([dir, { ...pkg.dependencies, ...pkg.optionalDependencies }]);
    }
  }
  const entries = [...seen.keys()].sort().map((id) => seen.get(id) as string);
  return `Third-party software notices for the Chronicle web dashboard bundle.\n\n${entries.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`;
}
