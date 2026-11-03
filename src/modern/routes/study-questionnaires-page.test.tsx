import { afterEach, expect, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createTranslator } from '@/i18n';
import { type QuestionnaireDraft, studyOperationsApi } from '@/state/study-operations-api';
import savedQuestionnaire from '@/test/golden/backend-questionnaire.json';
import { routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { StudyQuestionnairesPage } from './study-questionnaires-page';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function renderPage(app: ReturnType<typeof createApiStore>) {
  return render(
    <Provider store={app}>
      <MemoryRouter initialEntries={['/studies/study/questionnaires']}>
        <Routes>
          <Route path="/studies/:studyId/questionnaires" element={<StudyQuestionnairesPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

test.each(['FREQ=DAILY;BYHOUR=19', 'FREQ=WEEKLY;BYDAY=MO'])(
  'title-only edit preserves every saved field (%s)',
  async (recurrenceRule) => {
    const app = createApiStore();
    const draft: QuestionnaireDraft = {
      title: 'Daily habits',
      description: 'Saved description',
      active: false,
      questions: [{ title: 'How often?', choices: ['Often', 'Never'] }],
      recurrenceRule,
    };
    const record = { ...savedQuestionnaire, ...draft };
    const questionnairePath = `/chronicle/api/web/survey/study/questionnaire/${record.id}`;
    const writes: { body: unknown; revision: string | null }[] = [];
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/study': () => Response.json({ id: 'study', title: 'Study' }),
      'GET /chronicle/api/web/survey/study/questionnaire': () => Response.json([record]),
      [`GET ${questionnairePath}`]: () => Response.json(record, { headers: { etag: '"saved"' } }),
      [`PATCH ${questionnairePath}`]: async (request) => {
        writes.push({ body: await request.json(), revision: request.headers.get('If-Match') });
        return Response.json({});
      },
    });
    try {
      renderPage(app);
      await screen.findByText(draft.title);
      await act(() => fireEvent.click(screen.getByRole('button', { name: 'Edit questionnaire' })));
      await screen.findByLabelText('Questionnaire title');
      fireEvent.change(screen.getByLabelText('Questionnaire title'), { target: { value: 'Updated title' } });
      await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
      await waitFor(() =>
        expect(writes).toEqual([{ body: { ...draft, title: 'Updated title' }, revision: '"saved"' }]),
      );
    } finally {
      cleanup();
      app.dispatch(studyOperationsApi.util.resetApiState());
    }
  },
);

test.each(['questionnaire_builder.preview_aria', 'questionnaire_builder.delete_aria'])(
  '%s reads the current record after a query refresh',
  async (actionKey) => {
    const app = createApiStore();
    const record = { ...savedQuestionnaire };
    const updatedTitle = `${record.title} updated`;
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/study/study': () => Response.json({ id: 'study', title: 'Study' }),
      'GET /chronicle/api/web/survey/study/questionnaire': () => Response.json([record]),
    });
    try {
      renderPage(app);
      await screen.findByText(record.title);
      fireEvent.click(screen.getByRole('button', { name: createTranslator('en').t(actionKey) }));
      const dialog = screen.getByRole('dialog');
      act(() => {
        app.dispatch(
          studyOperationsApi.util.updateQueryData('getStudyQuestionnaires', 'study', (records) => {
            const current = records.find(({ id }) => id === record.id);
            if (current) current.title = updatedTitle;
          }),
        );
      });
      await waitFor(() => expect(within(dialog).getByText((text) => text.includes(updatedTitle))).toBeTruthy());
    } finally {
      cleanup();
      app.dispatch(studyOperationsApi.util.resetApiState());
    }
  },
);
