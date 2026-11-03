import { describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { PARTICIPANT_CSRF_STORAGE_KEY } from '@/lib/participant-access';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { ParticipantQuestionnaireForm, QuestionField } from './participant-questionnaire-form';

describe('ParticipantQuestionnaireForm - QuestionField', () => {
  test('renders an open-ended question as a textarea bound to the current answer', () => {
    const onOpenEndedChange = mock(() => {});
    render(
      <QuestionField
        answer={['hello']}
        index={0}
        onOpenEndedChange={onOpenEndedChange}
        onToggleChoice={() => {}}
        question={{ choices: [], title: 'How do you feel?' }}
      />,
    );

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(/answer to question 1/i);
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe('hello');

    fireEvent.change(textarea, { target: { value: 'updated' } });
    expect(onOpenEndedChange).toHaveBeenCalledWith('How do you feel?', 'updated');
  });

  test('renders a multiple-choice question as a checkbox group and reports toggles', () => {
    const onToggleChoice = mock(() => {});
    render(
      <QuestionField
        answer={['Daily']}
        index={2}
        onOpenEndedChange={() => {}}
        onToggleChoice={onToggleChoice}
        question={{ choices: ['Daily', 'Weekly', 'Never'], title: 'How often?' }}
      />,
    );

    // The pre-selected choice is checked, others are not.
    const daily = screen.getByLabelText<HTMLInputElement>('Daily');
    const weekly = screen.getByLabelText<HTMLInputElement>('Weekly');
    expect(daily.type).toBe('checkbox');
    expect(daily.checked).toBe(true);
    expect(weekly.checked).toBe(false);

    // Question number is 1-based.
    expect(screen.getByText('3')).toBeTruthy();

    fireEvent.click(weekly);
    expect(onToggleChoice).toHaveBeenCalledWith('How often?', 'Weekly', true);
  });
});

describe('ParticipantQuestionnaireForm - unanswered questions', () => {
  test('submit names each unanswered question, links the message and focuses the first one', async () => {
    const savedFetch = globalThis.fetch;
    const restoreRequest = installRelativeRequest();
    window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, 'form-csrf');
    let posts = 0;
    globalThis.fetch = routeFetch({
      'POST /chronicle/v3/survey/s1/participant/p1/questionnaire/q1': () => {
        posts += 1;
        return new Response('', { status: 200 });
      },
      'GET /chronicle/v3/survey/s1/questionnaire/q1': () =>
        Response.json({
          id: 'q1',
          questions: [
            { choices: ['Daily', 'Never'], title: 'How often?' },
            { choices: [], title: 'Why?' },
          ],
          title: 'Habits',
        }),
    });
    try {
      render(
        <Provider store={createApiStore()}>
          <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
        </Provider>,
      );
      const daily = await screen.findByLabelText<HTMLInputElement>('Daily');
      fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));

      expect(posts).toBe(0);
      expect(screen.getAllByText('Response is required')).toHaveLength(2);
      expect(document.activeElement).toBe(daily);

      fireEvent.click(daily);
      const answer = screen.getByRole('textbox');
      expect(document.getElementById(answer.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
        'Response is required',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
      expect(document.activeElement).toBe(answer);
    } finally {
      cleanup();
      window.sessionStorage.clear();
      globalThis.fetch = savedFetch;
      restoreRequest();
    }
  });
});

test('answers stay with their question when a refresh reorders the questions', async () => {
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, 'form-csrf');
  const store = createApiStore();
  const often = { choices: ['Daily', 'Never'], title: 'constructor' };
  const where = { choices: ['Home', 'School'], title: '__proto__' };
  let reads = 0;
  const posted: unknown[] = [];
  globalThis.fetch = routeFetch({
    'GET /chronicle/v3/survey/s1/questionnaire/q1': () => {
      reads += 1;
      return Response.json({ id: 'q1', questions: reads === 1 ? [often, where] : [where, often], title: 'Habits' });
    },
    'POST /chronicle/v3/survey/s1/participant/p1/questionnaire/q1': async (request) => {
      posted.push(await request.json());
      return new Response('', { status: 200 });
    },
  });
  try {
    render(
      <Provider store={store}>
        <ParticipantQuestionnaireForm participantId="p1" questionnaireId="q1" studyId="s1" />
      </Provider>,
    );
    fireEvent.click(await screen.findByLabelText('Daily'));
    fireEvent.click(screen.getByLabelText('School'));
    store.dispatch(studyOperationsApi.util.resetApiState());
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(screen.getAllByRole('group')[0]?.textContent).toContain('__proto__'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit responses' }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toEqual([
      { questionTitle: '__proto__', value: ['School'] },
      { questionTitle: 'constructor', value: ['Daily'] },
    ]);
  } finally {
    cleanup();
    store.dispatch(studyOperationsApi.util.resetApiState());
    window.sessionStorage.clear();
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});
