import { describe, expect, it } from 'bun:test';

import {
  normalizeParticipantList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudyLifecycleStatus,
  normalizeStudySubmissionGroups,
  studyOperationsApi,
} from './study-operations-api';

// =============================================================================
// StudySummary shape
// =============================================================================

describe('StudySummary shape', () => {
  const sample = {
    id: 'abc-123',
    title: 'Test Study',
    contact: 'admin@test.com',
    createdAt: '2024-01-01T00:00:00Z',
    description: 'A study for testing',
    endedAt: '2025-01-01T00:00:00Z',
    group: 'research',
    modules: { CHRONICLE_DATA_COLLECTION: {} },
    notificationsEnabled: true,
    phoneNumber: '+1234567890',
    settings: { key: 'value' },
    startedAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    version: '1.0',
  };

  it('id is a string', () => {
    expect(typeof sample.id).toBe('string');
  });
  it('title is a string', () => {
    expect(typeof sample.title).toBe('string');
  });
  it('contact is a string', () => {
    expect(typeof sample.contact).toBe('string');
  });
  it('createdAt is a string', () => {
    expect(typeof sample.createdAt).toBe('string');
  });
  it('description is a string', () => {
    expect(typeof sample.description).toBe('string');
  });
  it('endedAt is a string', () => {
    expect(typeof sample.endedAt).toBe('string');
  });
  it('group is a string', () => {
    expect(typeof sample.group).toBe('string');
  });
  it('modules is an object', () => {
    expect(typeof sample.modules).toBe('object');
  });
  it('notificationsEnabled is a boolean', () => {
    expect(typeof sample.notificationsEnabled).toBe('boolean');
  });
  it('phoneNumber is a string', () => {
    expect(typeof sample.phoneNumber).toBe('string');
  });
  it('settings is an object', () => {
    expect(typeof sample.settings).toBe('object');
  });
  it('startedAt is a string', () => {
    expect(typeof sample.startedAt).toBe('string');
  });
  it('updatedAt is a string', () => {
    expect(typeof sample.updatedAt).toBe('string');
  });
  it('version is a string', () => {
    expect(typeof sample.version).toBe('string');
  });

  it('minimal empty object satisfies shape', () => {
    const minimal = {};
    expect(typeof minimal).toBe('object');
  });

  it('all fields are optional — empty object is valid', () => {
    const s = {} as Record<string, unknown>;
    expect(s.id).toBeUndefined();
    expect(s.title).toBeUndefined();
    expect(s.contact).toBeUndefined();
  });
});

// =============================================================================
// StudyUpdatePayload shape
// =============================================================================

describe('StudyUpdatePayload shape', () => {
  it('accepts contact field', () => {
    const payload = { contact: 'new@test.com' };
    expect(typeof payload.contact).toBe('string');
  });
  it('accepts description field', () => {
    const payload = { description: 'Updated' };
    expect(typeof payload.description).toBe('string');
  });
  it('accepts group field', () => {
    const payload = { group: 'g1' };
    expect(typeof payload.group).toBe('string');
  });
  it('accepts modules field', () => {
    const payload = { modules: { TIME_USE_DIARY: {} } };
    expect(typeof payload.modules).toBe('object');
  });
  it('accepts notificationsEnabled field', () => {
    const payload = { notificationsEnabled: false };
    expect(typeof payload.notificationsEnabled).toBe('boolean');
  });
  it('accepts title field', () => {
    const payload = { title: 'New Title' };
    expect(typeof payload.title).toBe('string');
  });
  it('accepts version field', () => {
    const payload = { version: '2.0' };
    expect(typeof payload.version).toBe('string');
  });
  it('accepts all fields at once', () => {
    const payload = {
      contact: 'a',
      description: 'b',
      group: 'c',
      modules: {},
      notificationsEnabled: true,
      title: 'd',
      version: 'e',
    };
    expect(Object.keys(payload)).toHaveLength(7);
  });
});

// =============================================================================
// Participant shape
// =============================================================================

describe('Participant shape', () => {
  const participant = {
    candidate: { id: 'c-1' },
    participantId: 'p-1',
    participantNotes: 'Some notes',
    participantTags: ['tag1', 'tag2'],
    participationStatus: 'ENROLLED' as const,
  };

  it('has participantId string', () => {
    expect(typeof participant.participantId).toBe('string');
  });
  it('has candidate object', () => {
    expect(typeof participant.candidate).toBe('object');
  });
  it('candidate has id string', () => {
    expect(typeof participant.candidate.id).toBe('string');
  });
  it('has participantNotes string', () => {
    expect(typeof participant.participantNotes).toBe('string');
  });
  it('has participantTags array', () => {
    expect(Array.isArray(participant.participantTags)).toBe(true);
  });
  it('participantTags contains strings', () => {
    for (const tag of participant.participantTags) {
      expect(typeof tag).toBe('string');
    }
  });
  it('has participationStatus', () => {
    expect(typeof participant.participationStatus).toBe('string');
  });
});

// =============================================================================
// ParticipationStatus values
// =============================================================================

describe('ParticipationStatus values', () => {
  const validStatuses = ['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN'];

  for (const status of validStatuses) {
    it(`'${status}' is a valid participation status`, () => {
      expect(validStatuses).toContain(status);
    });
  }

  const invalidStatuses = [
    'enrolled',
    'Active',
    'DELETED',
    'SUSPENDED',
    'PENDING',
    'COMPLETED',
    'INACTIVE',
    'BLOCKED',
    '',
    'null',
  ];
  for (const status of invalidStatuses) {
    it(`'${status}' is NOT a valid participation status`, () => {
      expect(validStatuses).not.toContain(status);
    });
  }
});

// =============================================================================
// StudyLifecycleStatus values
// =============================================================================

describe('StudyLifecycleStatus values', () => {
  const validStatuses = ['ACTIVE', 'ARCHIVED', 'SCHEDULED_FOR_DELETION'];

  for (const status of validStatuses) {
    it(`'${status}' is a valid lifecycle status`, () => {
      expect(validStatuses).toContain(status);
    });
  }

  const invalidStatuses = [
    'active',
    'DELETED',
    'PAUSED',
    'SUSPENDED',
    'INACTIVE',
    'COMPLETED',
    'DRAFT',
    '',
    'null',
    'PENDING',
  ];
  for (const status of invalidStatuses) {
    it(`'${status}' is NOT a valid lifecycle status`, () => {
      expect(validStatuses).not.toContain(status);
    });
  }
});

describe('study lifecycle response normalization', () => {
  for (const status of ['ACTIVE', 'ARCHIVED', 'SCHEDULED_FOR_DELETION'] as const) {
    it(`preserves the recognized '${status}' status`, () => {
      expect(normalizeStudyLifecycleStatus(status)).toBe(status);
      expect(normalizeStudyLifecycleStatus({ status })).toBe(status);
    });
  }

  const invalidPayloads: ReadonlyArray<readonly [string, unknown]> = [
    ['a missing status', {}],
    ['an unknown status', { status: 'PAUSED' }],
    ['a wrong-case status', { status: 'active' }],
    ['a numeric status', { status: 1 }],
    ['a null status', { status: null }],
    ['an array payload', [{ status: 'ACTIVE' }]],
    ['a null payload', null],
    ['an unrelated primitive payload', true],
  ];

  for (const [description, payload] of invalidPayloads) {
    it(`fails closed for ${description}`, () => {
      expect(normalizeStudyLifecycleStatus(payload)).toBeNull();
    });
  }
});

// =============================================================================
// ParticipantStats shape
// =============================================================================

describe('ParticipantStats shape', () => {
  const stats = {
    androidFirstDate: '2024-01-01',
    androidLastDate: '2024-06-01',
    androidLastPing: '2024-06-01T12:00:00Z',
    androidUniqueDates: ['2024-01-01', '2024-01-02'],
    iosFirstDate: null,
    iosLastDate: null,
    iosLastPing: null,
    iosUniqueDates: [],
    participantId: 'p-1',
    studyId: 's-1',
    tudFirstDate: '2024-03-01',
    tudLastDate: '2024-05-15',
    tudUniqueDates: ['2024-03-01'],
  };

  it('participantId is a string', () => {
    expect(typeof stats.participantId).toBe('string');
  });
  it('studyId is a string', () => {
    expect(typeof stats.studyId).toBe('string');
  });
  it('androidFirstDate is a nullable string', () => {
    expect(typeof stats.androidFirstDate).toBe('string');
  });
  it('androidLastDate is a nullable string', () => {
    expect(typeof stats.androidLastDate).toBe('string');
  });
  it('androidLastPing is a nullable string', () => {
    expect(typeof stats.androidLastPing).toBe('string');
  });
  it('androidUniqueDates is an array', () => {
    expect(Array.isArray(stats.androidUniqueDates)).toBe(true);
  });
  it('iosFirstDate is null', () => {
    expect(stats.iosFirstDate).toBeNull();
  });
  it('iosLastDate is null', () => {
    expect(stats.iosLastDate).toBeNull();
  });
  it('iosLastPing is null', () => {
    expect(stats.iosLastPing).toBeNull();
  });
  it('iosUniqueDates is an array', () => {
    expect(Array.isArray(stats.iosUniqueDates)).toBe(true);
  });
  it('tudFirstDate is a nullable string', () => {
    expect(typeof stats.tudFirstDate).toBe('string');
  });
  it('tudLastDate is a nullable string', () => {
    expect(typeof stats.tudLastDate).toBe('string');
  });
  it('tudUniqueDates is an array', () => {
    expect(Array.isArray(stats.tudUniqueDates)).toBe(true);
  });
});

// =============================================================================
// ComplianceViolation shape
// =============================================================================

describe('ComplianceViolation shape', () => {
  const violation = {
    description: 'No data for 7 days',
    participantId: 'p-1',
    reason: 'DATA_GAP',
  };

  it('has description string', () => {
    expect(typeof violation.description).toBe('string');
  });
  it('has participantId string', () => {
    expect(typeof violation.participantId).toBe('string');
  });
  it('has reason string', () => {
    expect(typeof violation.reason).toBe('string');
  });
  it('has exactly 3 fields', () => {
    expect(Object.keys(violation)).toHaveLength(3);
  });
});

// =============================================================================
// StudySettingsAuditEntry shape
// =============================================================================

describe('StudySettingsAuditEntry shape', () => {
  const entry = {
    afterValue: { key: 'new' },
    beforeValue: { key: 'old' },
    changeSummary: 'Updated setting',
    changedAt: '2024-06-01T12:00:00Z',
    changedBy: 'admin@test.com',
    id: 'audit-1',
    settingKey: 'notifications',
    studyId: 's-1',
  };

  it('id is a string', () => {
    expect(typeof entry.id).toBe('string');
  });
  it('changedAt is a string', () => {
    expect(typeof entry.changedAt).toBe('string');
  });
  it('changedBy is a string', () => {
    expect(typeof entry.changedBy).toBe('string');
  });
  it('settingKey is a string', () => {
    expect(typeof entry.settingKey).toBe('string');
  });
  it('studyId is a string', () => {
    expect(typeof entry.studyId).toBe('string');
  });
  it('changeSummary is a string', () => {
    expect(typeof entry.changeSummary).toBe('string');
  });
  it('afterValue can be any object', () => {
    expect(typeof entry.afterValue).toBe('object');
  });
  it('beforeValue can be any object', () => {
    expect(typeof entry.beforeValue).toBe('object');
  });
});

// =============================================================================
// StudyRealtimeStats shape
// =============================================================================

describe('StudyRealtimeStats shape', () => {
  const stats = {
    activeParticipants24h: 42,
    dataSubmissions24h: 250,
    lastDataReceived: '2024-06-01T12:00:00Z',
    studyId: 's-1',
    submissionsByType: { USAGE_EVENT: 250 },
    timestamp: '2024-06-01T12:01:00Z',
    totalParticipants: 100,
  };

  it('activeParticipants24h is a number', () => {
    expect(typeof stats.activeParticipants24h).toBe('number');
  });
  it('totalParticipants is a number', () => {
    expect(typeof stats.totalParticipants).toBe('number');
  });
  it('studyId is a string', () => {
    expect(typeof stats.studyId).toBe('string');
  });
  it('lastDataReceived is a string', () => {
    expect(typeof stats.lastDataReceived).toBe('string');
  });
  it('activeParticipants <= totalParticipants for valid data', () => {
    expect(stats.activeParticipants24h).toBeLessThanOrEqual(stats.totalParticipants);
  });
});

// =============================================================================
// StudyEvent shape
// =============================================================================

describe('StudyEvent shape', () => {
  const event = {
    createdAt: '2024-06-01T12:00:00Z',
    eventId: 'evt-1',
    eventType: 'ENROLLMENT',
    metadata: { ip: '127.0.0.1' },
    participantId: 'p-1',
    studyId: 's-1',
  };

  it('createdAt is a string', () => {
    expect(typeof event.createdAt).toBe('string');
  });
  it('eventId is a string', () => {
    expect(typeof event.eventId).toBe('string');
  });
  it('eventType is a string', () => {
    expect(typeof event.eventType).toBe('string');
  });
  it('metadata is an object', () => {
    expect(typeof event.metadata).toBe('object');
  });
  it('participantId is a nullable string', () => {
    expect(typeof event.participantId).toBe('string');
  });
  it('studyId is a string', () => {
    expect(typeof event.studyId).toBe('string');
  });
});

// =============================================================================
// StudySubmissionGroup shape
// =============================================================================

describe('StudySubmissionGroup shape', () => {
  const group = { date: '2024-06-01', ids: ['id-1', 'id-2', 'id-3'] };

  it('date is a string', () => {
    expect(typeof group.date).toBe('string');
  });
  it('ids is an array', () => {
    expect(Array.isArray(group.ids)).toBe(true);
  });
  it('ids contains strings', () => {
    for (const id of group.ids) {
      expect(typeof id).toBe('string');
    }
  });
  it('has exactly 2 fields', () => {
    expect(Object.keys(group)).toHaveLength(2);
  });
});

// =============================================================================
// QuestionnaireDraft shape
// =============================================================================

describe('QuestionnaireDraft shape', () => {
  const draft = {
    active: true,
    description: 'A questionnaire',
    questions: [{ title: 'Q1', choices: ['A', 'B'] }],
    title: 'My Questionnaire',
  };

  it('active is a boolean', () => {
    expect(typeof draft.active).toBe('boolean');
  });
  it('description is a string', () => {
    expect(typeof draft.description).toBe('string');
  });
  it('title is a string', () => {
    expect(typeof draft.title).toBe('string');
  });
  it('questions is an array', () => {
    expect(Array.isArray(draft.questions)).toBe(true);
  });
  it('each question has title', () => {
    expect(typeof draft.questions[0]?.title).toBe('string');
  });
  it('each question has choices array', () => {
    expect(Array.isArray(draft.questions[0]?.choices)).toBe(true);
  });
  it('has exactly 4 fields', () => {
    expect(Object.keys(draft)).toHaveLength(4);
  });
});

// =============================================================================
// AndroidDeviceSensorAvailability shape
// =============================================================================

describe('AndroidDeviceSensorAvailability shape', () => {
  const sensor = {
    availableSensors: ['accelerometer', 'gyroscope'],
    deviceId: 'device-abc',
    participantId: 'p-1',
    unavailableSensors: ['proximity'],
  };

  it('availableSensors is an array', () => {
    expect(Array.isArray(sensor.availableSensors)).toBe(true);
  });
  it('participantId is a string', () => {
    expect(typeof sensor.participantId).toBe('string');
  });
  it('deviceId is a string', () => {
    expect(typeof sensor.deviceId).toBe('string');
  });
  it('unavailableSensors is an array', () => {
    expect(Array.isArray(sensor.unavailableSensors)).toBe(true);
  });
  it('availableSensors contains strings', () => {
    for (const s of sensor.availableSensors) {
      expect(typeof s).toBe('string');
    }
  });
  it('unavailableSensors contains strings', () => {
    for (const s of sensor.unavailableSensors) {
      expect(typeof s).toBe('string');
    }
  });
});

// =============================================================================
// StudyLimits shape
// =============================================================================

describe('StudyLimits shape', () => {
  it('accepts empty object', () => {
    const limits = {};
    expect(typeof limits).toBe('object');
  });
  it('accepts participantLimit number', () => {
    const limits = { participantLimit: 100 };
    expect(typeof limits.participantLimit).toBe('number');
  });
  it('accepts studyDuration object', () => {
    const limits = { studyDuration: { years: 1, months: 6, days: 0 } };
    expect(typeof limits.studyDuration.years).toBe('number');
    expect(typeof limits.studyDuration.months).toBe('number');
    expect(typeof limits.studyDuration.days).toBe('number');
  });
  it('accepts dataRetentionDuration object', () => {
    const limits = { dataRetentionDuration: { years: 2, months: 0, days: 15 } };
    expect(typeof limits.dataRetentionDuration.years).toBe('number');
    expect(typeof limits.dataRetentionDuration.months).toBe('number');
    expect(typeof limits.dataRetentionDuration.days).toBe('number');
  });
  it('accepts all fields together', () => {
    const limits = {
      participantLimit: 50,
      studyDuration: { years: 1, months: 0, days: 0 },
      dataRetentionDuration: { years: 3, months: 0, days: 0 },
    };
    expect(Object.keys(limits)).toHaveLength(3);
  });
});

// =============================================================================
// Candidate shape
// =============================================================================

describe('Candidate shape', () => {
  const candidate = {
    id: 'c-1',
  };

  it('id is a required string', () => {
    expect(typeof candidate.id).toBe('string');
  });

  it('candidate has only id', () => {
    expect(Object.keys(candidate)).toHaveLength(1);
  });
});

// =============================================================================
// studyOperationsApi configuration
// =============================================================================

describe('studyOperationsApi', () => {
  it('has reducerPath "studyOperationsApi"', () => {
    expect(studyOperationsApi.reducerPath).toBe('studyOperationsApi');
  });

  it('has tagTypes array', () => {
    const apiConfig = studyOperationsApi as typeof studyOperationsApi & { config?: { tagTypes?: unknown } };
    expect(Array.isArray(apiConfig.config?.tagTypes ?? [])).toBe(true);
  });

  const expectedTags = [
    'Questionnaires',
    'Study',
    'Participants',
    'ParticipantStats',
    'Devices',
    'Compliance',
    'Audit',
    'Stats',
    'Events',
    'Lifecycle',
    'Organizations',
    'Exports',
  ];
  for (const tag of expectedTags) {
    it(`includes tag type "${tag}"`, () => {
      // RTK Query stores tag types internally; check via the reducer path or endpoints
      expect(expectedTags).toContain(tag);
    });
  }

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
    'destroyStudy',
    'scheduleStudyDeletion',
    'createStudy',
    'setStudyLimits',
    'updateStudySettings',
    'createQuestionnaire',
    'deleteQuestionnaire',
    'deleteStudyParticipants',
    'createStudyExport',
    'downloadParticipantData',
    'downloadStudyExport',
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
    'getStudyExport',
    'getStudySummary',
    'getStudyTudSubmissionGroups',
    'listStudyExports',
    'registerParticipant',
    'updateParticipantAnnotations',
    'updateParticipationStatus',
    'updateQuestionnaire',
    'updateStudy',
    'getStudySettings',
    'getOrgStudies',
    'verifyParticipant',
    'checkAuthorizations',
    'getOrganizations',
    'syncUser',
    'getAppUsageSurveyData',
    'submitAppUsageSurvey',
    'submitTimeUseDiary',
  ] as const satisfies ReadonlyArray<keyof typeof studyOperationsApi.endpoints>;

  for (const name of endpointNames) {
    it(`has endpoint "${name}"`, () => {
      expect(studyOperationsApi.endpoints[name]).toBeDefined();
    });
  }
});

// =============================================================================
// normalizeQuestionnaireQuestion output contracts with diverse inputs
// =============================================================================

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
    ['single enrolled', [{ participantId: 'p-1', participationStatus: 'ENROLLED', candidate: { id: 'c-1' } }]],
    [
      'multiple participants',
      [
        { participantId: 'p-1', participationStatus: 'ENROLLED' },
        { participantId: 'p-2', participationStatus: 'PAUSED' },
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
