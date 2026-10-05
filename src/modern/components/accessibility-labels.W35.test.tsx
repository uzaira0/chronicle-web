import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';

await mock.module('@/state/study-operations-api', () => ({
  useLoadParticipantAnnotationsMutation: () => [() => ({ unwrap: () => Promise.resolve({ data: { participantNotes: '', participantTags: [] }, revision: '"fixture"' }) }), { isLoading: false }],
  useUpdateParticipantAnnotationsMutation: () => [() => ({ unwrap: () => Promise.resolve() }), { isLoading: false }],
}));

import { ParticipantNotesEditor } from './participant-notes-editor';
import { ChoicesEditor } from './questionnaires/ChoicesEditor';
import { ClockFormatSelect, FieldControl } from './tud/tud-widgets';
import type { FieldDef } from './tud/tud-schema';

afterEach(() => cleanup());

describe('accessible names for notes, questionnaire choices, and diary controls', () => {
  test('associates visible field names with every free-text input and grouped diary choice', () => {
    const diaryField: FieldDef = {
      code: 'wakeTime',
      options: [{ label: 'Before 7 AM', value: 'early' }],
      required: true,
      title: 'When did the day begin?',
      widget: 'radio',
    };
    const notes = render(
      <LanguageProvider initialSearch="">
        <ParticipantNotesEditor
          onClose={() => {}}
          participant={{ participantId: 'p1', participantNotes: '', participantTags: [] } as never}
          studyId="s1"
        />
      </LanguageProvider>,
    );

    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(screen.getByLabelText('Tags')).toBeTruthy();
    notes.unmount();

    const choices = render(
      <LanguageProvider initialSearch="">
        <ChoicesEditor choices={['Daily']} onChange={() => {}} />
      </LanguageProvider>,
    );
    expect(screen.getByLabelText('Choice 1')).toBeTruthy();
    choices.unmount();

    const diary = render(
      <LanguageProvider initialSearch="">
        <FieldControl field={diaryField} onChange={() => {}} value="" />
      </LanguageProvider>,
    );
    expect(screen.getByRole('group', { name: 'When did the day begin?' })).toBeTruthy();
    diary.unmount();

    render(
      <LanguageProvider initialSearch="">
        <ClockFormatSelect label="Clock format" labels={['12-hour', '24-hour']} onChange={() => {}} value={12} />
      </LanguageProvider>,
    );
    expect(screen.getByRole('group', { name: 'Clock format' })).toBeTruthy();
  });
});
