import { expect, test } from 'bun:test';
import { createTranslator } from '@/i18n';
import { StudySettingsConflictError } from '@/state/settings-revision';
import { interpretSaveFailures, StudySaveError, studySaveStepList } from './study-save';

const { t } = createTranslator('en');
test('save failures name persisted settings rather than form field labels', () => {
  expect(studySaveStepList(['Withdrawal', 'TimeUseDiary'], t)).toBe('withdrawal policy, time use diary');
});
const enrollmentError = {
  status: 409,
  data: { blockingParticipantIds: ['pending-1', 'constructor'], message: 'Pending: pending-1, constructor' },
};

test('no failures means no message or conflicts', () => {
  expect(interpretSaveFailures([], t)).toEqual({ message: '', conflicts: [] });
});

test('enrollment-only failures belong to the conflict panel with neutral copy', () => {
  const result = interpretSaveFailures([{ step: 'DataCollection', error: enrollmentError }], t);
  expect(result.message).toBe('');
  expect(result.conflicts).toEqual([
    { type: 'enrollment', participantIds: ['pending-1', 'constructor'], message: t('study_form.pending_enrollment') },
  ]);
  expect(result.conflicts.find((conflict) => conflict.type === 'enrollment')?.message).not.toContain('pending-1');
});

test('combines all blocker sets without duplicating IDs or ordinary failure steps', () => {
  const result = interpretSaveFailures(
    [
      { step: 'DataCollection', error: enrollmentError },
      {
        step: 'ParticipantPolicy',
        error: { ...enrollmentError, data: { blockingParticipantIds: ['pending-2', 'pending-1'] } },
      },
      { step: 'limits', error: new Error('Limit storage unavailable') },
    ],
    t,
  );
  expect(result.conflicts.find((conflict) => conflict.type === 'enrollment')?.participantIds).toEqual([
    'pending-1',
    'constructor',
    'pending-2',
  ]);
  expect(result.message).toBe('These changes did not save: study limits. Limit storage unavailable');
});

test.each([{ status: 412 }, new StudySettingsConflictError('revision unavailable')])(
  'preserves settings reload alongside enrollment and ordinary failures: %p',
  (error) => {
    const result = interpretSaveFailures(
      [
        { step: 'DataCollection', error: enrollmentError },
        { step: 'ParticipantPolicy', error },
        { step: 'limits', error: new Error('Limit storage unavailable') },
      ],
      t,
    );
    expect(result.conflicts.map((conflict) => conflict.type)).toEqual(['enrollment', 'settingsRevision']);
    expect(result.message).toContain(t('study_layout.settings_conflict'));
    expect(result.message).toContain('These changes did not save: participant policy, study limits.');
    expect(result.message).not.toContain('data collection');
  },
);

test('invalid blocker responses stay ordinary failures', () => {
  const result = interpretSaveFailures(
    [{ step: 'DataCollection', error: { status: 409, data: { blockingParticipantIds: [null] } } }],
    t,
  );
  expect(result.conflicts).toEqual([]);
  expect(result.message).toContain('These changes did not save: data collection.');
});

test('StudySaveError carries the interpretation and a snapshot of failures', () => {
  const failures = [{ step: 'DataCollection' as const, error: enrollmentError }];
  const error = new StudySaveError({ failures, t });
  failures.length = 0;
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('StudySaveError');
  expect(error.failures).toHaveLength(1);
  expect(error.message).toBe('');
  expect(error.conflicts).toHaveLength(1);
});
