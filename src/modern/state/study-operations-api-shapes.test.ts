import { describe, expect, it } from 'bun:test';
import { PARTICIPATION_STATUSES, STUDY_LIFECYCLE_STATUSES } from '@/generated/chronicle-contracts';

import {
  normalizeParticipantList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudyLifecycleStatus,
  normalizeStudySubmissionGroups,
  studyOperationsApi,
} from './study-operations-api';

describe('study lifecycle response normalization', () => {
  for (const status of STUDY_LIFECYCLE_STATUSES) {
    it(`preserves the recognized '${status}' status`, () => {
      expect(normalizeStudyLifecycleStatus(status)).toBe(status);
      expect(normalizeStudyLifecycleStatus({ status })).toBe(status);
    });
  }

  const invalidPayloads: ReadonlyArray<readonly [string, unknown]> = [
    ['a missing status', {}],
    ['an unknown status', { status: PARTICIPATION_STATUSES[2] }],
    ['a wrong-case status', { status: 'active' }],
    ['a numeric status', { status: 1 }],
    ['a null status', { status: null }],
    ['an array payload', [{ status: STUDY_LIFECYCLE_STATUSES[0] }]],
    ['a null payload', null],
    ['an unrelated primitive payload', true],
  ];

  for (const [description, payload] of invalidPayloads) {
    it(`fails closed for ${description}`, () => {
      expect(normalizeStudyLifecycleStatus(payload)).toBeNull();
    });
  }
});

describe('studyOperationsApi', () => {
  it('has reducerPath "studyOperationsApi"', () => {
    expect(studyOperationsApi.reducerPath).toBe('studyOperationsApi');
  });

  it('has endpoints object', () => {
    expect(typeof studyOperationsApi.endpoints).toBe('object');
  });

  it('has reducer function', () => {
    expect(typeof studyOperationsApi.reducer).toBe('function');
  });

  it('has middleware function', () => {
    expect(typeof studyOperationsApi.middleware).toBe('function');
  });

  // Test all exported endpoint names exist
  const endpointNames = [
    'archiveStudy',
    'cancelScheduledDeletion',
    'unarchiveStudy',
    'scheduleStudyDeletion',
    'createStudy',
    'setStudyLimits',
    'updateStudySettings',
    'createQuestionnaire',
    'deleteQuestionnaire',
    'deleteStudyParticipants',
    'downloadParticipantData',
    'downloadQuestionnaireResponses',
    'getAllStudies',
    'getComplianceViolations',
    'getParticipantStats',
    'getStudyDevices',
    'getStudyLifecycleStatus',
    'getStudyLimits',
    'getStudyParticipants',
    'getStudyQuestionnaires',
    'getStudySensorAvailability',
    'getStudySettingsAudit',
    'getStudySummary',
    'getStudyTudSubmissionGroups',
    'registerParticipant',
    'updateParticipantAnnotations',
    'updateParticipationStatus',
    'updateQuestionnaire',
    'updateStudy',
    'getStudySettings',
    'getAppUsageSurveyDays',
    'getAppUsageDaySurvey',
    'submitAppUsageSurvey',
    'submitTimeUseDiary',
  ] as const satisfies ReadonlyArray<keyof typeof studyOperationsApi.endpoints>;

  for (const name of endpointNames) {
    it(`has endpoint "${name}"`, () => {
      expect(studyOperationsApi.endpoints[name]).toBeDefined();
    });
  }
});

describe('normalizeQuestionnaireQuestion output contract', () => {
  const inputs: [string, unknown][] = [
    ['empty object', {}],
    ['object with title', { title: 'Q1' }],
    ['object with choices', { choices: ['A', 'B'] }],
    ['object with both', { title: 'Q1', choices: ['A'] }],
    ['object with numeric title', { title: 123, choices: 'not-array' }],
    ['object with extra field', { extra: 'field' }],
    ['null', null],
    ['undefined', undefined],
    ['number 42', 42],
    ['string input', 'string'],
    ['boolean true', true],
    ['nested object', { title: { nested: true } }],
  ];

  for (const [label, input] of inputs) {
    it(`output has string title for ${label}`, () => {
      const result = normalizeQuestionnaireQuestion(input);
      expect(typeof result.title).toBe('string');
    });
    it(`output has array choices for ${label}`, () => {
      const result = normalizeQuestionnaireQuestion(input);
      expect(Array.isArray(result.choices)).toBe(true);
    });
    it(`output has exactly 2 keys for ${label}`, () => {
      const result = normalizeQuestionnaireQuestion(input);
      expect(Object.keys(result).sort()).toEqual(['choices', 'title']);
    });
  }
});

// =============================================================================
// normalizeQuestionnaireRecord output contracts with diverse inputs
// =============================================================================

describe('normalizeQuestionnaireRecord output contract', () => {
  const inputs: [string, unknown][] = [
    [
      'full valid record',
      {
        id: 'q-1',
        title: 'Q',
        description: 'D',
        active: true,
        questions: [],
        recurrenceRule: 'FREQ=DAILY',
        dateCreated: '2024-01-01',
      },
    ],
    ['id only', { id: 'q-1' }],
    ['empty object', {}],
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['array', [1, 2]],
    ['string', 'hello'],
    ['object with non-string id', { id: 123 }],
    ['object with null fields', { id: 'q-1', title: null, description: null, active: null }],
  ];

  for (const [label, input] of inputs) {
    it(`output has string id for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(typeof result.id).toBe('string');
    });
    it(`output has boolean active for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(typeof result.active).toBe('boolean');
    });
    it(`output has string description for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(typeof result.description).toBe('string');
    });
    it(`output has string title for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(typeof result.title).toBe('string');
    });
    it(`output has array questions for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(Array.isArray(result.questions)).toBe(true);
    });
    it(`output recurrenceRule is string or null for ${label}`, () => {
      const result = normalizeQuestionnaireRecord(input);
      expect(result.recurrenceRule === null || typeof result.recurrenceRule === 'string').toBe(true);
    });
  }
});

// =============================================================================
// normalizeParticipantList output contracts
// =============================================================================

describe('normalizeParticipantList output contracts', () => {
  const validInputs: [string, unknown[]][] = [
    [
      'single enrolled',
      [{ participantId: 'p-1', participationStatus: PARTICIPATION_STATUSES[0], candidate: { id: 'c-1' } }],
    ],
    [
      'multiple participants',
      [
        { participantId: 'p-1', participationStatus: PARTICIPATION_STATUSES[0] },
        { participantId: 'p-2', participationStatus: PARTICIPATION_STATUSES[2] },
      ],
    ],
    ['with tags', [{ participantId: 'p-1', participantTags: ['tag1', 'tag2'] }]],
    ['with notes', [{ participantId: 'p-1', participantNotes: 'Some notes' }]],
    ['minimal', [{ participantId: 'p-1' }]],
  ];

  for (const [label, input] of validInputs) {
    it(`all items have string participantId for ${label}`, () => {
      const result = normalizeParticipantList(input);
      for (const p of result) {
        expect(typeof p.participantId).toBe('string');
      }
    });
    it(`all items have candidate object for ${label}`, () => {
      const result = normalizeParticipantList(input);
      for (const p of result) {
        expect(typeof p.candidate).toBe('object');
        expect(p.candidate).not.toBeNull();
      }
    });
    it(`all items have array participantTags for ${label}`, () => {
      const result = normalizeParticipantList(input);
      for (const p of result) {
        expect(Array.isArray(p.participantTags)).toBe(true);
      }
    });
    it(`all items have string participationStatus for ${label}`, () => {
      const result = normalizeParticipantList(input);
      for (const p of result) {
        expect(typeof p.participationStatus).toBe('string');
      }
    });
  }
});

// =============================================================================
// normalizeStudySubmissionGroups output contracts
// =============================================================================

describe('normalizeStudySubmissionGroups output contracts', () => {
  const validInputs: [string, Record<string, unknown>][] = [
    ['single date', { '2024-01-01': ['id-1'] }],
    ['multiple dates', { '2024-01-01': ['a'], '2024-02-01': ['b'], '2024-03-01': ['c'] }],
    ['empty ids', { '2024-01-01': [] }],
    ['numeric ids', { '2024-01-01': [1, 2, 3] }],
    ['mixed ids', { '2024-01-01': ['a', 1, 'b', 2] }],
    ['non-array value', { '2024-01-01': 'not-array' }],
    ['null value', { '2024-01-01': null }],
  ];

  for (const [label, input] of validInputs) {
    it(`all items have string date for ${label}`, () => {
      const result = normalizeStudySubmissionGroups(input);
      for (const g of result) {
        expect(typeof g.date).toBe('string');
      }
    });
    it(`all items have array ids for ${label}`, () => {
      const result = normalizeStudySubmissionGroups(input);
      for (const g of result) {
        expect(Array.isArray(g.ids)).toBe(true);
      }
    });
    it(`all ids are strings for ${label}`, () => {
      const result = normalizeStudySubmissionGroups(input);
      for (const g of result) {
        for (const id of g.ids) {
          expect(typeof id).toBe('string');
        }
      }
    });
  }
});
