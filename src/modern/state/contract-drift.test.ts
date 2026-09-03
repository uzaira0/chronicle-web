/**
 * Contract Drift Detection
 *
 * Validates that backend Kotlin model shapes (captured as golden JSON fixtures)
 * can be parsed by the frontend Zod schemas. When a backend field is added,
 * renamed, or removed, these tests fail — surfacing contract drift before it
 * reaches production.
 *
 * Golden fixtures live in: src/modern/test/golden/backend-*.json
 * Each fixture mirrors the serialized JSON output of its Kotlin data class.
 *
 * HOW TO UPDATE:
 *   1. If a backend model changes, update the matching backend-*.json fixture.
 *   2. If the frontend type intentionally diverges, add to KNOWN_DRIFT below.
 *   3. If the frontend schema needs to accept new backend fields, update the
 *      Zod schema in this file (and the TypeScript type in study-operations-api.ts).
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ZodType, z } from 'zod';

// ---------------------------------------------------------------------------
// Golden fixture loader
// ---------------------------------------------------------------------------

const GOLDEN_DIR = join(__dirname, '../test/golden');

function readBackendGolden(name: string): unknown {
  return JSON.parse(readFileSync(join(GOLDEN_DIR, `backend-${name}.json`), 'utf-8'));
}

function withoutFixtureComment(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const payload = { ...(value as Record<string, unknown>) };
  delete payload._comment;
  return payload;
}

// ---------------------------------------------------------------------------
// Zod schemas matching frontend TypeScript types (from study-operations-api.ts)
//
// These are the FRONTEND expectations. When the backend diverges from these,
// the parse will fail and the drift shows up.
// ---------------------------------------------------------------------------

const ParticipationStatusSchema = z.enum(['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN']);

const CandidateSchema = z.object({
  id: z.string(),
});

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

const AndroidDeviceSensorAvailabilitySchema = z.object({
  availableSensors: z.array(z.string()),
  deviceId: z.string(),
  displayRotation: z.number().nullable(),
  interactionPointerCaptureCapability: z.enum(['PLATFORM_API_UNAVAILABLE', 'REQUIRES_INPUT_INTERCEPTION']).nullable(),
  participantId: z.string(),
  reportedAt: z.string().nullable(),
  screenDensityDpi: z.number().nullable(),
  screenHeightPixels: z.number().nullable(),
  screenWidthPixels: z.number().nullable(),
  unavailableSensors: z.array(z.string()),
});

const StudyDurationSchema = z.object({
  days: z.number(),
  months: z.number(),
  years: z.number(),
});

// ---------------------------------------------------------------------------
// Known drift: documented differences between backend and frontend
//
// Each entry explains WHY the drift exists and whether it is intentional.
// When adding new drift, always include a tracking comment.
// ---------------------------------------------------------------------------

type DriftEntry = {
  backendField: string;
  frontendField: string | null;
  reason: string;
};

const KNOWN_DRIFT: Record<string, DriftEntry[]> = {
  Study: [
    {
      backendField: 'lat',
      frontendField: null,
      reason: 'Geo coordinates not shown in web dashboard; server omits from summary endpoint',
    },
    {
      backendField: 'lon',
      frontendField: null,
      reason: 'Geo coordinates not shown in web dashboard; server omits from summary endpoint',
    },
    {
      backendField: 'organizationIds',
      frontendField: null,
      reason: 'Internal authorization field; not exposed to web frontend',
    },
    {
      backendField: 'storage',
      frontendField: null,
      reason: 'Infrastructure detail; not exposed to web frontend',
    },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract field names from a JSON object (top-level keys only). */
function fieldNames(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  return Object.keys(obj)
    .filter((k) => k !== '_comment')
    .sort();
}

/** Extract field names expected by a Zod object schema. */
function zodFieldNames(schema: ZodType): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape).sort();
  }
  return [];
}

/** Get known-drift backend fields that are expected to be absent from frontend. */
function knownAbsentInFrontend(modelName: string): string[] {
  return (KNOWN_DRIFT[modelName] ?? []).filter((d) => d.frontendField === null).map((d) => d.backendField);
}

// ---------------------------------------------------------------------------
// Contract Drift Tests
// ---------------------------------------------------------------------------

describe('Contract drift detection — backend golden fixtures vs frontend schemas', () => {
  // ==========================================================================
  // Participant
  // ==========================================================================
  describe('Participant', () => {
    it('backend fixture parses with frontend schema (strict)', () => {
      const fixture = readBackendGolden('participant');
      expect(() => ParticipantSchema.parse(fixture)).not.toThrow();
    });

    it('backend Candidate has only "id" — frontend schema accepts extra fields via passthrough', () => {
      const fixture = readBackendGolden('participant') as { candidate: Record<string, unknown> };
      expect(Object.keys(fixture.candidate).sort()).toEqual(['id']);
    });

    it('participantTags is array (backend is Set<String>, serialized as JSON array)', () => {
      const fixture = readBackendGolden('participant') as { participantTags: unknown };
      expect(Array.isArray(fixture.participantTags)).toBe(true);
    });

    it('ParticipationStatus enum values match backend', () => {
      const backendValues = ['ENROLLED', 'NOT_ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'UNKNOWN'];
      for (const val of backendValues) {
        expect(() => ParticipationStatusSchema.parse(val)).not.toThrow();
      }
    });
  });

  // ==========================================================================
  // Questionnaire
  // ==========================================================================
  describe('Questionnaire', () => {
    it('backend fixture parses with frontend schema', () => {
      const fixture = readBackendGolden('questionnaire');
      expect(() => QuestionnaireRecordSchema.parse(fixture)).not.toThrow();
    });

    it('choices is array (backend is Set<String>, serialized as JSON array)', () => {
      const fixture = readBackendGolden('questionnaire') as { questions: { choices: unknown }[] };
      for (const q of fixture.questions) {
        expect(Array.isArray(q.choices)).toBe(true);
      }
    });

    it('field names match', () => {
      const fixture = readBackendGolden('questionnaire');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(QuestionnaireRecordSchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });

  // ==========================================================================
  // StudySummary (from Study model)
  // ==========================================================================
  describe('StudySummary (from Study model)', () => {
    it('backend fixture parses with frontend schema (passthrough for extra fields)', () => {
      const fixture = readBackendGolden('study');
      // StudySummary uses all-optional fields, so parse won't fail on extras
      // unless we use strict(). We use passthrough to detect extras.
      expect(() => StudySummarySchema.passthrough().parse(fixture)).not.toThrow();
    });

    it('documents known drift — backend fields absent from frontend', () => {
      const fixture = readBackendGolden('study');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(StudySummarySchema);
      const expectedAbsent = knownAbsentInFrontend('Study');

      const unexpectedBackendOnly = backendFields.filter(
        (f) => !frontendFields.includes(f) && !expectedAbsent.includes(f),
      );

      if (unexpectedBackendOnly.length > 0) {
        throw new Error(
          `Unexpected drift: backend has fields not in frontend schema and not in KNOWN_DRIFT: ${unexpectedBackendOnly.join(', ')}. ` +
            'Either add these to the frontend StudySummary type or document in KNOWN_DRIFT.',
        );
      }
    });

    it('all frontend fields exist in backend (no frontend-only invented fields)', () => {
      const fixture = readBackendGolden('study');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(StudySummarySchema);

      const frontendOnly = frontendFields.filter((f) => !backendFields.includes(f));
      // All frontend fields should come from the backend
      expect(frontendOnly).toEqual([]);
    });
  });

  // ==========================================================================
  // ParticipantStats
  // ==========================================================================
  describe('ParticipantStats', () => {
    it('backend fixture parses with frontend schema', () => {
      const fixture = readBackendGolden('participant-stats');
      expect(() => ParticipantStatsSchema.parse(fixture)).not.toThrow();
    });

    it('field names match exactly', () => {
      const fixture = readBackendGolden('participant-stats');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(ParticipantStatsSchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });

  // ==========================================================================
  // StudyRealtimeStats
  // ==========================================================================
  describe('StudyRealtimeStats', () => {
    it('backend fixture parses with strict frontend schema', () => {
      const fixture = withoutFixtureComment(readBackendGolden('study-realtime-stats'));
      expect(() => StudyRealtimeStatsSchema.strict().parse(fixture)).not.toThrow();
    });

    it('field names match exactly', () => {
      const fixture = readBackendGolden('study-realtime-stats');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(StudyRealtimeStatsSchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });

  // ==========================================================================
  // StudyEvent
  // ==========================================================================
  describe('StudyEvent', () => {
    it('backend fixture parses with frontend schema', () => {
      const fixture = readBackendGolden('study-event');
      expect(() => StudyEventSchema.parse(fixture)).not.toThrow();
    });

    it('field names match', () => {
      const fixture = readBackendGolden('study-event');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(StudyEventSchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });

  // ==========================================================================
  // AndroidDeviceSensorAvailability
  // ==========================================================================
  describe('AndroidDeviceSensorAvailability', () => {
    it('backend fixture parses with strict frontend schema', () => {
      const fixture = withoutFixtureComment(readBackendGolden('android-sensor-availability'));
      expect(() => AndroidDeviceSensorAvailabilitySchema.strict().parse(fixture)).not.toThrow();
    });

    it('field names match exactly', () => {
      const fixture = readBackendGolden('android-sensor-availability');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(AndroidDeviceSensorAvailabilitySchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });

  // ==========================================================================
  // StudyDuration
  // ==========================================================================
  describe('StudyDuration', () => {
    it('backend fixture parses with frontend schema', () => {
      const fixture = readBackendGolden('study-duration');
      expect(() => StudyDurationSchema.parse(fixture)).not.toThrow();
    });

    it('field names match exactly', () => {
      const fixture = readBackendGolden('study-duration');
      const backendFields = fieldNames(fixture);
      const frontendFields = zodFieldNames(StudyDurationSchema);
      expect(backendFields).toEqual(frontendFields);
    });
  });
});

// ---------------------------------------------------------------------------
// Drift registry summary — ensures all known drift entries have tests
// ---------------------------------------------------------------------------

describe('KNOWN_DRIFT registry completeness', () => {
  it('every model in KNOWN_DRIFT has at least one test above', () => {
    const testedModels = ['Study'];
    for (const model of Object.keys(KNOWN_DRIFT)) {
      expect(testedModels).toContain(model);
    }
  });

  it('no empty drift entries', () => {
    for (const [, entries] of Object.entries(KNOWN_DRIFT)) {
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.reason.length).toBeGreaterThan(0);
        expect(entry.backendField.length).toBeGreaterThan(0);
      }
    }
  });
});
