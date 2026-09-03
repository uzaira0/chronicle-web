import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { validIsoDateArb } from '../test/arbitraries';
import {
  normalizeParticipantList,
  normalizeQuestionnaireList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudySubmissionGroups,
} from './study-operations-api';

const questionArb = fc.record({
  title: fc.string(),
  choices: fc.array(fc.string()),
});

const questionnaireArb = fc.record({
  id: fc.string({ minLength: 1 }),
  title: fc.string(),
  description: fc.string(),
  active: fc.boolean(),
  questions: fc.array(questionArb),
});

const dateArb = validIsoDateArb;

const participantArb = fc.record({
  participantId: fc.string({ minLength: 1 }),
  participationStatus: fc.constantFrom('ENROLLED', 'PAUSED', 'NOT_ENROLLED'),
  participantTags: fc.array(fc.string()),
  candidate: fc.record({ id: fc.string() }),
});

describe('normalizer properties', () => {
  // --- Existing tests ---
  it('normalizeQuestionnaireList is idempotent', () => {
    fc.assert(
      fc.property(fc.array(questionnaireArb), (input) => {
        const first = normalizeQuestionnaireList(input);
        const second = normalizeQuestionnaireList(first);
        expect(second).toEqual(first);
      }),
    );
  });

  it('normalizeQuestionnaireList output length <= input length', () => {
    fc.assert(
      fc.property(fc.array(questionnaireArb), (input) => {
        const result = normalizeQuestionnaireList(input);
        expect(result.length).toBeLessThanOrEqual(input.length);
      }),
    );
  });

  it('normalizeStudySubmissionGroups sorts dates descending', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 2, maxLength: 20 }), (dates) => {
        const input: Record<string, string[]> = {};
        for (const date of dates) input[date] = ['id-1'];

        const result = normalizeStudySubmissionGroups(input);
        for (let i = 1; i < result.length; i++) {
          const previousDate = result[i - 1]?.date ?? '';
          const currentDate = result[i]?.date ?? '';
          expect(previousDate >= currentDate).toBe(true);
        }
      }),
    );
  });

  it('normalizeParticipantList output has no undefined required fields', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        for (const p of result) {
          expect(p.participantId).toBeDefined();
          expect(p.participationStatus).toBeDefined();
          expect(Array.isArray(p.participantTags)).toBe(true);
          expect(p.candidate).toBeDefined();
        }
      }),
    );
  });

  // --- New properties ---

  it('normalizeQuestionnaireQuestion output always has choices array', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = normalizeQuestionnaireQuestion(input);
        expect(Array.isArray(result.choices)).toBe(true);
      }),
    );
  });

  it('normalizeQuestionnaireQuestion output always has title string', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = normalizeQuestionnaireQuestion(input);
        expect(typeof result.title).toBe('string');
      }),
    );
  });

  it('normalizeQuestionnaireQuestion choices are always strings', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = normalizeQuestionnaireQuestion(input);
        for (const choice of result.choices) {
          expect(typeof choice).toBe('string');
        }
      }),
    );
  });

  it('normalizeQuestionnaireQuestion preserves valid title', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (title, choices) => {
        const result = normalizeQuestionnaireQuestion({ title, choices });
        expect(result.title).toBe(title);
      }),
    );
  });

  it('normalizeQuestionnaireQuestion preserves valid string choices', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (title, choices) => {
        const result = normalizeQuestionnaireQuestion({ title, choices });
        expect(result.choices).toEqual(choices);
      }),
    );
  });

  it('normalizeQuestionnaireQuestion filters non-string choices', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))),
        (title, choices) => {
          const result = normalizeQuestionnaireQuestion({ title, choices });
          const expectedChoices = choices.filter((c): c is string => typeof c === 'string');
          expect(result.choices).toEqual(expectedChoices);
        },
      ),
    );
  });

  it('normalizeQuestionnaireQuestion is deterministic', () => {
    fc.assert(
      fc.property(questionArb, (input) => {
        expect(normalizeQuestionnaireQuestion(input)).toEqual(normalizeQuestionnaireQuestion(input));
      }),
    );
  });

  it('normalizeQuestionnaireRecord output always has all required fields', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(typeof result.active).toBe('boolean');
        expect(typeof result.description).toBe('string');
        expect(typeof result.id).toBe('string');
        expect(Array.isArray(result.questions)).toBe(true);
        expect(typeof result.title).toBe('string');
      }),
    );
  });

  it('normalizeQuestionnaireRecord questions is always an array', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(Array.isArray(result.questions)).toBe(true);
      }),
    );
  });

  it('normalizeQuestionnaireRecord preserves valid id', () => {
    fc.assert(
      fc.property(questionnaireArb, (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(result.id).toBe(input.id);
      }),
    );
  });

  it('normalizeQuestionnaireRecord preserves valid title', () => {
    fc.assert(
      fc.property(questionnaireArb, (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(result.title).toBe(input.title);
      }),
    );
  });

  it('normalizeQuestionnaireRecord preserves valid description', () => {
    fc.assert(
      fc.property(questionnaireArb, (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(result.description).toBe(input.description);
      }),
    );
  });

  it('normalizeQuestionnaireRecord preserves active status', () => {
    fc.assert(
      fc.property(questionnaireArb, (input) => {
        const result = normalizeQuestionnaireRecord(input);
        expect(result.active).toBe(input.active);
      }),
    );
  });

  it('normalizeQuestionnaireList output items all have non-empty id', () => {
    fc.assert(
      fc.property(fc.array(questionnaireArb), (input) => {
        const result = normalizeQuestionnaireList(input);
        for (const item of result) {
          expect(item.id.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('normalizeQuestionnaireList filters out items with empty id', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.oneof(fc.constant(''), fc.string({ minLength: 1 })),
            title: fc.string(),
            description: fc.string(),
            active: fc.boolean(),
            questions: fc.array(questionArb),
          }),
        ),
        (input) => {
          const result = normalizeQuestionnaireList(input);
          const expectedCount = input.filter((q) => q.id.length > 0).length;
          expect(result.length).toBe(expectedCount);
        },
      ),
    );
  });

  it('normalizeQuestionnaireList is deterministic', () => {
    fc.assert(
      fc.property(fc.array(questionnaireArb), (input) => {
        expect(normalizeQuestionnaireList(input)).toEqual(normalizeQuestionnaireList(input));
      }),
    );
  });

  it('normalizeStudySubmissionGroups ids are always strings', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 1, maxLength: 10 }), (dates) => {
        const input: Record<string, (string | number)[]> = {};
        for (const date of dates) input[date] = ['id-1', 42, 'id-2'];

        const result = normalizeStudySubmissionGroups(input);
        for (const group of result) {
          for (const id of group.ids) {
            expect(typeof id).toBe('string');
          }
        }
      }),
    );
  });

  it('normalizeStudySubmissionGroups output length equals number of input keys', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 1, maxLength: 10 }), (dates) => {
        const input: Record<string, string[]> = {};
        for (const date of dates) input[date] = ['id-1'];

        const result = normalizeStudySubmissionGroups(input);
        expect(result.length).toBe(dates.length);
      }),
    );
  });

  it('normalizeStudySubmissionGroups each group has a date string', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 1, maxLength: 10 }), (dates) => {
        const input: Record<string, string[]> = {};
        for (const date of dates) input[date] = ['id-1'];

        const result = normalizeStudySubmissionGroups(input);
        for (const group of result) {
          expect(typeof group.date).toBe('string');
          expect(group.date.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('normalizeStudySubmissionGroups each group has an ids array', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 1, maxLength: 10 }), (dates) => {
        const input: Record<string, string[]> = {};
        for (const date of dates) input[date] = ['id-1'];

        const result = normalizeStudySubmissionGroups(input);
        for (const group of result) {
          expect(Array.isArray(group.ids)).toBe(true);
        }
      }),
    );
  });

  it('normalizeStudySubmissionGroups is deterministic', () => {
    fc.assert(
      fc.property(fc.uniqueArray(dateArb, { minLength: 1, maxLength: 10 }), (dates) => {
        const input: Record<string, string[]> = {};
        for (const date of dates) input[date] = ['id-1'];

        expect(normalizeStudySubmissionGroups(input)).toEqual(normalizeStudySubmissionGroups(input));
      }),
    );
  });

  it('normalizeParticipantList output items all have participantId', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        for (const p of result) {
          expect(typeof p.participantId).toBe('string');
          expect(p.participantId.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('normalizeParticipantList candidate is always an object', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        for (const p of result) {
          expect(typeof p.candidate).toBe('object');
          expect(p.candidate).not.toBeNull();
        }
      }),
    );
  });

  it('normalizeParticipantList participantTags is always an array', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        for (const p of result) {
          expect(Array.isArray(p.participantTags)).toBe(true);
        }
      }),
    );
  });

  it('normalizeParticipantList filters items without participantId', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            participantId: fc.oneof(fc.constant(''), fc.constant(null), fc.string({ minLength: 1 })),
            participationStatus: fc.constantFrom('ENROLLED', 'PAUSED'),
            participantTags: fc.array(fc.string()),
            candidate: fc.record({ id: fc.string() }),
          }),
        ),
        (input) => {
          const result = normalizeParticipantList(input);
          expect(result.length).toBeLessThanOrEqual(input.length);
        },
      ),
    );
  });

  it('normalizeParticipantList output length equals count of truthy participantId inputs', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        const expectedCount = input.filter((p) => p.participantId).length;
        expect(result.length).toBe(expectedCount);
      }),
    );
  });

  it('normalizeParticipantList is deterministic', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        expect(normalizeParticipantList(input)).toEqual(normalizeParticipantList(input));
      }),
    );
  });

  it('normalizeParticipantList participationStatus is always a string', () => {
    fc.assert(
      fc.property(fc.array(participantArb), (input) => {
        const result = normalizeParticipantList(input);
        for (const p of result) {
          expect(typeof p.participationStatus).toBe('string');
        }
      }),
    );
  });
});
