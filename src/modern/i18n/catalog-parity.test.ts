import { expect, test } from 'bun:test';

import { buildCatalog } from '../../../scripts/i18n-sync-catalog';
import english from './en/translation.json';
import spanish from './es/translation.json';

// The committed English catalog must be exactly what the generator writes.
const expected = buildCatalog();
const actual: Record<string, Record<string, string>> = english.catalog;
const allGroups = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];

function groupDifferences(group: string): string[] {
  if (!Object.hasOwn(expected, group)) return [`extra catalog.${group}: ${JSON.stringify(actual[group])}`];
  if (!Object.hasOwn(actual, group)) return [`missing catalog.${group}: ${JSON.stringify(expected[group])}`];
  const wanted = expected[group] ?? {};
  const found = actual[group] ?? {};
  const differences: string[] = [];
  for (const key of new Set([...Object.keys(wanted), ...Object.keys(found)])) {
    const path = `catalog.${group}.${key}`;
    if (!Object.hasOwn(found, key)) {
      differences.push(`missing ${path}: expected ${JSON.stringify(wanted[key])}`);
    } else if (!Object.hasOwn(wanted, key)) {
      differences.push(`extra ${path}: actual ${JSON.stringify(found[key])}`);
    } else if (found[key] !== wanted[key]) {
      differences.push(
        `changed ${path}: expected ${JSON.stringify(wanted[key])}; actual ${JSON.stringify(found[key])}`,
      );
    }
  }
  return differences;
}

for (const [name, groups] of [
  ['module labels', ['module']],
  ['module descriptions', ['module_description']],
  ['remaining catalog fields', allGroups.filter((group) => group !== 'module' && group !== 'module_description')],
] as const) {
  test(`English catalog matches constants: ${name}`, () => {
    expect(groups.flatMap(groupDifferences)).toEqual([]);
  });
}

// Pilot participants read Spanish. Translators are volunteers, so a key missing from the Spanish
// table falls back to English and is allowed; a Spanish string that exists must keep the English placeholders
// and references, so the participant never sees a raw {{token}} or loses a value.
// The namespace list is written out here, not derived from the pages under test.
const PILOT_SPANISH_NAMESPACES: string[] = [
  'enrollment',
  'participant_access',
  'participant_session',
  'participant_shell',
  'participant_submission',
  'participant_landing',
  'app_usage_survey',
  'participants',
  'change_enrollment',
  'download_modal',
  'qr_modal',
  'participant_info',
  'policy_fields',
  'policy_validation',
  'modules_panel',
  'status',
  'login',
  'common',
];

type Tree = { [key: string]: unknown };
function spanishLeaves(tree: Tree, prefix: string): [string, unknown][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? spanishLeaves(value as Tree, `${prefix}.${key}`)
      : [[`${prefix}.${key}`, value] as [string, unknown]],
  );
}
function at(tree: Tree, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree);
}
const PLACEHOLDER = /\{\{\s*[^}]+?\s*\}\}|\$t\([^)]+\)/g;
const placeholders = (value: unknown) =>
  (typeof value === 'string' ? (value.match(PLACEHOLDER) ?? []) : []).map((p) => p.replace(/\s+/g, '')).sort();

function spanishProblems(path: string, englishValue: unknown): string[] {
  const value = at(spanish, path);
  if (value === undefined) return [];
  if (Array.isArray(englishValue))
    return Array.isArray(value) && value.length === englishValue.length ? [] : [`array ${path}`];
  if (typeof value !== typeof englishValue) return [`type ${path}`];
  return placeholders(value).join() === placeholders(englishValue).join() ? [] : [`placeholders ${path}`];
}

test.each(PILOT_SPANISH_NAMESPACES)('Spanish strings of %s keep the English placeholders', (namespace) => {
  const englishTree = (english as Tree)[namespace] as Tree;
  expect(englishTree).toBeDefined();
  expect(
    spanishLeaves(englishTree, namespace).flatMap(([path, englishValue]) => spanishProblems(path, englishValue)),
  ).toEqual([]);
});
