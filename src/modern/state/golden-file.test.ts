import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ZodType, z } from 'zod';
import { COLLECTION_MODULE_ID, COLLECTION_MODULE_IDS, PARTICIPATION_STATUSES } from '@/generated/chronicle-contracts';
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
        CHRONICLE_DATA_COLLECTION: z.record(z.string(), z.unknown()),
        TIME_USE_DIARY: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
    settings: z
      .object({
        DataCollection: z
          .object({
            modules: z.record(z.string(), z.unknown()),
            settingsVersion: z.number(),
            version: z.number(),
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

const ConsentStateGoldenSchema = z.object({
  declinedRequiredModules: z.array(z.enum(COLLECTION_MODULE_IDS)),
  modulesAwaitingDecision: z.array(z.enum(COLLECTION_MODULE_IDS)),
});

const ParticipantGoldenSchema = z.object({
  candidate: CandidateGoldenSchema,
  participantId: z.string(),
  participantNotes: z.string(),
  participantTags: z.array(z.string()),
  participationStatus: z.enum(PARTICIPATION_STATUSES),
  statusRevision: z.number().int(),
  withdrawnAt: z.string().nullable().optional(),
  consentState: ConsentStateGoldenSchema.nullable().optional(),
});

// The normalizer always emits withdrawnAt; the raw backend payload may omit it.
const NormalizedParticipantGoldenSchema = ParticipantGoldenSchema.extend({
  withdrawnAt: z.string().nullable(),
  processingBlockedAt: z.string().nullable(),
  processingBlockReason: z.string().nullable(),
  processingBlockedBy: z.string().nullable(),
  consentState: ConsentStateGoldenSchema.nullable(),
});

const ParticipantGoldenFileSchema = z.object({
  expected: z.array(NormalizedParticipantGoldenSchema).min(1),
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
      const golden = readGolden('backend-study', StudySummaryGoldenSchema);
      const keys = Object.keys(golden);
      expect(keys).toContain('id');
      expect(keys).toContain('title');
      expect(keys).toContain('contact');
      expect(keys).toContain('description');
      expect(keys).toContain('modules');
      expect(keys).toContain('settings');
    });

    it('field types match', () => {
      const golden = readGolden('backend-study', StudySummaryGoldenSchema);
      expect(typeof golden.id).toBe('string');
      expect(typeof golden.title).toBe('string');
      expect(typeof golden.contact).toBe('string');
      expect(typeof golden.modules).toBe('object');
    });

    it('modules is an object with known feature keys', () => {
      const golden = readGolden('backend-study', StudySummaryGoldenSchema);
      expect(golden.modules).toHaveProperty('CHRONICLE_DATA_COLLECTION');
      expect(golden.modules).toHaveProperty('TIME_USE_DIARY');
    });

    it('settings contains generalized collection modules', () => {
      const golden = readGolden('backend-study', StudySummaryGoldenSchema);
      expect(golden.settings.DataCollection.modules).toHaveProperty(COLLECTION_MODULE_ID.sensor_accelerometer);
    });

    it('optional date fields are strings when present', () => {
      const golden = readGolden('backend-study', StudySummaryGoldenSchema);
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

    // The server's own serialization (chronicle-server web-golden), with its null consent state, field for field.
    it('normalizes the backend participant golden', () => {
      const backend = readGolden('backend-participant', z.record(z.string(), z.unknown()));
      expect(normalizeParticipantList([backend])).toEqual([
        {
          candidate: { id: '11111111-1111-4111-8111-111111111111' },
          consentState: null,
          participantId: 'p-golden-1',
          participantNotes: 'Completed all sessions',
          participantTags: ['control', 'wave-2'],
          participationStatus: 'ENROLLED',
          processingBlockReason: null,
          processingBlockedAt: null,
          processingBlockedBy: null,
          statusRevision: 0,
          withdrawnAt: null,
        },
      ]);
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
