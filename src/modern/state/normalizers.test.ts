import { describe, expect, it } from 'bun:test';

import {
  normalizeParticipantList,
  normalizeQuestionnaireList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudySubmissionGroups,
} from './study-operations-api';

// --- normalizeQuestionnaireQuestion ---

describe('normalizeQuestionnaireQuestion()', () => {
  it('returns defaults for null input', () => {
    expect(normalizeQuestionnaireQuestion(null)).toEqual({ choices: [], title: '' });
  });

  it('returns defaults for array input', () => {
    expect(normalizeQuestionnaireQuestion([1, 2])).toEqual({ choices: [], title: '' });
  });

  it('returns defaults for primitive input', () => {
    expect(normalizeQuestionnaireQuestion('hello')).toEqual({ choices: [], title: '' });
  });

  it('extracts valid title and choices', () => {
    expect(
      normalizeQuestionnaireQuestion({
        title: 'How are you?',
        choices: ['Good', 'Bad'],
      }),
    ).toEqual({
      title: 'How are you?',
      choices: ['Good', 'Bad'],
    });
  });

  it('filters non-string choices', () => {
    expect(
      normalizeQuestionnaireQuestion({
        title: 'Q',
        choices: ['a', 42, null, 'b'],
      }),
    ).toEqual({
      title: 'Q',
      choices: ['a', 'b'],
    });
  });

  it('defaults title to empty string for non-string', () => {
    expect(normalizeQuestionnaireQuestion({ title: 123, choices: [] })).toEqual({
      title: '',
      choices: [],
    });
  });
});

// --- normalizeQuestionnaireRecord ---

describe('normalizeQuestionnaireRecord()', () => {
  it('returns defaults for null input', () => {
    const result = normalizeQuestionnaireRecord(null);
    expect(result.id).toBe('');
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.active).toBe(false);
    expect(result.questions).toEqual([]);
    expect(result.recurrenceRule).toBeNull();
  });

  it('normalizes a well-formed record', () => {
    const result = normalizeQuestionnaireRecord({
      id: 'q-1',
      title: 'Survey',
      description: 'A survey',
      active: true,
      questions: [{ title: 'Q1', choices: ['a'] }],
      recurrenceRule: 'FREQ=DAILY',
      dateCreated: '2024-01-01',
    });

    expect(result.id).toBe('q-1');
    expect(result.active).toBe(true);
    expect(result.questions).toHaveLength(1);
    expect(result.recurrenceRule).toBe('FREQ=DAILY');
    expect(result.dateCreated).toBe('2024-01-01');
  });

  it('omits dateCreated when not a string', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-2', dateCreated: 12345 });
    expect(result.dateCreated).toBeUndefined();
  });

  it('handles missing questions gracefully', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-3' });
    expect(result.questions).toEqual([]);
  });
});

// --- normalizeQuestionnaireList ---

describe('normalizeQuestionnaireList()', () => {
  it('throws for non-array input', () => {
    expect(() => normalizeQuestionnaireList('not an array')).toThrow('Expected array');
    expect(() => normalizeQuestionnaireList(null)).toThrow('Expected array');
    expect(() => normalizeQuestionnaireList({})).toThrow('Expected array');
  });

  it('normalizes and filters out records without id', () => {
    const result = normalizeQuestionnaireList([
      { id: 'q-1', title: 'Valid' },
      { title: 'No ID' },
      { id: '', title: 'Empty ID' },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('q-1');
  });

  it('returns empty array for empty input', () => {
    expect(normalizeQuestionnaireList([])).toEqual([]);
  });
});

// --- normalizeStudySubmissionGroups ---

describe('normalizeStudySubmissionGroups()', () => {
  it('throws for non-object input', () => {
    expect(() => normalizeStudySubmissionGroups(null)).toThrow('Expected object');
    expect(() => normalizeStudySubmissionGroups([])).toThrow('Expected object');
    expect(() => normalizeStudySubmissionGroups('string')).toThrow('Expected object');
  });

  it('converts record to sorted groups', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['id-1', 'id-2'],
      '2024-03-15': ['id-3'],
      '2024-02-10': [42, 'id-4'],
    });

    expect(result).toEqual([
      { date: '2024-03-15', ids: ['id-3'] },
      { date: '2024-02-10', ids: ['42', 'id-4'] },
      { date: '2024-01-01', ids: ['id-1', 'id-2'] },
    ]);
  });

  it('filters non-string/non-number IDs', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['valid', null, undefined, true, 5],
    });

    expect(result[0]?.ids).toEqual(['valid', '5']);
  });

  it('handles non-array values as empty ids', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': 'not-an-array',
    });

    expect(result[0]?.ids).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(normalizeStudySubmissionGroups({})).toEqual([]);
  });
});

// --- normalizeParticipantList ---

describe('normalizeParticipantList()', () => {
  it('throws for non-array input', () => {
    expect(() => normalizeParticipantList(null)).toThrow('Expected array');
    expect(() => normalizeParticipantList({})).toThrow('Expected array');
  });

  it('normalizes valid participants', () => {
    const result = normalizeParticipantList([
      {
        participantId: 'p-1',
        candidate: { id: 'c-1', name: 'Alice' },
        participationStatus: 'ENROLLED',
        participantTags: ['tag1'],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.participantId).toBe('p-1');
    expect(result[0]?.candidate.id).toBe('c-1');
    expect(result[0]?.participationStatus).toBe('ENROLLED');
    expect(result[0]?.participantTags).toEqual(['tag1']);
  });

  it('filters out entries without participantId', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }, { candidate: { id: 'c-2' } }, {}]);

    expect(result).toHaveLength(1);
  });

  it('defaults candidate to { id: "" } when missing', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.candidate).toEqual({ id: '' });
  });

  it('defaults participationStatus to UNKNOWN', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participationStatus).toBe('UNKNOWN');
  });

  it('defaults participantTags to empty array', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participantTags).toEqual([]);
  });

  it('converts participantId to string', () => {
    const result = normalizeParticipantList([{ participantId: 123 }]);
    expect(result[0]?.participantId).toBe('123');
  });

  it('returns empty array for empty input', () => {
    expect(normalizeParticipantList([])).toEqual([]);
  });
});

// === EXPANDED EXHAUSTIVE TESTS ===

describe('normalizeQuestionnaireQuestion() — exhaustive edge cases', () => {
  const invalidInputCases: [string, unknown][] = [
    ['undefined', undefined],
    ['null', null],
    ['number 0', 0],
    ['number 42', 42],
    ['boolean true', true],
    ['boolean false', false],
    ['empty string', ''],
    ['non-empty string', 'hello'],
    ['empty array', []],
    ['array of numbers', [1, 2, 3]],
    ['nested array', [[]]],
    ['function', () => {}],
  ];

  it.each(invalidInputCases)('returns defaults for %s', (_label, input) => {
    expect(normalizeQuestionnaireQuestion(input)).toEqual({ choices: [], title: '' });
  });

  it('handles object with no title or choices', () => {
    expect(normalizeQuestionnaireQuestion({})).toEqual({ choices: [], title: '' });
  });

  it('handles object with extra unknown fields', () => {
    const result = normalizeQuestionnaireQuestion({ title: 'Q', choices: ['a'], extra: 'field' });
    expect(result.title).toBe('Q');
    expect(result.choices).toEqual(['a']);
  });

  it('handles object with boolean title', () => {
    expect(normalizeQuestionnaireQuestion({ title: true, choices: [] })).toEqual({ choices: [], title: '' });
  });

  it('handles object with null title', () => {
    expect(normalizeQuestionnaireQuestion({ title: null, choices: [] })).toEqual({ choices: [], title: '' });
  });

  it('handles object with undefined title', () => {
    expect(normalizeQuestionnaireQuestion({ title: undefined, choices: [] })).toEqual({ choices: [], title: '' });
  });

  it('handles choices with only non-strings', () => {
    expect(normalizeQuestionnaireQuestion({ title: 'Q', choices: [1, 2, null, false] })).toEqual({
      choices: [],
      title: 'Q',
    });
  });

  it('handles choices as non-array object', () => {
    expect(normalizeQuestionnaireQuestion({ title: 'Q', choices: { a: 1 } })).toEqual({ choices: [], title: 'Q' });
  });

  it('handles choices as string (not array)', () => {
    expect(normalizeQuestionnaireQuestion({ title: 'Q', choices: 'not array' })).toEqual({ choices: [], title: 'Q' });
  });

  it('preserves empty string choices', () => {
    expect(normalizeQuestionnaireQuestion({ title: 'Q', choices: ['', 'a', ''] })).toEqual({
      choices: ['', 'a', ''],
      title: 'Q',
    });
  });

  it('handles large choices array', () => {
    const choices = Array.from({ length: 100 }, (_, i) => `choice-${i}`);
    const result = normalizeQuestionnaireQuestion({ title: 'Q', choices });
    expect(result.choices).toHaveLength(100);
  });
});

describe('normalizeQuestionnaireRecord() — exhaustive edge cases', () => {
  const invalidInputCases: [string, unknown][] = [
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['string', 'hello'],
    ['array', [1, 2]],
    ['function', () => {}],
  ];

  it.each(invalidInputCases)('returns defaults for %s', (_label, input) => {
    const result = normalizeQuestionnaireRecord(input);
    expect(result.id).toBe('');
    expect(result.title).toBe('');
    expect(result.description).toBe('');
    expect(result.active).toBe(false);
    expect(result.questions).toEqual([]);
    expect(result.recurrenceRule).toBeNull();
  });

  it('handles object with only id', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-99' });
    expect(result.id).toBe('q-99');
    expect(result.title).toBe('');
    expect(result.active).toBe(false);
  });

  it('handles active as truthy non-boolean', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', active: 1 });
    expect(result.active).toBe(true);
  });

  it('handles active as falsy non-boolean', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', active: 0 });
    expect(result.active).toBe(false);
  });

  it('handles active as null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', active: null });
    expect(result.active).toBe(false);
  });

  it('handles numeric id (coerced to empty)', () => {
    const result = normalizeQuestionnaireRecord({ id: 123 });
    expect(result.id).toBe('');
  });

  it('handles description as number', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', description: 42 });
    expect(result.description).toBe('');
  });

  it('handles recurrenceRule as number', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', recurrenceRule: 123 });
    expect(result.recurrenceRule).toBeNull();
  });

  it('handles recurrenceRule as null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', recurrenceRule: null });
    expect(result.recurrenceRule).toBeNull();
  });

  it('handles recurrenceRule as valid RRULE string', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', recurrenceRule: 'FREQ=WEEKLY;COUNT=10' });
    expect(result.recurrenceRule).toBe('FREQ=WEEKLY;COUNT=10');
  });

  it('handles questions as non-array', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', questions: 'not-array' });
    expect(result.questions).toEqual([]);
  });

  it('normalizes nested questions', () => {
    const result = normalizeQuestionnaireRecord({
      id: 'q-1',
      questions: [
        { title: 'Q1', choices: ['a', 'b'] },
        { title: 42, choices: [1, 'c'] },
      ],
    });
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toEqual({ title: 'Q1', choices: ['a', 'b'] });
    expect(result.questions[1]).toEqual({ title: '', choices: ['c'] });
  });

  it('handles dateCreated as null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', dateCreated: null });
    expect(result.dateCreated).toBeUndefined();
  });

  it('handles dateCreated as empty string', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q-1', dateCreated: '' });
    expect(result.dateCreated).toBe('');
  });
});

describe('normalizeQuestionnaireList() — exhaustive edge cases', () => {
  const nonArrayInputs: [string, unknown][] = [
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['object', { a: 1 }],
    ['string', 'hello'],
    ['function', () => {}],
  ];

  it.each(nonArrayInputs)('throws for %s input', (_label, input) => {
    expect(() => normalizeQuestionnaireList(input)).toThrow('Expected array');
  });

  it('filters records with empty id', () => {
    const result = normalizeQuestionnaireList([
      { id: '', title: 'Empty ID' },
      { id: 'q-1', title: 'Valid' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('q-1');
  });

  it('filters records with null values (no id)', () => {
    const result = normalizeQuestionnaireList([null, { id: 'q-1' }]);
    expect(result).toHaveLength(1);
  });

  it('handles array with all invalid records', () => {
    const result = normalizeQuestionnaireList([{ title: 'No ID' }, null, 42, 'string']);
    expect(result).toEqual([]);
  });

  it('handles array of 100 valid records', () => {
    const input = Array.from({ length: 100 }, (_, i) => ({ id: `q-${i}`, title: `Q${i}` }));
    const result = normalizeQuestionnaireList(input);
    expect(result).toHaveLength(100);
  });

  it('preserves order of valid records', () => {
    const result = normalizeQuestionnaireList([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
    expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('normalizeStudySubmissionGroups() — exhaustive edge cases', () => {
  const nonObjectInputs: [string, unknown][] = [
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['string', 'hello'],
    ['function', () => {}],
  ];

  it.each(nonObjectInputs)('throws for %s input', (_label, input) => {
    expect(() => normalizeStudySubmissionGroups(input)).toThrow('Expected object');
  });

  it('sorts dates in reverse chronological order', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['a'],
      '2024-06-15': ['b'],
      '2024-03-10': ['c'],
    });
    expect(result.map((g) => g.date)).toEqual(['2024-06-15', '2024-03-10', '2024-01-01']);
  });

  it('handles single date entry', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': ['id-1'] });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ date: '2024-01-01', ids: ['id-1'] });
  });

  it('handles same-date entries (impossible in object, last wins)', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': ['x'] });
    expect(result).toHaveLength(1);
  });

  it('converts numeric IDs to strings', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': [1, 2, 3] });
    expect(result[0]?.ids).toEqual(['1', '2', '3']);
  });

  it('filters boolean IDs', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': [true, false, 'valid'] });
    expect(result[0]?.ids).toEqual(['valid']);
  });

  it('filters object IDs', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': [{ id: 'x' }, 'valid'] });
    expect(result[0]?.ids).toEqual(['valid']);
  });

  it('handles empty array value', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': [] });
    expect(result[0]?.ids).toEqual([]);
  });

  it('handles null value (non-array => empty ids)', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': null });
    expect(result[0]?.ids).toEqual([]);
  });

  it('handles number value (non-array => empty ids)', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': 42 });
    expect(result[0]?.ids).toEqual([]);
  });

  it('handles many dates sorted correctly', () => {
    const dates: Record<string, string[]> = {};
    for (let i = 1; i <= 12; i++) {
      const month = String(i).padStart(2, '0');
      dates[`2024-${month}-01`] = [`id-${i}`];
    }
    const result = normalizeStudySubmissionGroups(dates);
    expect(result[0]?.date).toBe('2024-12-01');
    expect(result[result.length - 1]?.date).toBe('2024-01-01');
  });

  it('handles mixed valid/invalid IDs with numbers', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['a', 0, null, 'b', undefined, 1, true],
    });
    expect(result[0]?.ids).toEqual(['a', '0', 'b', '1']);
  });
});

describe('normalizeParticipantList() — exhaustive edge cases', () => {
  const nonArrayInputs: [string, unknown][] = [
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['string', 'hello'],
    ['function', () => {}],
  ];

  it.each(nonArrayInputs)('throws for %s input', (_label, input) => {
    expect(() => normalizeParticipantList(input)).toThrow('Expected array');
  });

  it('filters entries with participantId = 0 (falsy)', () => {
    const result = normalizeParticipantList([{ participantId: 0 }]);
    expect(result).toHaveLength(0);
  });

  it('includes entries with participantId = "0" (truthy string)', () => {
    const result = normalizeParticipantList([{ participantId: '0' }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.participantId).toBe('0');
  });

  it('filters entries with participantId = false', () => {
    const result = normalizeParticipantList([{ participantId: false }]);
    expect(result).toHaveLength(0);
  });

  it('filters entries with participantId = null', () => {
    const result = normalizeParticipantList([{ participantId: null }]);
    expect(result).toHaveLength(0);
  });

  it('filters entries with participantId = ""', () => {
    const result = normalizeParticipantList([{ participantId: '' }]);
    expect(result).toHaveLength(0);
  });

  it('converts numeric participantId to string', () => {
    const result = normalizeParticipantList([{ participantId: 42 }]);
    expect(result[0]?.participantId).toBe('42');
  });

  it('preserves string participantId', () => {
    const result = normalizeParticipantList([{ participantId: 'p-abc' }]);
    expect(result[0]?.participantId).toBe('p-abc');
  });

  it('defaults candidate to { id: "" } when candidate is null', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', candidate: null }]);
    expect(result[0]?.candidate).toEqual({ id: '' });
  });

  it('defaults candidate to { id: "" } when candidate is undefined', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.candidate).toEqual({ id: '' });
  });

  it('preserves full candidate object', () => {
    const candidate = { id: 'c-1', name: 'Alice', email: 'alice@example.com' };
    const result = normalizeParticipantList([{ participantId: 'p-1', candidate }]);
    expect(result[0]?.candidate).toEqual(candidate);
  });

  it('defaults participantTags to [] when non-array', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantTags: 'not-array' }]);
    expect(result[0]?.participantTags).toEqual([]);
  });

  it('defaults participantTags to [] when null', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantTags: null }]);
    expect(result[0]?.participantTags).toEqual([]);
  });

  it('preserves valid participantTags', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantTags: ['tag1', 'tag2'] }]);
    expect(result[0]?.participantTags).toEqual(['tag1', 'tag2']);
  });

  it('defaults participationStatus to UNKNOWN when missing', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participationStatus).toBe('UNKNOWN');
  });

  it('defaults participationStatus to UNKNOWN when empty string', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participationStatus: '' }]);
    expect(result[0]?.participationStatus).toBe('UNKNOWN');
  });

  it('preserves valid participationStatus', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participationStatus: 'ENROLLED' }]);
    expect(result[0]?.participationStatus).toBe('ENROLLED');
  });

  it('preserves participantNotes', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantNotes: 'Some notes' }]);
    expect(result[0]?.participantNotes).toBe('Some notes');
  });

  it('handles large list of participants', () => {
    const input = Array.from({ length: 200 }, (_, i) => ({ participantId: `p-${i}` }));
    const result = normalizeParticipantList(input);
    expect(result).toHaveLength(200);
  });

  it('preserves order of participants', () => {
    const result = normalizeParticipantList([{ participantId: 'c' }, { participantId: 'a' }, { participantId: 'b' }]);
    expect(result.map((p) => p.participantId)).toEqual(['c', 'a', 'b']);
  });

  it('handles mixed valid/invalid entries (objects only)', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }, {}, { participantId: 'p-2' }, { noId: true }]);
    expect(result).toHaveLength(2);
    expect(result[0]?.participantId).toBe('p-1');
    expect(result[1]?.participantId).toBe('p-2');
  });
});
