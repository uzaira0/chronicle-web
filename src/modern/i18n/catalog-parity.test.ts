import { expect, test } from 'bun:test';

import { PARTICIPANT_DATA_TYPE_OPTIONS } from '../lib/participant-data-types';
import {
  ANDROID_SENSOR_TYPES,
  COLLECTION_DISPOSITIONS,
  COLLECTION_MODULE_GROUP_ORDER,
  COLLECTION_MODULES,
  HEALTH_CONNECT_RECORD_TYPES,
  IOS_SENSOR_TYPES,
  STUDY_FEATURES,
} from '../lib/study-constants';
import { catalogSlug } from './catalog';
import english from './en/translation.json';

// Mirror the fields emitted by scripts/i18n-sync-catalog.ts without running it.
const pairs: Record<string, ReadonlyArray<readonly [string, string]>> = {
  android_sensor: ANDROID_SENSOR_TYPES.map(({ label, value }) => [value, label]),
  data_type: PARTICIPANT_DATA_TYPE_OPTIONS.map(({ label, value }) => [value, label]),
  disposition: COLLECTION_DISPOSITIONS.map(({ label, value }) => [value, label]),
  disposition_description: COLLECTION_DISPOSITIONS.map(({ description, value }) => [value, description]),
  feature: STUDY_FEATURES.map(({ label, value }) => [value, label]),
  group: COLLECTION_MODULE_GROUP_ORDER.map((group) => [group, group]),
  health_connect: HEALTH_CONNECT_RECORD_TYPES.map(({ label, value }) => [value, label]),
  ios_sensor: IOS_SENSOR_TYPES.map(({ label, value }) => [value, label]),
  module: COLLECTION_MODULES.map(({ label, value }) => [value, label]),
  module_description: COLLECTION_MODULES.map(({ description, value }) => [value, description]),
  privacy_class: [...new Set(COLLECTION_MODULES.map(({ privacyClass }) => privacyClass))].map((cls) => [cls, cls]),
};
const expected = Object.fromEntries(
  Object.entries(pairs).map(([group, entries]) => [
    group,
    Object.fromEntries(entries.map(([value, label]) => [catalogSlug(value), label])),
  ]),
);
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
