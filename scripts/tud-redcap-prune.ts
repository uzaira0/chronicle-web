#!/usr/bin/env bun
// Clears answers a REDCap Time Use Diary export kept after the participant went back and
// changed an earlier answer (see src/modern/components/tud/redcap/redcap-export.ts).
//   bun --tsconfig-override tsconfig.app.json scripts/tud-redcap-prune.ts \
//     --dictionary tud-yesterday-standard-en.csv --in export.csv --out export-clean.csv
// The export must be "raw data" with variable names as the header (REDCap's CSV raw export).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { pruneExportCsv } from '../src/modern/components/tud/redcap/redcap-export';

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`[tud-redcap-prune] ${name} FILE is required`);
  return resolve(value);
}

const dictionary = readFileSync(required('--dictionary'), 'utf8');
const input = readFileSync(required('--in'), 'utf8');
const out = required('--out');
const { csv, cleared } = pruneExportCsv(dictionary, input);
writeFileSync(`${out}.part`, csv, 'utf8');
renameSync(`${out}.part`, out);
console.log(`cleared ${cleared} answers hidden by later edits; wrote ${out}`);
