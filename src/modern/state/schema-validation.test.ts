import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas mirroring TypeScript types in study-operations-api.ts
// ---------------------------------------------------------------------------

const CandidateSchema = z.object({
  dateOfBirth: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  id: z.string(),
  lastName: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  phoneNumber: z.string().nullable().optional(),
});

const ParticipationStatusSchema = z.enum(['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN']);

const ParticipantSchema = z.object({
  candidate: CandidateSchema.passthrough(),
  participantId: z.string(),
  participantNotes: z.string().nullable().optional(),
  participantTags: z.array(z.string()),
  participationStatus: ParticipationStatusSchema,
});

const QuestionnaireQuestionSchema = z.object({
  choices: z.array(z.string()),
  title: z.string(),
});

const QuestionnaireDraftSchema = z.object({
  active: z.boolean(),
  description: z.string(),
  questions: z.array(QuestionnaireQuestionSchema),
  title: z.string(),
});

const QuestionnaireRecordSchema = z.object({
  active: z.boolean(),
  dateCreated: z.string().optional(),
  description: z.string(),
  id: z.string(),
  questions: z.array(QuestionnaireQuestionSchema),
  recurrenceRule: z.string().nullable().optional(),
  title: z.string(),
});

const StudySummarySchema = z.object({
  contact: z.string().optional(),
  createdAt: z.string().optional(),
  description: z.string().optional(),
  endedAt: z.string().optional(),
  group: z.string().optional(),
  id: z.string().optional(),
  modules: z.record(z.string(), z.unknown()).optional(),
  notificationsEnabled: z.boolean().optional(),
  phoneNumber: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  startedAt: z.string().optional(),
  title: z.string().optional(),
  updatedAt: z.string().optional(),
  version: z.string().optional(),
});

const StudyUpdatePayloadSchema = z.object({
  contact: z.string().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  modules: z.record(z.string(), z.unknown()).optional(),
  notificationsEnabled: z.boolean().optional(),
  title: z.string().optional(),
  version: z.string().optional(),
});

const StudySubmissionGroupSchema = z.object({
  date: z.string(),
  ids: z.array(z.string()),
});

const ParticipantStatsSchema = z.object({
  androidFirstDate: z.string().nullable().optional(),
  androidLastDate: z.string().nullable().optional(),
  androidLastPing: z.string().nullable().optional(),
  androidUniqueDates: z.array(z.string()),
  iosFirstDate: z.string().nullable().optional(),
  iosLastDate: z.string().nullable().optional(),
  iosLastPing: z.string().nullable().optional(),
  iosUniqueDates: z.array(z.string()),
  participantId: z.string(),
  studyId: z.string(),
  tudFirstDate: z.string().nullable().optional(),
  tudLastDate: z.string().nullable().optional(),
  tudUniqueDates: z.array(z.string()),
});

const DeviceEnrollmentEventSchema = z.object({
  enrolledAt: z.string().nullable().optional(),
  enrollmentId: z.string().nullable().optional(),
});

const StudyDeviceInstanceSchema = z
  .object({
    deviceId: z.string().optional(),
    deviceType: z.string().optional(),
    enrollments: z.array(DeviceEnrollmentEventSchema).optional(),
    sourceDevice: z.unknown().optional(),
    sourceDeviceId: z.string().nullable().optional(),
  })
  .passthrough();

const ComplianceViolationSchema = z.object({
  description: z.string(),
  participantId: z.string(),
  reason: z.string(),
});

const StudySettingsAuditEntrySchema = z.object({
  afterValue: z.any().optional(),
  beforeValue: z.any().optional(),
  changeSummary: z.string().optional(),
  changedAt: z.string(),
  changedBy: z.string(),
  id: z.string(),
  settingKey: z.string(),
  studyId: z.string(),
});

const StudyRealtimeStatsSchema = z.object({
  activeParticipants24h: z.number(),
  dataSubmissions24h: z.number(),
  lastDataReceived: z.string().nullable(),
  studyId: z.string(),
  submissionsByType: z.record(z.string(), z.number()),
  timestamp: z.string(),
  totalParticipants: z.number(),
});

const StudyEventSchema = z.object({
  createdAt: z.string(),
  eventId: z.string(),
  eventType: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  participantId: z.string().nullable().optional(),
  studyId: z.string(),
});

const StudyLifecycleStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'SCHEDULED_FOR_DELETION']);

const AndroidDeviceSensorAvailabilitySchema = z.object({
  availableSensors: z.array(z.string()),
  deviceId: z.string(),
  displayRotation: z.number().nullable().optional(),
  interactionPointerCaptureCapability: z
    .enum(['PLATFORM_API_UNAVAILABLE', 'REQUIRES_INPUT_INTERCEPTION'])
    .nullable()
    .optional(),
  participantId: z.string(),
  reportedAt: z.string().nullable().optional(),
  screenDensityDpi: z.number().nullable().optional(),
  screenHeightPixels: z.number().nullable().optional(),
  screenWidthPixels: z.number().nullable().optional(),
  unavailableSensors: z.array(z.string()),
});

const StudyDurationSchema = z.object({
  days: z.number(),
  months: z.number(),
  years: z.number(),
});

const StudyLimitsSchema = z.object({
  dataRetentionDuration: StudyDurationSchema.optional(),
  participantLimit: z.number().optional(),
  studyDuration: StudyDurationSchema.optional(),
});

// Map schemas — used for endpoints returning Record<string, T>
const ParticipantStatsMapSchema = z.record(z.string(), ParticipantStatsSchema);
const StudyDeviceInstancesMapSchema = z.record(z.string(), z.array(StudyDeviceInstanceSchema));
const ComplianceViolationsMapSchema = z.record(z.string(), z.array(ComplianceViolationSchema));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Zod schema validation — API response contracts', () => {
  // ---- CandidateSchema ----
  describe('CandidateSchema', () => {
    it('accepts minimal candidate (id only)', () => {
      expect(CandidateSchema.parse({ id: 'c-1' })).toBeTruthy();
    });

    it('accepts full candidate with all fields', () => {
      expect(
        CandidateSchema.parse({
          id: 'c-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'j@test.com',
          phoneNumber: '555-1234',
          dateOfBirth: '1990-01-01',
          name: 'John Doe',
        }),
      ).toBeTruthy();
    });

    it('accepts null optional fields', () => {
      expect(
        CandidateSchema.parse({
          id: 'c-1',
          firstName: null,
          lastName: null,
          email: null,
          phoneNumber: null,
          dateOfBirth: null,
          name: null,
        }),
      ).toBeTruthy();
    });

    it('rejects missing id', () => {
      expect(() => CandidateSchema.parse({})).toThrow();
    });

    it('rejects non-string id', () => {
      expect(() => CandidateSchema.parse({ id: 123 })).toThrow();
    });
  });

  // ---- ParticipantSchema ----
  describe('ParticipantSchema', () => {
    it('accepts valid participant with enrolled status', () => {
      expect(
        ParticipantSchema.parse({
          candidate: { id: 'c-1' },
          participantId: 'p-1',
          participantTags: ['tag1'],
          participationStatus: 'ENROLLED',
        }),
      ).toBeTruthy();
    });

    it('accepts all five status values', () => {
      for (const status of ['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN']) {
        expect(
          ParticipantSchema.parse({
            candidate: { id: 'c-1' },
            participantId: 'p-1',
            participantTags: [],
            participationStatus: status,
          }),
        ).toBeTruthy();
      }
    });

    it('accepts null participantNotes', () => {
      expect(
        ParticipantSchema.parse({
          candidate: { id: 'c-1' },
          participantId: 'p-1',
          participantNotes: null,
          participantTags: [],
          participationStatus: 'ENROLLED',
        }),
      ).toBeTruthy();
    });

    it('rejects invalid status value', () => {
      expect(() =>
        ParticipantSchema.parse({
          candidate: { id: 'c-1' },
          participantId: 'p-1',
          participantTags: [],
          participationStatus: 'INVALID',
        }),
      ).toThrow();
    });

    it('rejects missing participantId', () => {
      expect(() =>
        ParticipantSchema.parse({
          candidate: { id: 'c-1' },
          participantTags: [],
          participationStatus: 'ENROLLED',
        }),
      ).toThrow();
    });

    it('rejects non-array participantTags', () => {
      expect(() =>
        ParticipantSchema.parse({
          candidate: { id: 'c-1' },
          participantId: 'p-1',
          participantTags: 'tag1',
          participationStatus: 'ENROLLED',
        }),
      ).toThrow();
    });
  });

  // ---- QuestionnaireQuestionSchema ----
  describe('QuestionnaireQuestionSchema', () => {
    it('accepts valid question with choices', () => {
      expect(QuestionnaireQuestionSchema.parse({ title: 'Q1', choices: ['A', 'B'] })).toBeTruthy();
    });

    it('accepts empty choices array', () => {
      expect(QuestionnaireQuestionSchema.parse({ title: 'Q1', choices: [] })).toBeTruthy();
    });

    it('rejects missing title', () => {
      expect(() => QuestionnaireQuestionSchema.parse({ choices: [] })).toThrow();
    });

    it('rejects non-string choices', () => {
      expect(() => QuestionnaireQuestionSchema.parse({ title: 'Q1', choices: [1, 2] })).toThrow();
    });
  });

  // ---- QuestionnaireDraftSchema ----
  describe('QuestionnaireDraftSchema', () => {
    it('accepts valid draft', () => {
      expect(
        QuestionnaireDraftSchema.parse({
          active: true,
          description: 'A survey',
          title: 'Daily Check',
          questions: [{ title: 'Q1', choices: ['Yes', 'No'] }],
        }),
      ).toBeTruthy();
    });

    it('accepts draft with empty questions', () => {
      expect(
        QuestionnaireDraftSchema.parse({
          active: false,
          description: '',
          title: '',
          questions: [],
        }),
      ).toBeTruthy();
    });

    it('rejects missing active field', () => {
      expect(() =>
        QuestionnaireDraftSchema.parse({
          description: '',
          title: '',
          questions: [],
        }),
      ).toThrow();
    });
  });

  // ---- QuestionnaireRecordSchema ----
  describe('QuestionnaireRecordSchema', () => {
    it('accepts full record', () => {
      expect(
        QuestionnaireRecordSchema.parse({
          id: 'q-1',
          title: 'Survey',
          description: 'Desc',
          active: true,
          questions: [{ title: 'Q1', choices: ['A'] }],
          dateCreated: '2024-01-01',
          recurrenceRule: 'FREQ=DAILY',
        }),
      ).toBeTruthy();
    });

    it('accepts minimal record (no dateCreated or recurrenceRule)', () => {
      expect(
        QuestionnaireRecordSchema.parse({
          id: 'q-1',
          title: '',
          description: '',
          active: false,
          questions: [],
        }),
      ).toBeTruthy();
    });

    it('accepts null recurrenceRule', () => {
      expect(
        QuestionnaireRecordSchema.parse({
          id: 'q-1',
          title: '',
          description: '',
          active: false,
          questions: [],
          recurrenceRule: null,
        }),
      ).toBeTruthy();
    });

    it('rejects missing id', () => {
      expect(() =>
        QuestionnaireRecordSchema.parse({
          title: '',
          description: '',
          active: false,
          questions: [],
        }),
      ).toThrow();
    });

    it('rejects non-boolean active', () => {
      expect(() =>
        QuestionnaireRecordSchema.parse({
          id: 'q-1',
          title: '',
          description: '',
          active: 'true',
          questions: [],
        }),
      ).toThrow();
    });
  });

  // ---- StudySummarySchema ----
  describe('StudySummarySchema', () => {
    it('accepts empty object (all fields optional)', () => {
      expect(StudySummarySchema.parse({})).toBeTruthy();
    });

    it('accepts full study summary', () => {
      expect(
        StudySummarySchema.parse({
          id: 's-1',
          title: 'Study',
          contact: 'admin@test.com',
          description: 'Desc',
          group: 'neuro',
          version: '1.0',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
          startedAt: '2024-01-01',
          endedAt: '2025-01-01',
          modules: { ANDROID_SENSOR: {} },
          notificationsEnabled: true,
          phoneNumber: '555-1234',
          settings: {},
        }),
      ).toBeTruthy();
    });

    it('rejects non-string title', () => {
      expect(() => StudySummarySchema.parse({ title: 42 })).toThrow();
    });

    it('rejects non-boolean notificationsEnabled', () => {
      expect(() => StudySummarySchema.parse({ notificationsEnabled: 'yes' })).toThrow();
    });
  });

  // ---- StudyUpdatePayloadSchema ----
  describe('StudyUpdatePayloadSchema', () => {
    it('accepts empty object', () => {
      expect(StudyUpdatePayloadSchema.parse({})).toBeTruthy();
    });

    it('accepts partial update', () => {
      expect(
        StudyUpdatePayloadSchema.parse({
          title: 'New Title',
          description: 'Updated',
        }),
      ).toBeTruthy();
    });

    it('rejects non-string contact', () => {
      expect(() => StudyUpdatePayloadSchema.parse({ contact: 123 })).toThrow();
    });
  });

  // ---- StudySubmissionGroupSchema ----
  describe('StudySubmissionGroupSchema', () => {
    it('accepts valid group', () => {
      expect(
        StudySubmissionGroupSchema.parse({
          date: '2024-01-15',
          ids: ['p1', 'p2'],
        }),
      ).toBeTruthy();
    });

    it('accepts empty ids array', () => {
      expect(StudySubmissionGroupSchema.parse({ date: '2024-01-15', ids: [] })).toBeTruthy();
    });

    it('rejects missing date', () => {
      expect(() => StudySubmissionGroupSchema.parse({ ids: [] })).toThrow();
    });

    it('rejects missing ids', () => {
      expect(() => StudySubmissionGroupSchema.parse({ date: '2024-01-15' })).toThrow();
    });
  });

  // ---- ParticipantStatsSchema ----
  describe('ParticipantStatsSchema', () => {
    it('accepts valid stats with dates', () => {
      expect(
        ParticipantStatsSchema.parse({
          participantId: 'p-1',
          studyId: 's-1',
          androidUniqueDates: ['2024-01-01'],
          iosUniqueDates: [],
          tudUniqueDates: ['2024-01-02'],
          androidFirstDate: '2024-01-01',
          androidLastDate: '2024-01-01',
          androidLastPing: '2024-01-01T12:00:00Z',
        }),
      ).toBeTruthy();
    });

    it('accepts null date fields', () => {
      expect(
        ParticipantStatsSchema.parse({
          participantId: 'p-1',
          studyId: 's-1',
          androidUniqueDates: [],
          iosUniqueDates: [],
          tudUniqueDates: [],
          androidFirstDate: null,
          iosFirstDate: null,
          tudFirstDate: null,
        }),
      ).toBeTruthy();
    });

    it('rejects missing required arrays', () => {
      expect(() =>
        ParticipantStatsSchema.parse({
          participantId: 'p-1',
          studyId: 's-1',
        }),
      ).toThrow();
    });

    it('rejects missing participantId', () => {
      expect(() =>
        ParticipantStatsSchema.parse({
          studyId: 's-1',
          androidUniqueDates: [],
          iosUniqueDates: [],
          tudUniqueDates: [],
        }),
      ).toThrow();
    });
  });

  // ---- ComplianceViolationSchema ----
  describe('ComplianceViolationSchema', () => {
    it('accepts valid violation', () => {
      expect(
        ComplianceViolationSchema.parse({
          description: 'Missing data',
          participantId: 'p-1',
          reason: 'NO_DATA',
        }),
      ).toBeTruthy();
    });

    it('rejects missing fields', () => {
      expect(() => ComplianceViolationSchema.parse({ description: 'test' })).toThrow();
    });

    it('rejects non-string reason', () => {
      expect(() =>
        ComplianceViolationSchema.parse({
          description: 'test',
          participantId: 'p-1',
          reason: 42,
        }),
      ).toThrow();
    });
  });

  // ---- StudySettingsAuditEntrySchema ----
  describe('StudySettingsAuditEntrySchema', () => {
    it('accepts minimal entry', () => {
      expect(
        StudySettingsAuditEntrySchema.parse({
          id: 'a-1',
          studyId: 's-1',
          settingKey: 'notifications',
          changedAt: '2024-01-15T10:00:00Z',
          changedBy: 'admin',
        }),
      ).toBeTruthy();
    });

    it('accepts entry with before/after values', () => {
      expect(
        StudySettingsAuditEntrySchema.parse({
          id: 'a-1',
          studyId: 's-1',
          settingKey: 'notifications',
          changedAt: '2024-01-15',
          changedBy: 'admin',
          beforeValue: { enabled: false },
          afterValue: { enabled: true },
          changeSummary: 'Enabled notifications',
        }),
      ).toBeTruthy();
    });

    it('rejects missing changedAt', () => {
      expect(() =>
        StudySettingsAuditEntrySchema.parse({
          id: 'a-1',
          studyId: 's-1',
          settingKey: 'k',
          changedBy: 'admin',
        }),
      ).toThrow();
    });

    it('rejects missing studyId', () => {
      expect(() =>
        StudySettingsAuditEntrySchema.parse({
          id: 'a-1',
          settingKey: 'k',
          changedAt: '2024-01-01',
          changedBy: 'admin',
        }),
      ).toThrow();
    });
  });

  // ---- StudyRealtimeStatsSchema ----
  describe('StudyRealtimeStatsSchema', () => {
    it('accepts valid realtime stats', () => {
      expect(
        StudyRealtimeStatsSchema.parse({
          activeParticipants24h: 5,
          dataSubmissions24h: 14,
          lastDataReceived: null,
          studyId: 's-1',
          submissionsByType: {},
          timestamp: '2024-01-15T10:00:00Z',
          totalParticipants: 20,
        }),
      ).toBeTruthy();
    });

    it('accepts with lastDataReceived', () => {
      expect(
        StudyRealtimeStatsSchema.parse({
          activeParticipants24h: 0,
          dataSubmissions24h: 0,
          studyId: 's-1',
          submissionsByType: {},
          timestamp: '2024-01-15T10:00:00Z',
          totalParticipants: 0,
          lastDataReceived: '2024-01-15T10:00:00Z',
        }),
      ).toBeTruthy();
    });

    it('rejects non-number activeParticipants24h', () => {
      expect(() =>
        StudyRealtimeStatsSchema.parse({
          activeParticipants24h: '5',
          dataSubmissions24h: 0,
          lastDataReceived: null,
          studyId: 's-1',
          submissionsByType: {},
          timestamp: '2024-01-15T10:00:00Z',
          totalParticipants: 20,
        }),
      ).toThrow();
    });
  });

  // ---- StudyEventSchema ----
  describe('StudyEventSchema', () => {
    it('accepts valid event', () => {
      expect(
        StudyEventSchema.parse({
          createdAt: '2024-01-15',
          eventId: 'e-1',
          eventType: 'ENROLLMENT',
          studyId: 's-1',
        }),
      ).toBeTruthy();
    });

    it('accepts event with optional fields', () => {
      expect(
        StudyEventSchema.parse({
          createdAt: '2024-01-15',
          eventId: 'e-1',
          eventType: 'DATA_UPLOAD',
          studyId: 's-1',
          participantId: 'p-1',
          metadata: { count: 42 },
        }),
      ).toBeTruthy();
    });

    it('accepts null participantId', () => {
      expect(
        StudyEventSchema.parse({
          createdAt: '2024-01-15',
          eventId: 'e-1',
          eventType: 'SYSTEM',
          studyId: 's-1',
          participantId: null,
        }),
      ).toBeTruthy();
    });

    it('rejects missing eventType', () => {
      expect(() =>
        StudyEventSchema.parse({
          createdAt: '2024-01-15',
          eventId: 'e-1',
          studyId: 's-1',
        }),
      ).toThrow();
    });
  });

  // ---- StudyLifecycleStatusSchema ----
  describe('StudyLifecycleStatusSchema', () => {
    it('accepts ACTIVE', () => {
      expect(StudyLifecycleStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
    });

    it('accepts ARCHIVED', () => {
      expect(StudyLifecycleStatusSchema.parse('ARCHIVED')).toBe('ARCHIVED');
    });

    it('accepts SCHEDULED_FOR_DELETION', () => {
      expect(StudyLifecycleStatusSchema.parse('SCHEDULED_FOR_DELETION')).toBe('SCHEDULED_FOR_DELETION');
    });

    it('rejects unknown status', () => {
      expect(() => StudyLifecycleStatusSchema.parse('DELETED')).toThrow();
    });
  });

  // ---- AndroidDeviceSensorAvailabilitySchema ----
  describe('AndroidDeviceSensorAvailabilitySchema', () => {
    it('accepts valid availability', () => {
      expect(
        AndroidDeviceSensorAvailabilitySchema.parse({
          availableSensors: ['ACCELEROMETER', 'GYROSCOPE'],
          deviceId: 'dev-1',
          participantId: 'p-1',
          unavailableSensors: ['BAROMETER'],
        }),
      ).toBeTruthy();
    });

    it('accepts empty sensor arrays', () => {
      expect(
        AndroidDeviceSensorAvailabilitySchema.parse({
          availableSensors: [],
          deviceId: 'dev-1',
          participantId: 'p-1',
          unavailableSensors: [],
        }),
      ).toBeTruthy();
    });

    it('rejects missing deviceId', () => {
      expect(() =>
        AndroidDeviceSensorAvailabilitySchema.parse({
          availableSensors: [],
          participantId: 'p-1',
          unavailableSensors: [],
        }),
      ).toThrow();
    });
  });

  // ---- StudyLimitsSchema ----
  describe('StudyLimitsSchema', () => {
    it('accepts empty object (all optional)', () => {
      expect(StudyLimitsSchema.parse({})).toBeTruthy();
    });

    it('accepts full limits', () => {
      expect(
        StudyLimitsSchema.parse({
          participantLimit: 100,
          studyDuration: { years: 1, months: 0, days: 0 },
          dataRetentionDuration: { years: 0, months: 3, days: 0 },
        }),
      ).toBeTruthy();
    });

    it('accepts participantLimit only', () => {
      expect(StudyLimitsSchema.parse({ participantLimit: 50 })).toBeTruthy();
    });

    it('rejects non-number participantLimit', () => {
      expect(() => StudyLimitsSchema.parse({ participantLimit: '100' })).toThrow();
    });

    it('rejects incomplete duration object', () => {
      expect(() =>
        StudyLimitsSchema.parse({
          studyDuration: { years: 1 },
        }),
      ).toThrow();
    });
  });

  // ---- Map schemas ----
  describe('ParticipantStatsMapSchema', () => {
    it('accepts valid map', () => {
      expect(
        ParticipantStatsMapSchema.parse({
          'p-1': {
            participantId: 'p-1',
            studyId: 's-1',
            androidUniqueDates: [],
            iosUniqueDates: [],
            tudUniqueDates: [],
          },
        }),
      ).toBeTruthy();
    });

    it('accepts empty map', () => {
      expect(ParticipantStatsMapSchema.parse({})).toBeTruthy();
    });

    it('rejects invalid inner value', () => {
      expect(() => ParticipantStatsMapSchema.parse({ 'p-1': { bad: true } })).toThrow();
    });
  });

  describe('StudyDeviceInstancesMapSchema', () => {
    it('accepts valid device instance map', () => {
      expect(
        StudyDeviceInstancesMapSchema.parse({
          'p-1': [
            {
              deviceId: 'device-1',
              deviceType: 'ANDROID',
              enrollments: [
                {
                  enrollmentId: 'enrollment-1',
                  enrolledAt: '2026-06-05T12:00:00Z',
                },
              ],
              model: 'Pixel 6',
              os: 'Android 14',
              sourceDevice: { manufacturer: 'Google' },
            },
          ],
        }),
      ).toBeTruthy();
    });

    it('accepts empty map', () => {
      expect(StudyDeviceInstancesMapSchema.parse({})).toBeTruthy();
    });
  });

  describe('ComplianceViolationsMapSchema', () => {
    it('accepts valid violations map', () => {
      expect(
        ComplianceViolationsMapSchema.parse({
          'p-1': [{ description: 'No data', participantId: 'p-1', reason: 'NO_DATA' }],
        }),
      ).toBeTruthy();
    });

    it('accepts empty map', () => {
      expect(ComplianceViolationsMapSchema.parse({})).toBeTruthy();
    });

    it('rejects invalid violation in map', () => {
      expect(() =>
        ComplianceViolationsMapSchema.parse({
          'p-1': [{ description: 'test' }],
        }),
      ).toThrow();
    });
  });

  // ---- Array response schemas (list endpoints) ----
  describe('Array response schemas', () => {
    it('validates Participant[] response', () => {
      const data = [
        {
          candidate: { id: 'c-1', firstName: 'Jane' },
          participantId: 'p-1',
          participantTags: ['group-a'],
          participationStatus: 'ENROLLED' as const,
        },
        {
          candidate: { id: 'c-2' },
          participantId: 'p-2',
          participantTags: [],
          participationStatus: 'PAUSED' as const,
        },
      ];
      expect(z.array(ParticipantSchema).parse(data)).toHaveLength(2);
    });

    it('validates QuestionnaireRecord[] response', () => {
      const data = [
        { id: 'q-1', title: 'Survey 1', description: '', active: true, questions: [] },
        {
          id: 'q-2',
          title: 'Survey 2',
          description: 'Daily',
          active: false,
          questions: [{ title: 'Q1', choices: ['A'] }],
        },
      ];
      expect(z.array(QuestionnaireRecordSchema).parse(data)).toHaveLength(2);
    });

    it('validates StudySummary[] response', () => {
      const data = [
        { id: 's-1', title: 'Study A' },
        { id: 's-2', title: 'Study B', notificationsEnabled: false },
      ];
      expect(z.array(StudySummarySchema).parse(data)).toHaveLength(2);
    });

    it('validates StudySettingsAuditEntry[] response', () => {
      const data = [{ id: 'a-1', studyId: 's-1', settingKey: 'k', changedAt: '2024-01-01', changedBy: 'admin' }];
      expect(z.array(StudySettingsAuditEntrySchema).parse(data)).toHaveLength(1);
    });

    it('validates AndroidDeviceSensorAvailability[] response', () => {
      const data = [{ availableSensors: ['ACC'], deviceId: 'd-1', participantId: 'p-1', unavailableSensors: [] }];
      expect(z.array(AndroidDeviceSensorAvailabilitySchema).parse(data)).toHaveLength(1);
    });
  });
});
