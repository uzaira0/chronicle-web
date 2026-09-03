import { describe, expect, it } from 'bun:test';

import {
  normalizeParticipantList,
  normalizeQuestionnaireList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudySubmissionGroups,
} from './study-operations-api';

function expectThrownMessage(action: () => void, message: string): void {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error('Expected action to throw');
}

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeQuestionnaireQuestion — exhaustive edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeQuestionnaireQuestion — edge cases', () => {
  it('null returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(null)).toEqual({ choices: [], title: '' });
  });

  it('undefined returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(undefined)).toEqual({ choices: [], title: '' });
  });

  it('0 returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(0)).toEqual({ choices: [], title: '' });
  });

  it('empty string returns defaults', () => {
    expect(normalizeQuestionnaireQuestion('')).toEqual({ choices: [], title: '' });
  });

  it('true returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(true)).toEqual({ choices: [], title: '' });
  });

  it('false returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(false)).toEqual({ choices: [], title: '' });
  });

  it('empty array returns defaults', () => {
    expect(normalizeQuestionnaireQuestion([])).toEqual({ choices: [], title: '' });
  });

  it('non-empty array returns defaults', () => {
    expect(normalizeQuestionnaireQuestion([1, 2, 3])).toEqual({ choices: [], title: '' });
  });

  it('number returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(42)).toEqual({ choices: [], title: '' });
  });

  it('NaN returns defaults', () => {
    expect(normalizeQuestionnaireQuestion(NaN)).toEqual({ choices: [], title: '' });
  });

  it('{title: 123} returns empty title', () => {
    expect(normalizeQuestionnaireQuestion({ title: 123 })).toEqual({ choices: [], title: '' });
  });

  it('{title: null} returns empty title', () => {
    expect(normalizeQuestionnaireQuestion({ title: null })).toEqual({ choices: [], title: '' });
  });

  it('{title: true} returns empty title', () => {
    expect(normalizeQuestionnaireQuestion({ title: true })).toEqual({ choices: [], title: '' });
  });

  it('{choices: "not-array"} returns empty choices', () => {
    expect(normalizeQuestionnaireQuestion({ choices: 'not-array' })).toEqual({ choices: [], title: '' });
  });

  it('{choices: null} returns empty choices', () => {
    expect(normalizeQuestionnaireQuestion({ choices: null })).toEqual({ choices: [], title: '' });
  });

  it('{choices: 42} returns empty choices', () => {
    expect(normalizeQuestionnaireQuestion({ choices: 42 })).toEqual({ choices: [], title: '' });
  });

  it('{choices: [1, 2, 3]} filters out numbers', () => {
    expect(normalizeQuestionnaireQuestion({ choices: [1, 2, 3] })).toEqual({ choices: [], title: '' });
  });

  it('{choices: ["a", 1, "b"]} keeps only strings', () => {
    expect(normalizeQuestionnaireQuestion({ choices: ['a', 1, 'b'] })).toEqual({ choices: ['a', 'b'], title: '' });
  });

  it('valid title and choices are preserved', () => {
    expect(normalizeQuestionnaireQuestion({ title: 'Q1', choices: ['A', 'B'] })).toEqual({
      title: 'Q1',
      choices: ['A', 'B'],
    });
  });

  it('{title: "", choices: []} returns {title: "", choices: []}', () => {
    expect(normalizeQuestionnaireQuestion({ title: '', choices: [] })).toEqual({ title: '', choices: [] });
  });

  it('extra fields are dropped', () => {
    const result = normalizeQuestionnaireQuestion({ title: 'Q', choices: ['A'], extra: 'value', id: 99 });
    expect(Object.keys(result)).toEqual(['choices', 'title']);
  });

  it('nested objects in choices are filtered out', () => {
    const result = normalizeQuestionnaireQuestion({ choices: ['a', { nested: true }, 'b'] });
    expect(result.choices).toEqual(['a', 'b']);
  });

  it('null entries in choices are filtered out', () => {
    const result = normalizeQuestionnaireQuestion({ choices: ['a', null, undefined, 'b'] });
    expect(result.choices).toEqual(['a', 'b']);
  });

  it('very long title string is preserved', () => {
    const longTitle = 'x'.repeat(10000);
    const result = normalizeQuestionnaireQuestion({ title: longTitle });
    expect(result.title).toBe(longTitle);
    expect(result.title).toHaveLength(10000);
  });

  it('very long choices array is preserved', () => {
    const choices = Array.from({ length: 500 }, (_, i) => `choice-${i}`);
    const result = normalizeQuestionnaireQuestion({ title: 'Q', choices });
    expect(result.choices).toHaveLength(500);
  });

  it('boolean array entries in choices are filtered out', () => {
    const result = normalizeQuestionnaireQuestion({ choices: [true, false, 'valid'] });
    expect(result.choices).toEqual(['valid']);
  });

  it('empty object returns defaults', () => {
    expect(normalizeQuestionnaireQuestion({})).toEqual({ choices: [], title: '' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeQuestionnaireRecord — exhaustive edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeQuestionnaireRecord — edge cases', () => {
  it('minimal valid input with id', () => {
    const result = normalizeQuestionnaireRecord({ id: 'abc' });
    expect(result.id).toBe('abc');
    expect(result.active).toBe(false);
    expect(result.description).toBe('');
    expect(result.title).toBe('');
    expect(result.questions).toEqual([]);
    expect(result.recurrenceRule).toBeNull();
  });

  it('missing id returns empty string id', () => {
    const result = normalizeQuestionnaireRecord({});
    expect(result.id).toBe('');
  });

  it('numeric id returns empty string', () => {
    const result = normalizeQuestionnaireRecord({ id: 123 });
    expect(result.id).toBe('');
  });

  it('missing questions returns empty array', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1' });
    expect(result.questions).toEqual([]);
  });

  it('null questions returns empty array', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', questions: null });
    expect(result.questions).toEqual([]);
  });

  it('active=0 becomes false', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', active: 0 });
    expect(result.active).toBe(false);
  });

  it('active=1 becomes true', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', active: 1 });
    expect(result.active).toBe(true);
  });

  it('active="" becomes false', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', active: '' });
    expect(result.active).toBe(false);
  });

  it('active="truthy" becomes true', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', active: 'truthy' });
    expect(result.active).toBe(true);
  });

  it('dateCreated included when string', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', dateCreated: '2024-01-01' });
    expect(result.dateCreated).toBe('2024-01-01');
  });

  it('dateCreated omitted when number', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', dateCreated: 12345 });
    expect(result.dateCreated).toBeUndefined();
  });

  it('dateCreated omitted when null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', dateCreated: null });
    expect(result.dateCreated).toBeUndefined();
  });

  it('dateCreated omitted when boolean', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', dateCreated: true });
    expect(result.dateCreated).toBeUndefined();
  });

  it('recurrenceRule null becomes null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', recurrenceRule: null });
    expect(result.recurrenceRule).toBeNull();
  });

  it('recurrenceRule number becomes null', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', recurrenceRule: 42 });
    expect(result.recurrenceRule).toBeNull();
  });

  it('recurrenceRule valid string is preserved', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', recurrenceRule: 'FREQ=WEEKLY' });
    expect(result.recurrenceRule).toBe('FREQ=WEEKLY');
  });

  it('description defaults to empty string when missing', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1' });
    expect(result.description).toBe('');
  });

  it('description defaults to empty string when number', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1', description: 123 });
    expect(result.description).toBe('');
  });

  it('title defaults to empty string when missing', () => {
    const result = normalizeQuestionnaireRecord({ id: 'q1' });
    expect(result.title).toBe('');
  });

  it('null input returns all defaults', () => {
    const result = normalizeQuestionnaireRecord(null);
    expect(result.id).toBe('');
    expect(result.active).toBe(false);
  });

  it('array input returns all defaults', () => {
    const result = normalizeQuestionnaireRecord([1, 2, 3]);
    expect(result.id).toBe('');
  });

  it('questions with mixed valid/invalid entries normalize each', () => {
    const result = normalizeQuestionnaireRecord({
      id: 'q1',
      questions: [{ title: 'Q1', choices: ['A'] }, null, 42, { title: 'Q2', choices: [1, 'B'] }],
    });
    expect(result.questions).toHaveLength(4);
    expect(result.questions[0]).toEqual({ title: 'Q1', choices: ['A'] });
    expect(result.questions[1]).toEqual({ title: '', choices: [] });
    expect(result.questions[2]).toEqual({ title: '', choices: [] });
    expect(result.questions[3]).toEqual({ title: 'Q2', choices: ['B'] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeQuestionnaireList — exhaustive edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeQuestionnaireList — edge cases', () => {
  it('throws for null', () => {
    expect(() => normalizeQuestionnaireList(null)).toThrow();
  });

  it('throws for undefined', () => {
    expect(() => normalizeQuestionnaireList(undefined)).toThrow();
  });

  it('throws for string', () => {
    expect(() => normalizeQuestionnaireList('hello')).toThrow('Expected array');
  });

  it('throws for number', () => {
    expect(() => normalizeQuestionnaireList(42)).toThrow('Expected array');
  });

  it('throws for plain object', () => {
    expect(() => normalizeQuestionnaireList({ a: 1 })).toThrow('Expected array');
  });

  it('throws for boolean', () => {
    expect(() => normalizeQuestionnaireList(true)).toThrow('Expected array');
  });

  it('empty array returns empty array', () => {
    expect(normalizeQuestionnaireList([])).toEqual([]);
  });

  it('filters out items with empty id', () => {
    const result = normalizeQuestionnaireList([{ id: '', title: 'No ID' }]);
    expect(result).toEqual([]);
  });

  it('filters out items with missing id', () => {
    const result = normalizeQuestionnaireList([{ title: 'No ID' }]);
    expect(result).toEqual([]);
  });

  it('preserves items with valid id', () => {
    const result = normalizeQuestionnaireList([{ id: 'q-1', title: 'Valid' }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('q-1');
  });

  it('mixed valid/invalid items', () => {
    const result = normalizeQuestionnaireList([
      { id: 'q-1', title: 'Valid' },
      { title: 'Invalid' },
      { id: 'q-2', title: 'Also valid' },
      { id: '', title: 'Empty id' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('q-1');
    expect(result[1]?.id).toBe('q-2');
  });

  it('single valid item returns array of length 1', () => {
    const result = normalizeQuestionnaireList([{ id: 'only', title: 'Sole entry' }]);
    expect(result).toHaveLength(1);
  });

  it('all invalid items returns empty result', () => {
    const result = normalizeQuestionnaireList([{ title: 'no id' }, { id: '' }, null, 42]);
    expect(result).toEqual([]);
  });

  it('normalizes each item through normalizeQuestionnaireRecord', () => {
    const result = normalizeQuestionnaireList([{ id: 'q-1', active: 'truthy', description: 123 }]);
    expect(result[0]?.active).toBe(true);
    expect(result[0]?.description).toBe('');
  });

  it('preserves dateCreated on valid items', () => {
    const result = normalizeQuestionnaireList([{ id: 'q-1', dateCreated: '2024-06-15' }]);
    expect(result[0]?.dateCreated).toBe('2024-06-15');
  });

  it('error message includes the actual type received', () => {
    expectThrownMessage(() => normalizeQuestionnaireList(42), 'number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeStudySubmissionGroups — exhaustive edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeStudySubmissionGroups — edge cases', () => {
  it('throws for array input', () => {
    expect(() => normalizeStudySubmissionGroups([])).toThrow();
  });

  it('throws for null', () => {
    expect(() => normalizeStudySubmissionGroups(null)).toThrow();
  });

  it('throws for string', () => {
    expect(() => normalizeStudySubmissionGroups('hello')).toThrow();
  });

  it('throws for number', () => {
    expect(() => normalizeStudySubmissionGroups(42)).toThrow();
  });

  it('throws for undefined', () => {
    expect(() => normalizeStudySubmissionGroups(undefined)).toThrow();
  });

  it('throws for boolean', () => {
    expect(() => normalizeStudySubmissionGroups(true)).toThrow();
  });

  it('empty object returns empty array', () => {
    expect(normalizeStudySubmissionGroups({})).toEqual([]);
  });

  it('single date with array of string IDs', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-15': ['id-1', 'id-2'] });
    expect(result).toEqual([{ date: '2024-01-15', ids: ['id-1', 'id-2'] }]);
  });

  it('numeric IDs get stringified', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-15': [100, 200] });
    expect(result[0]?.ids).toEqual(['100', '200']);
  });

  it('mixed string/number IDs', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-15': ['abc', 42, 'def'] });
    expect(result[0]?.ids).toEqual(['abc', '42', 'def']);
  });

  it('multiple dates sorted descending', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['a'],
      '2024-06-15': ['b'],
      '2024-03-10': ['c'],
    });
    expect(result.map((g) => g.date)).toEqual(['2024-06-15', '2024-03-10', '2024-01-01']);
  });

  it('already sorted input stays sorted', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-12-31': ['a'],
      '2024-06-15': ['b'],
      '2024-01-01': ['c'],
    });
    expect(result[0]?.date).toBe('2024-12-31');
    expect(result[2]?.date).toBe('2024-01-01');
  });

  it('reverse sorted input gets re-sorted', () => {
    const result = normalizeStudySubmissionGroups({
      '2020-01-01': ['a'],
      '2021-01-01': ['b'],
      '2022-01-01': ['c'],
    });
    expect(result[0]?.date).toBe('2022-01-01');
    expect(result[1]?.date).toBe('2021-01-01');
    expect(result[2]?.date).toBe('2020-01-01');
  });

  it('nested objects in IDs array are filtered', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['valid', { nested: true }, 'also-valid'],
    });
    expect(result[0]?.ids).toEqual(['valid', 'also-valid']);
  });

  it('null entries in IDs array are filtered', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': ['a', null, 'b'],
    });
    expect(result[0]?.ids).toEqual(['a', 'b']);
  });

  it('boolean entries in IDs array are filtered', () => {
    const result = normalizeStudySubmissionGroups({
      '2024-01-01': [true, false, 'valid'],
    });
    expect(result[0]?.ids).toEqual(['valid']);
  });

  it('non-array value becomes empty ids', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': 'not-array' });
    expect(result[0]?.ids).toEqual([]);
  });

  it('null value becomes empty ids', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': null });
    expect(result[0]?.ids).toEqual([]);
  });

  it('number value becomes empty ids', () => {
    const result = normalizeStudySubmissionGroups({ '2024-01-01': 42 });
    expect(result[0]?.ids).toEqual([]);
  });

  it('error message includes type info', () => {
    expectThrownMessage(() => normalizeStudySubmissionGroups(null), 'Expected object');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// normalizeParticipantList — exhaustive edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('normalizeParticipantList — edge cases', () => {
  it('throws for null', () => {
    expect(() => normalizeParticipantList(null)).toThrow();
  });

  it('throws for undefined', () => {
    expect(() => normalizeParticipantList(undefined)).toThrow();
  });

  it('throws for object', () => {
    expect(() => normalizeParticipantList({})).toThrow();
  });

  it('throws for string', () => {
    expect(() => normalizeParticipantList('hello')).toThrow();
  });

  it('throws for number', () => {
    expect(() => normalizeParticipantList(42)).toThrow();
  });

  it('throws for boolean', () => {
    expect(() => normalizeParticipantList(true)).toThrow();
  });

  it('empty array returns empty array', () => {
    expect(normalizeParticipantList([])).toEqual([]);
  });

  it('filters out entries without participantId', () => {
    const result = normalizeParticipantList([{ candidate: { id: 'c-1' } }, {}]);
    expect(result).toEqual([]);
  });

  it('preserves entries with participantId', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', candidate: { id: 'c-1' } }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.participantId).toBe('p-1');
  });

  it('missing candidate gets default {id: ""}', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.candidate).toEqual({ id: '' });
  });

  it('missing participantTags defaults to []', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participantTags).toEqual([]);
  });

  it('non-array participantTags defaults to []', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantTags: 'not-array' }]);
    expect(result[0]?.participantTags).toEqual([]);
  });

  it('missing participationStatus defaults to UNKNOWN', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participationStatus).toBe('UNKNOWN');
  });

  it('empty string participationStatus defaults to UNKNOWN', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participationStatus: '' }]);
    expect(result[0]?.participationStatus).toBe('UNKNOWN');
  });

  it('number participantId gets stringified', () => {
    const result = normalizeParticipantList([{ participantId: 123 }]);
    expect(result[0]?.participantId).toBe('123');
  });

  it('participantNotes is preserved as-is', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantNotes: 'some notes' }]);
    expect(result[0]?.participantNotes).toBe('some notes');
  });

  it('null participantNotes is preserved', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participantNotes: null }]);
    expect(result[0]?.participantNotes).toBeNull();
  });

  it('undefined participantNotes is preserved', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1' }]);
    expect(result[0]?.participantNotes).toBeUndefined();
  });

  it('candidate with extra fields is passed through', () => {
    const result = normalizeParticipantList([
      {
        participantId: 'p-1',
        candidate: { id: 'c-1', name: 'Alice', email: 'alice@test.com' },
      },
    ]);
    expect(result[0]?.candidate.id).toBe('c-1');
    expect(result[0]?.candidate.name).toBe('Alice');
  });

  it('filters entries where participantId is null', () => {
    const result = normalizeParticipantList([{ participantId: null }]);
    expect(result).toEqual([]);
  });

  it('filters entries where participantId is empty string', () => {
    const result = normalizeParticipantList([{ participantId: '' }]);
    expect(result).toEqual([]);
  });

  it('filters entries where participantId is 0', () => {
    const result = normalizeParticipantList([{ participantId: 0 }]);
    expect(result).toEqual([]);
  });

  it('preserves participationStatus when provided', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participationStatus: 'ENROLLED' }]);
    expect(result[0]?.participationStatus).toBe('ENROLLED');
  });

  it('preserves PAUSED status', () => {
    const result = normalizeParticipantList([{ participantId: 'p-1', participationStatus: 'PAUSED' }]);
    expect(result[0]?.participationStatus).toBe('PAUSED');
  });

  it('multiple participants are all normalized', () => {
    const result = normalizeParticipantList([
      { participantId: 'p-1', participationStatus: 'ENROLLED' },
      { participantId: 'p-2', participationStatus: 'PAUSED' },
      { participantId: 'p-3' },
    ]);
    expect(result).toHaveLength(3);
    expect(result[2]?.participationStatus).toBe('UNKNOWN');
  });

  it('error message includes Expected array', () => {
    expectThrownMessage(() => normalizeParticipantList({}), 'Expected array');
  });
});
