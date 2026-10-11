import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';

import { ChoicesEditor } from './ChoicesEditor';
import { QuestionnaireBuilder } from './QuestionnaireBuilder';

afterEach(() => {
  cleanup();
  mock.restore();
});

describe('ChoicesEditor keyboard reordering', () => {
  test('moves a choice with named controls, persists the new order, and keeps focus on it', () => {
    const onChange = mock(() => undefined);
    render(
      <LanguageProvider initialSearch="">
        <ChoicesEditor choices={['First', 'Second', 'Third']} onChange={onChange} />
      </LanguageProvider>,
    );

    const moveUp = screen.getByRole('button', { name: 'Move choice 3 up' });
    moveUp.focus();
    fireEvent.click(moveUp);
    expect(onChange).toHaveBeenLastCalledWith(['First', 'Third', 'Second']);
    expect(screen.getByLabelText<HTMLInputElement>('Choice 2').value).toBe('Third');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move choice 2 up' }));
  });
});

test.each([
  'choices',
  'questions',
])('drag reorders %s once per frame and cancellation preserves the last order', (kind) => {
  const changed = mock((value: unknown) => value);
  const values = ['First', 'Second', 'Third'];
  let frame: FrameRequestCallback | undefined;
  const FRAME_ID = 37;
  const schedule = spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return FRAME_ID;
  });
  const cancel = spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
  render(
    <LanguageProvider initialSearch="">
      {kind === 'choices' ? (
        <ChoicesEditor choices={values} onChange={changed} />
      ) : (
        <QuestionnaireBuilder
          initialQuestionnaire={{ title: 'Survey', questions: values.map((title) => ({ title, choices: [] })) }}
          onCancel={() => undefined}
          onSave={(questionnaire) => {
            changed(questionnaire);
            return Promise.resolve();
          }}
        />
      )}
    </LanguageProvider>,
  );
  const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[draggable="true"]'));
  fireEvent.dragStart(rows()[2] as HTMLElement);
  fireEvent.dragOver(rows()[0] as HTMLElement);
  fireEvent.dragOver(rows()[1] as HTMLElement);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(rows().map((row) => row.querySelector('input')?.value)).toEqual(values);
  act(() => frame?.(0));
  const reordered = ['Third', 'First', 'Second'];
  expect(rows().map((row) => row.querySelector('input')?.value)).toEqual(reordered);
  // Ending a drag cancels any scheduled next move before it can change the array.
  fireEvent.dragOver(rows()[1] as HTMLElement);
  fireEvent.dragEnd(rows()[0] as HTMLElement);
  expect(cancel).toHaveBeenCalledWith(FRAME_ID);
  expect(rows().map((row) => row.querySelector('input')?.value)).toEqual(reordered);
  if (kind === 'choices') expect(changed).toHaveBeenLastCalledWith(reordered);
  else {
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(changed).toHaveBeenCalledWith({
      title: 'Survey',
      description: '',
      active: true,
      questions: reordered.map((title) => ({ title, choices: [] })),
    });
  }
});
