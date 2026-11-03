import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { REQUEST_STATES } from '@/lib/request-state';
import { studyOperationsApi } from '@/state/study-operations-api';
import { leaveIsBlocked } from '@/test/browser-env';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { QuestionnaireBuilder } from './QuestionnaireBuilder';

const originalFetch = globalThis.fetch;
let restoreRequest: (() => void) | undefined;
afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreRequest?.();
  restoreRequest = undefined;
});

test('asks before a reload once the questionnaire holds edits', () => {
  render(<QuestionnaireBuilder onCancel={() => undefined} onSave={mock(() => Promise.resolve())} />);
  expect(leaveIsBlocked()).toBe(false);
  fireEvent.change(screen.getByLabelText('Questionnaire title'), { target: { value: 'Daily habits' } });
  expect(leaveIsBlocked()).toBe(true);
});

describe('QuestionnaireBuilder submission fence', () => {
  test('moves questions with buttons and preserves the saved order', async () => {
    const onSave = mock(() => Promise.resolve());
    render(
      <QuestionnaireBuilder
        initialQuestionnaire={{
          title: 'Order',
          questions: [
            { title: 'First', choices: [] },
            { title: 'Second', choices: [] },
          ],
        }}
        onCancel={() => undefined}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
    expect(screen.getByLabelText<HTMLInputElement>('Question 1 text').value).toBe('Second');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Move question 1 up' }).disabled).toBe(true);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          { title: 'Second', choices: [] },
          { title: 'First', choices: [] },
        ],
      }),
    );
  });

  test('refuses to save a question that has answer choices but no text, and names it', async () => {
    const onSave = mock(() => Promise.resolve());
    render(
      <QuestionnaireBuilder
        initialQuestionnaire={{
          title: 'Habits',
          questions: [
            { title: 'Kept', choices: [] },
            { title: 'Cleared', choices: ['A', 'B'] },
          ],
        }}
        onCancel={() => undefined}
        onSave={onSave}
      />,
    );
    fireEvent.change(screen.getByLabelText('Question 2 text'), { target: { value: '  ' } });
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' });
    expect(save.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('2');
    await act(() => fireEvent.click(save));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('keeps a populated question until its removal is confirmed', async () => {
    render(
      <QuestionnaireBuilder
        initialQuestionnaire={{
          title: 'Keep draft',
          questions: [{ title: 'Unsaved answer choices', choices: ['A', 'B'] }],
        }}
        onCancel={() => undefined}
        onSave={() => Promise.resolve()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove question' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>('Question 1 text').value).toBe('Unsaved answer choices');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText<HTMLInputElement>('Question 1 text').value).toBe('Unsaved answer choices');
    fireEvent.click(screen.getByRole('button', { name: 'Remove question' }));
    await act(() =>
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete question' })),
    );
    await waitFor(() => expect(screen.queryByLabelText('Question 1 text')).toBeNull());
  });

  test('announces a pending save', () => {
    render(
      <QuestionnaireBuilder
        requestState={REQUEST_STATES.PENDING}
        onCancel={() => undefined}
        onSave={() => Promise.resolve()}
      />,
    );
    const saving = screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' });
    expect(saving.disabled).toBe(true);
    expect(saving.getAttribute('aria-busy')).toBe('true');
  });

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

    const submit = screen.getByRole('button', { name: 'Create questionnaire' });
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
    if (action === 'remove') {
      fireEvent.click(screen.getByRole('button', { name: 'Remove question' }));
      await act(() =>
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete question' })),
      );
    } else fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: '  ' } });
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
      recurrenceRule: null,
    });
  });

  test('sends the entered reminder recurrence through the create payload', async () => {
    restoreRequest = installRelativeRequest();
    const app = createApiStore();
    const requests: { path: string; body: unknown }[] = [];
    globalThis.fetch = routeFetch({
      'POST /chronicle/api/web/survey/study/questionnaire': async (request) => {
        requests.push({ path: new URL(request.url).pathname, body: await request.json() });
        return Response.json('created-questionnaire');
      },
    });
    const recurrenceRule = 'FREQ=DAILY;BYHOUR=19;BYMINUTE=0;BYSECOND=0';
    render(
      <QuestionnaireBuilder
        onCancel={() => undefined}
        onSave={async (questionnaire) => {
          await app
            .dispatch(
              studyOperationsApi.endpoints.createQuestionnaire.initiate({
                questionnaire,
                studyId: 'study',
                idempotencyKey: 'scheduled-questionnaire',
              }),
            )
            .unwrap();
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Questionnaire title'), { target: { value: 'Daily habits' } });
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: 'How often?' } });
    fireEvent.change(screen.getByLabelText('Reminder recurrence rule'), { target: { value: ` ${recurrenceRule} ` } });
    try {
      await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create questionnaire' })));
      await waitFor(() =>
        expect(requests).toEqual([
          {
            path: '/chronicle/api/web/survey/study/questionnaire',
            body: {
              title: 'Daily habits',
              description: '',
              active: true,
              questions: [{ title: 'How often?', choices: [] }],
              recurrenceRule,
            },
          },
        ]),
      );
    } finally {
      app.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test('preserves a loaded recurrence rule and can clear it on edit', async () => {
    const recurrenceRule = 'FREQ=WEEKLY;BYDAY=MO';
    const onSave = mock(() => Promise.resolve());
    render(
      <QuestionnaireBuilder
        initialQuestionnaire={{ title: 'Habits', questions: [{ title: 'How often?', choices: [] }], recurrenceRule }}
        onCancel={() => undefined}
        onSave={onSave}
      />,
    );
    const recurrence = screen.getByLabelText<HTMLInputElement>('Reminder recurrence rule');
    expect(recurrence.value).toBe(recurrenceRule);
    const save = screen.getByRole('button', { name: 'Save changes' });
    await act(() => fireEvent.click(save));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ recurrenceRule }));
    fireEvent.change(recurrence, { target: { value: '' } });
    await act(() => fireEvent.click(save));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ recurrenceRule: null }));
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
