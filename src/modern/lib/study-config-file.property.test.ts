import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { z } from 'zod';
import { APP_USAGE_FREQUENCIES, WITHDRAWAL_MODE } from '@/generated/chronicle-contracts';
import { EMPTY_PARTICIPANT_POLICY_FORM } from './participant-policy';
import { parseStudyConfig, STUDY_CONFIG_FORMAT, STUDY_CONFIG_VERSION, StudyConfigError } from './study-config-file';
import { COLLECTION_MODULES } from './study-constants';
import { portableModuleDraftSchema } from './study-form-model';

const study = {
  modules: {},
  contact: 'research@example.org',
  dataRetentionDays: '',
  description: '',
  features: ['CHRONICLE_DATA_COLLECTION'],
  group: '',
  studyDurationDays: '',
  title: 'Fixture',
  version: '',
};
const valid = { format: STUDY_CONFIG_FORMAT, version: STUDY_CONFIG_VERSION, study };
const parsedSchema = z
  .object({
    contact: z.string(),
    dataRetentionDays: z.string(),
    description: z.string(),
    group: z.string(),
    studyDurationDays: z.string(),
    title: z.string(),
    version: z.string(),
    features: z.array(z.string()),
    modules: z.record(z.string(), portableModuleDraftSchema),
    participantPolicy: z.record(z.string(), z.string()),
    timeZone: z.string().optional(),
    appUsageFrequency: z.enum(APP_USAGE_FREQUENCIES).optional(),
    withdrawalMode: z.enum([WITHDRAWAL_MODE.KEEP_PRIOR_DATA, WITHDRAWAL_MODE.ERASE]).optional(),
  })
  .strict();

function parseOrRefuse(text: string) {
  let result: ReturnType<typeof parseStudyConfig>;
  try {
    result = parseStudyConfig(text);
  } catch (error) {
    expect(error).toBeInstanceOf(StudyConfigError);
    return;
  }
  expect(parsedSchema.safeParse(result).success).toBe(true);
  expect(Object.keys(result.modules).sort()).toEqual(COLLECTION_MODULES.map(({ value }) => value).sort());
  expect(Object.keys(result.participantPolicy ?? {}).sort()).toEqual(Object.keys(EMPTY_PARTICIPANT_POLICY_FORM).sort());
  expect(parseStudyConfig(JSON.stringify({ ...valid, study: result }))).toEqual(result);
}

describe('study config mutated corpus', () => {
  it('accepts a schema-valid form or returns a typed refusal for malformed input', () => {
    const corpus = [
      '\0',
      '\ud800',
      '{',
      '[]',
      JSON.stringify({ ...valid, study: null }),
      `${'['.repeat(5_000)}null${']'.repeat(5_000)}`,
      JSON.stringify({ ...valid, study: { ...study, modules: { usage_events: null } } }),
    ];
    for (const text of corpus) parseOrRefuse(text);
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(study), 'participantPolicy', 'timeZone', 'withdrawalMode', 'appUsageFrequency'),
        fc.oneof(fc.jsonValue(), fc.constant('\0'), fc.constant('\ud800'), fc.constant(-1e300), fc.constant(1e300)),
        (field, value) => parseOrRefuse(JSON.stringify({ ...valid, study: { ...study, [field]: value } })),
      ),
      { numRuns: 300, seed: 20261101 },
    );
  });
});
