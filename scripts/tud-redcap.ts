#!/usr/bin/env bun
// Writes REDCap data dictionaries for the Time Use Diary, one per language, diary day
// (today / yesterday) and study variant (standard / osu / sherbrooke), plus one codebook
// per day and variant mapping every REDCap choice code to the value Chronicle stores.
//   bun --tsconfig-override tsconfig.app.json scripts/tud-redcap.ts [--out DIR] [--max N]
// Defaults: --out build/tud-redcap, --max 40 activity blocks.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  buildRedcapFields,
  type RedcapField,
  type TudVariant,
  toCodebookCsv,
  toDictionaryCsv,
} from '../src/modern/components/tud/redcap/redcap-dictionary';
import type { ActivityDay } from '../src/modern/components/tud/tud-flow';
import { supportsTodayDiary } from '../src/modern/components/tud/tud-page-settings';
import { getBaseLanguageCode, LanguageCodes } from '../src/modern/i18n/language-codes';

const VARIANTS: TudVariant[] = ['standard', 'osu', 'sherbrooke'];
const DAYS: ActivityDay[] = ['today', 'yesterday'];

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
  return value;
}

function writeAtomic(path: string, content: string) {
  const part = `${path}.part`;
  writeFileSync(part, content, 'utf8');
  renameSync(part, path);
}

const outDir = resolve(argValue('--out', resolve(import.meta.dir, '../build/tud-redcap')));
const maxActivities = Number(argValue('--max', '40'));
mkdirSync(outDir, { recursive: true });

let written = 0;
for (const activityDay of DAYS) {
  for (const variant of VARIANTS) {
    const dictionaries: RedcapField[][] = [];
    for (const language of Object.values(LanguageCodes)) {
      // The form offers the "today" diary only in the languages that have its wording.
      if (activityDay === 'today' && !supportsTodayDiary(getBaseLanguageCode(language))) continue;
      const fields = buildRedcapFields({ activityDay, language, maxActivities, variant });
      writeAtomic(join(outDir, `tud-${activityDay}-${variant}-${language}.csv`), toDictionaryCsv(fields));
      written += 1;
      dictionaries.push(fields);
    }
    // One codebook for every language of this day and variant: the codes are shared.
    writeAtomic(join(outDir, `codebook-${activityDay}-${variant}.csv`), toCodebookCsv(dictionaries));
  }
}
console.log(`wrote ${written} data dictionaries and ${DAYS.length * VARIANTS.length} codebooks to ${outDir}`);
