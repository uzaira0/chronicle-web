import { expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';

import { PARTICIPANT_ID_PATTERN } from '@/generated/chronicle-contracts';
import { LanguageProvider } from '@/i18n';
import { StudyCompliancePage } from '@/routes/study-compliance-page';
import { type ComplianceViolationsMap, studyOperationsApi } from '@/state/study-operations-api';
import { routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

it.each(['empty', 'populated'] as const)(
  'keeps literal participant IDs in the compliance cache and table after refreshing %s results',
  async (initialState) => {
    const participantIds = ['__proto__', 'constructor', 'toString'];
    const participantIdRule = new RegExp(`^(?:${PARTICIPANT_ID_PATTERN})$`);
    for (const id of participantIds) expect(participantIdRule.test(id)).toBe(true);
    const violations = (description: string): ComplianceViolationsMap => {
      const rows = [{ description, reason: 'NO_DATA_UPLOADED' as const }];
      return { s1: Object.fromEntries(participantIds.map((id) => [id, rows] as const)) };
    };
    let body: ComplianceViolationsMap = initialState === 'empty' ? { s1: {} } : violations('Before refresh');
    const savedFetch = globalThis.fetch;
    globalThis.fetch = routeFetch({
      'GET /chronicle/api/web/compliance/study/s1': () => Response.json(body),
      'GET /chronicle/api/web/study/s1': () => Response.json({ id: 's1', title: 'Study One' }),
    });
    const store = createApiStore();
    const request = store.dispatch(studyOperationsApi.endpoints.getComplianceViolations.initiate('s1'));
    let refreshed: ReturnType<typeof request.refetch> | undefined;
    try {
      const initial = await request.unwrap();
      expect(Object.getPrototypeOf(initial)).toBeNull();
      expect(Object.getPrototypeOf(initial.s1)).toBeNull();
      expect(Object.keys(initial.s1 ?? {})).toEqual(initialState === 'empty' ? [] : participantIds);
      body = violations('After refresh');
      refreshed = request.refetch();
      const result = await refreshed.unwrap();
      expect(studyOperationsApi.endpoints.getComplianceViolations.select('s1')(store.getState()).data).toBe(result);
      await store.dispatch(studyOperationsApi.endpoints.getStudySummary.initiate('s1', { subscribe: false })).unwrap();
      const participantMap = result.s1 ?? {};
      const view = render(
        <Provider store={store}>
          <LanguageProvider initialSearch="">
            <MemoryRouter initialEntries={['/studies/s1/compliance']}>
              <Routes>
                <Route element={<StudyCompliancePage />} path="/studies/:studyId/compliance" />
              </Routes>
            </MemoryRouter>
          </LanguageProvider>
        </Provider>,
      );
      const renderedIds = Array.from(
        view.container.querySelectorAll('tbody tr td:first-child'),
        (cell) => cell.textContent,
      );
      expect(renderedIds).toEqual(participantIds);
      expect(Object.keys(participantMap)).toEqual(participantIds);
      for (const id of participantIds) expect(Object.hasOwn(participantMap, id)).toBe(true);
      expect(Object.getPrototypeOf(result)).toBeNull();
      expect(Object.getPrototypeOf(participantMap)).toBeNull();
    } finally {
      globalThis.fetch = savedFetch;
      cleanup();
      refreshed?.unsubscribe();
      request.unsubscribe();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  },
);
