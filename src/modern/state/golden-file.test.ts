import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ZodType, z } from 'zod';
import {
  normalizeParticipantList,
  normalizeQuestionnaireRecord,
  normalizeStudySubmissionGroups,
} from '@/state/study-operations-api';

const StudySummaryGoldenSchema = z
  .object({
    contact: z.string(),
    createdAt: z.string(),
    description: z.string(),
    group: z.string(),
    id: z.string(),
    modules: z
      .object({
        ANDROID_SENSOR: z.record(z.string(), z.unknown()),
        TIME_USE_DIARY: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    notificationsEnabled: z.boolean(),
    settings: z
      .object({
        AndroidSensor: z
          .object({
            dutyCycleActiveSeconds: z.number(),
            dutyCyclePeriodSeconds: z.number(),
            samplingRateHz: z.number(),
            sensors: z.array(z.string()),
          })
          .passthrough(),
      })
      .passthrough(),
    startedAt: z.string(),
    title: z.string(),
    version: z.string(),
  })
  .passthrough();

const CandidateGoldenSchema = z
  .object({
    dateOfBirth: z.string(),
    email: z.string(),
    firstName: z.string(),
    id: z.string(),
    lastName: z.string(),
  })
  .passthrough();

const ParticipantGoldenSchema = z.object({
  candidate: CandidateGoldenSchema,
  participantId: z.string(),
  participantNotes: z.string(),
  participantTags: z.array(z.string()),
  participationStatus: z.enum(['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN']),
});

const ParticipantGoldenFileSchema = z.object({
  expected: z.array(ParticipantGoldenSchema).min(1),
  input: ParticipantGoldenSchema,
});

const QuestionnaireQuestionGoldenSchema = z.object({
  choices: z.array(z.string()),
  title: z.string(),
});

const QuestionnaireRecordGoldenSchema = z.object({
  active: z.boolean(),
  dateCreated: z.string(),
  description: z.string(),
  id: z.string(),
  questions: z.array(QuestionnaireQuestionGoldenSchema),
  recurrenceRule: z.string(),
  title: z.string(),
});

const QuestionnaireRecordGoldenFileSchema = z.object({
  expected: QuestionnaireRecordGoldenSchema,
  input: QuestionnaireRecordGoldenSchema,
});

const StudySubmissionGroupGoldenSchema = z.object({
  date: z.string(),
  ids: z.array(z.string()),
});

const StudySubmissionGroupsGoldenFileSchema = z.object({
  expected: z.array(StudySubmissionGroupGoldenSchema),
  input: z.record(z.string(), z.array(z.string())),
});

function readGolden<T>(name: string, schema: ZodType<T>): T {
  const parsed: unknown = JSON.parse(readFileSync(join(__dirname, '../test/golden', `${name}.json`), 'utf-8'));
  return schema.parse(parsed);
}

describe('golden file tests — API response shape contracts', () => {
  describe('StudySummary shape', () => {
    it('has all expected fields', () => {
      const golden = readGolden('study-summary', StudySummaryGoldenSchema);
      const keys = Object.keys(golden);
      expect(keys).toContain('id');
      expect(keys).toContain('title');
      expect(keys).toContain('contact');
      expect(keys).toContain('description');
      expect(keys).toContain('modules');
      expect(keys).toContain('settings');
    });

    it('field types match', () => {
      const golden = readGolden('study-summary', StudySummaryGoldenSchema);
      expect(typeof golden.id).toBe('string');
      expect(typeof golden.title).toBe('string');
      expect(typeof golden.contact).toBe('string');
      expect(typeof golden.modules).toBe('object');
    });

    it('modules is an object with known feature keys', () => {
      const golden = readGolden('study-summary', StudySummaryGoldenSchema);
      expect(golden.modules).toHaveProperty('ANDROID_SENSOR');
      expect(golden.modules).toHaveProperty('TIME_USE_DIARY');
    });

    it('settings contains AndroidSensor config', () => {
      const golden = readGolden('study-summary', StudySummaryGoldenSchema);
      const sensor = golden.settings.AndroidSensor;
      expect(sensor).toBeDefined();
      expect(typeof sensor.samplingRateHz).toBe('number');
      expect(Array.isArray(sensor.sensors)).toBe(true);
    });

    it('optional date fields are strings when present', () => {
      const golden = readGolden('study-summary', StudySummaryGoldenSchema);
      expect(typeof golden.createdAt).toBe('string');
      expect(typeof golden.startedAt).toBe('string');
    });
  });

  describe('Participant shape', () => {
    it('normalizer output matches golden', () => {
      const golden = readGolden('participant', ParticipantGoldenFileSchema);
      const normalized = normalizeParticipantList([golden.input]);
      expect(normalized).toEqual(golden.expected);
    });

    it('golden input has all required participant fields', () => {
      const golden = readGolden('participant', ParticipantGoldenFileSchema);
      expect(golden.input).toHaveProperty('participantId');
      expect(golden.input).toHaveProperty('candidate');
      expect(golden.input).toHaveProperty('participationStatus');
      expect(golden.input).toHaveProperty('participantTags');
    });

    it('golden expected preserves candidate details', () => {
      const golden = readGolden('participant', ParticipantGoldenFileSchema);
      const expected = golden.expected[0];
      expect(expected).toBeDefined();
      if (!expected) {
        throw new Error('Participant golden file must contain at least one expected participant');
      }
      expect(expected.candidate).toHaveProperty('id');
      expect(expected.candidate).toHaveProperty('firstName');
      expect(expected.candidate).toHaveProperty('lastName');
    });
  });

  describe('QuestionnaireRecord shape', () => {
    it('normalizer output matches golden', () => {
      const golden = readGolden('questionnaire-record', QuestionnaireRecordGoldenFileSchema);
      const normalized = normalizeQuestionnaireRecord(golden.input);
      expect(normalized).toEqual(golden.expected);
    });

    it('golden input has all questionnaire fields', () => {
      const golden = readGolden('questionnaire-record', QuestionnaireRecordGoldenFileSchema);
      expect(golden.input).toHaveProperty('id');
      expect(golden.input).toHaveProperty('title');
      expect(golden.input).toHaveProperty('questions');
      expect(golden.input).toHaveProperty('recurrenceRule');
    });

    it('questions preserve choice arrays', () => {
      const golden = readGolden('questionnaire-record', QuestionnaireRecordGoldenFileSchema);
      for (const q of golden.expected.questions) {
        expect(Array.isArray(q.choices)).toBe(true);
        expect(typeof q.title).toBe('string');
      }
    });
  });

  describe('StudySubmissionGroups shape', () => {
    it('normalizer output matches golden', () => {
      const golden = readGolden('study-submission-groups', StudySubmissionGroupsGoldenFileSchema);
      const normalized = normalizeStudySubmissionGroups(golden.input);
      expect(normalized).toEqual(golden.expected);
    });

    it('golden output is sorted descending by date', () => {
      const golden = readGolden('study-submission-groups', StudySubmissionGroupsGoldenFileSchema);
      const dates = golden.expected.map((group) => group.date);
      const sorted = [...dates].sort((left, right) => right.localeCompare(left));
      expect(dates).toEqual(sorted);
    });

    it('each group has date and ids fields', () => {
      const golden = readGolden('study-submission-groups', StudySubmissionGroupsGoldenFileSchema);
      for (const group of golden.expected) {
        expect(typeof group.date).toBe('string');
        expect(Array.isArray(group.ids)).toBe(true);
      }
    });
  });
});
