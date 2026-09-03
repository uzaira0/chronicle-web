#!/usr/bin/env bun
// Lists the English keys each language table still lacks (the translator's to-do list) and
// any keys a table carries that English no longer has. Exit code 1 when --check and a table
// has stale keys. Usage: bun scripts/i18n-report.ts [--check] [code ...]
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../src/modern/i18n');

type Tree = Record<string, unknown>;

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Tree, path)) out.set(k, v);
    } else out.set(path, Array.isArray(value) ? value.join(' | ') : String(value));
  }
  return out;
}

function load(code: string): Map<string, string> {
  return flatten(JSON.parse(readFileSync(resolve(ROOT, code, 'translation.json'), 'utf8')) as Tree);
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const requested = args.filter((arg) => !arg.startsWith('--'));
const codes = requested.length
  ? requested
  : readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== 'en')
      .map((entry) => entry.name);

const english = load('en');
let stale = false;
for (const code of codes) {
  const table = load(code);
  const missing = [...english.keys()].filter((key) => !table.has(key));
  const extra = [...table.keys()].filter((key) => !english.has(key));
  console.log(`${code}: ${table.size} keys, ${missing.length} missing, ${extra.length} stale`);
  if (requested.length) for (const key of missing) console.log(`  - ${key}: ${english.get(key)}`);
  for (const key of extra) console.log(`  ! stale: ${key}`);
  if (extra.length) stale = true;
}
if (check && stale) process.exit(1);
