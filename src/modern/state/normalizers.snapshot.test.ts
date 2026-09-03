import { describe, expect, it } from 'bun:test';
import {
  normalizeParticipantList,
  normalizeQuestionnaireList,
  normalizeQuestionnaireQuestion,
  normalizeQuestionnaireRecord,
  normalizeStudySubmissionGroups,
} from '@/state/study-operations-api';

describe('normalizer snapshots', () => {
  describe('normalizeQuestionnaireQuestion', () => {
    it('minimal input', () => {
      expect(normalizeQuestionnaireQuestion({})).toMatchSnapshot();
    });
    it('full input', () => {
      expect(
        normalizeQuestionnaireQuestion({
          title: 'How are you?',
          choices: ['Good', 'Bad', 'OK'],
        }),
      ).toMatchSnapshot();
    });
    it('null input', () => {
      expect(normalizeQuestionnaireQuestion(null)).toMatchSnapshot();
    });
    it('number input', () => {
      expect(normalizeQuestionnaireQuestion(42)).toMatchSnapshot();
    });
    it('mixed choices', () => {
      expect(
        normalizeQuestionnaireQuestion({
          title: 'Q1',
          choices: ['A', 123, null, 'B', true],
        }),
      ).toMatchSnapshot();
    });
    it('array input treated as non-object', () => {
      expect(normalizeQuestionnaireQuestion(['a', 'b'])).toMatchSnapshot();
    });
    it('undefined input', () => {
      expect(normalizeQuestionnaireQuestion(undefined)).toMatchSnapshot();
    });
    it('empty string title', () => {
      expect(normalizeQuestionnaireQuestion({ title: '', choices: [] })).toMatchSnapshot();
    });
  });

  describe('normalizeQuestionnaireRecord', () => {
    it('empty object', () => {
      expect(normalizeQuestionnaireRecord({})).toMatchSnapshot();
    });
    it('full valid record', () => {
      expect(
        normalizeQuestionnaireRecord({
          id: 'q-1',
          title: 'Daily Survey',
          description: 'A daily check-in',
          active: true,
          questions: [
            { title: 'How?', choices: ['Good', 'Bad'] },
            { title: 'Why?', choices: [] },
          ],
          dateCreated: '2024-01-15',
          recurrenceRule: 'FREQ=DAILY',
        }),
      ).toMatchSnapshot();
    });
    it('minimal record with id', () => {
      expect(normalizeQuestionnaireRecord({ id: 'q-2' })).toMatchSnapshot();
    });
    it('null input', () => {
      expect(normalizeQuestionnaireRecord(null)).toMatchSnapshot();
    });
    it('record without dateCreated omits field', () => {
      expect(normalizeQuestionnaireRecord({ id: 'q-3', title: 'No Date' })).toMatchSnapshot();
    });
    it('record with non-string recurrenceRule', () => {
      expect(normalizeQuestionnaireRecord({ id: 'q-4', recurrenceRule: 123 })).toMatchSnapshot();
    });
  });

  describe('normalizeQuestionnaireList', () => {
    it('empty array', () => {
      expect(normalizeQuestionnaireList([])).toMatchSnapshot();
    });
    it('mixed valid and invalid items', () => {
      expect(
        normalizeQuestionnaireList([
          { id: 'q-1', title: 'Survey A', active: true },
          { title: 'No ID' },
          { id: 'q-2', title: 'Survey B', questions: [{ title: 'Q1', choices: ['A'] }] },
        ]),
      ).toMatchSnapshot();
    });
    it('all items missing id are filtered out', () => {
      expect(normalizeQuestionnaireList([{ title: 'No ID 1' }, { title: 'No ID 2' }])).toMatchSnapshot();
    });
    it('single valid item', () => {
      expect(normalizeQuestionnaireList([{ id: 'q-only', title: 'Only One', active: false }])).toMatchSnapshot();
    });
  });

  describe('normalizeStudySubmissionGroups', () => {
    it('empty object', () => {
      expect(normalizeStudySubmissionGroups({})).toMatchSnapshot();
    });
    it('multiple dates sorted descending', () => {
      expect(
        normalizeStudySubmissionGroups({
          '2024-01-15': ['p1', 'p2'],
          '2024-01-17': ['p3'],
          '2024-01-10': ['p4', 'p5', 'p6'],
        }),
      ).toMatchSnapshot();
    });
    it('single date with numeric IDs', () => {
      expect(
        normalizeStudySubmissionGroups({
          '2024-03-01': [1, 2, 3],
        }),
      ).toMatchSnapshot();
    });
    it('values with non-string/non-number items filtered', () => {
      expect(
        normalizeStudySubmissionGroups({
          '2024-05-01': ['valid', null, undefined, 'also-valid', true, 42],
        }),
      ).toMatchSnapshot();
    });
    it('empty ids arrays', () => {
      expect(
        normalizeStudySubmissionGroups({
          '2024-06-01': [],
          '2024-06-02': [],
        }),
      ).toMatchSnapshot();
    });
  });

  describe('normalizeParticipantList', () => {
    it('empty array', () => {
      expect(normalizeParticipantList([])).toMatchSnapshot();
    });
    it('full participant list', () => {
      expect(
        normalizeParticipantList([
          {
            participantId: 'p-1',
            candidate: { id: 'c-1', firstName: 'John', lastName: 'Doe' },
            participationStatus: 'ENROLLED',
            participantTags: ['control', 'wave-1'],
            participantNotes: 'Regular participant',
          },
          {
            participantId: 'p-2',
            candidate: { id: 'c-2' },
            participationStatus: 'PAUSED',
            participantTags: [],
          },
        ]),
      ).toMatchSnapshot();
    });
    it('participant with missing fields uses defaults', () => {
      expect(normalizeParticipantList([{ participantId: 'p-3' }])).toMatchSnapshot();
    });
    it('filters out items without participantId', () => {
      expect(
        normalizeParticipantList([
          { participantId: 'p-4', candidate: { id: 'c-4' } },
          { candidate: { id: 'c-5' } },
          { participantId: '', candidate: { id: 'c-6' } },
        ]),
      ).toMatchSnapshot();
    });
    it('non-array participantTags defaults to empty array', () => {
      expect(normalizeParticipantList([{ participantId: 'p-5', participantTags: 'not-an-array' }])).toMatchSnapshot();
    });
    it('missing participationStatus defaults to UNKNOWN', () => {
      expect(normalizeParticipantList([{ participantId: 'p-6', candidate: { id: 'c-6' } }])).toMatchSnapshot();
    });
  });
});
