#!/usr/bin/env bun
// Regenerates the English `catalog` namespace in src/modern/i18n/en/translation.json from
// the web presentation constants, so a translation table can override any catalog label.
//   bun --tsconfig-override tsconfig.app.json scripts/i18n-sync-catalog.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { catalogSlug } from '../src/modern/i18n/catalog';
import { PARTICIPANT_DATA_TYPE_OPTIONS } from '../src/modern/lib/participant-data-types';
import {
  ANDROID_DIAGNOSTIC_FAMILIES,
  ANDROID_SENSOR_TYPES,
  ANDROID_UPLOAD_ISSUES,
  COLLECTION_MODULE_GROUP_ORDER,
  COLLECTION_MODULES,
  HEALTH_CONNECT_RECORD_TYPES,
  STUDY_FEATURES,
} from '../src/modern/lib/study-constants';

const TABLE = resolve(import.meta.dir, '../src/modern/i18n/en/translation.json');

function entries(pairs: ReadonlyArray<readonly [string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [value, label] of pairs) out[catalogSlug(value)] = label;
  return out;
}

/** The English `catalog` namespace, generated from the presentation constants. */
export function buildCatalog(): Record<string, Record<string, string>> {
  return {
    android_sensor: entries(ANDROID_SENSOR_TYPES.map(({ label, value }) => [value, label] as const)),
    data_type: entries(PARTICIPANT_DATA_TYPE_OPTIONS.map(({ label, value }) => [value, label] as const)),
    diagnostic_family: entries(ANDROID_DIAGNOSTIC_FAMILIES.map(({ label, value }) => [value, label] as const)),
    feature: entries(STUDY_FEATURES.map(({ label, value }) => [value, label] as const)),
    group: entries(COLLECTION_MODULE_GROUP_ORDER.map((group) => [group, group] as const)),
    health_connect: entries(HEALTH_CONNECT_RECORD_TYPES.map(({ label, value }) => [value, label] as const)),
    module: entries(COLLECTION_MODULES.map(({ label, value }) => [value, label] as const)),
    module_description: entries(COLLECTION_MODULES.map(({ description, value }) => [value, description] as const)),
    privacy_class: entries(
      [...new Set(COLLECTION_MODULES.map(({ privacyClass }) => privacyClass))].map((cls) => [cls, cls] as const),
    ),
    upload_issue: entries(ANDROID_UPLOAD_ISSUES.map(({ label, value }) => [value, label] as const)),
  };
}

if (import.meta.main) {
  const catalog = buildCatalog();
  const table = JSON.parse(readFileSync(TABLE, 'utf8')) as Record<string, unknown>;
  table.catalog = catalog;
  writeFileSync(TABLE, `${JSON.stringify(table, null, 2)}\n`);
  console.log(`catalog: ${Object.values(catalog).reduce((n, group) => n + Object.keys(group).length, 0)} keys written`);
}
