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

  test('clicking the active caption toggles its named checkbox', () => {
    render(<QuestionnaireBuilder onCancel={() => undefined} onSave={async () => undefined} />);

    const active = screen.getByRole('checkbox', {
      name: 'Keep this questionnaire active for the study.',
    }) as HTMLInputElement;
    expect(active.checked).toBe(true);
    fireEvent.click(screen.getByText('Keep this questionnaire active for the study.'));
    expect(active.checked).toBe(false);
    fireEvent.click(screen.getByText('Keep this questionnaire active for the study.'));
    expect(active.checked).toBe(true);
  });
});
