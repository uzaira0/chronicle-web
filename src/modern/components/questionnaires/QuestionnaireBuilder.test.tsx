import { describe, expect, mock, test } from 'bun:test';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { QuestionnaireBuilder } from './QuestionnaireBuilder';

describe('QuestionnaireBuilder submission fence', () => {
  test('coalesces two synchronous create clicks into one request', async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    render(<QuestionnaireBuilder onCancel={() => undefined} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Questionnaire title'), {
      target: { value: 'Single questionnaire' },
    });
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: 'How often?' } });

    const submit = screen.getByRole('button', { name: 'Create Questionnaire' });
    act(() => {
      submit.click();
      submit.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });
  });

  test.each(['remove', 'blank'])('cannot save after the last valid question becomes %s', async (action) => {
    const onSave = mock(() => Promise.resolve());
    render(
      <QuestionnaireBuilder
        initialQuestionnaire={{ title: 'Habits', questions: [{ title: 'How often?', choices: [] }] }}
        onCancel={() => undefined}
        onSave={onSave}
      />,
    );
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' });
    expect(save.disabled).toBe(false);
    if (action === 'remove') fireEvent.click(screen.getByRole('button', { name: 'Remove question' }));
    else fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: '  ' } });
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();

    if (action === 'remove') fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: 'Replacement question' } });
    expect(save.disabled).toBe(false);
    await act(() => fireEvent.click(save));
    expect(onSave).toHaveBeenCalledWith({
      title: 'Habits',
      description: '',
      active: true,
      questions: [{ title: 'Replacement question', choices: [] }],
    });
  });

  test('clicking the active caption toggles its named checkbox', () => {
    render(<QuestionnaireBuilder onCancel={() => undefined} onSave={() => Promise.resolve()} />);

    const active = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Keep this questionnaire active for the study.',
    });
    expect(active.checked).toBe(true);
    fireEvent.click(screen.getByText('Keep this questionnaire active for the study.'));
    expect(active.checked).toBe(false);
    fireEvent.click(screen.getByText('Keep this questionnaire active for the study.'));
    expect(active.checked).toBe(true);
  });
});
