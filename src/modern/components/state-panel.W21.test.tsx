import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { QueryStatus } from '@reduxjs/toolkit/query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LanguageProvider } from '@/i18n';
import { StudyBulkDownloadsPage } from '@/routes/study-bulk-downloads-page';
import { StudyDetailsPage } from '@/routes/study-details-page';
import { StudyParticipantsPage } from '@/routes/study-participants-page';
import { StudySettingsAuditPage } from '@/routes/study-settings-audit-page';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { StatePanel } from './state-panel';

const originalFetch = globalThis.fetch;
let restoreRequest: () => void;
const studyPath = '/chronicle/api/web/study/recovery';
const study = { id: 'recovery', title: 'Recovered study', modules: {}, settings: {} };
const participants = [
  {
    candidate: { id: 'c1' },
    participantId: 'Recovered participant',
    participantTags: [],
    participationStatus: 'ENROLLED',
  },
];

beforeEach(() => {
  restoreRequest = installRelativeRequest();
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  restoreRequest();
});

describe('query error recovery', () => {
  test.each([
    {
      name: 'participants',
      Page: StudyParticipantsPage,
      path: `${studyPath}/participants`,
      body: participants,
      recovered: () => expect(screen.getByText('Recovered participant')).toBeTruthy(),
    },
    {
      name: 'overview participant counts',
      Page: StudyDetailsPage,
      path: `${studyPath}/participants`,
      body: participants,
      recovered: () => expect(screen.getByText('Total Participants').nextElementSibling?.textContent).toBe('1'),
    },
    {
      name: 'settings audit',
      Page: StudySettingsAuditPage,
      path: `${studyPath}/settings/audit`,
      body: [
        {
          id: 'a1',
          changedAt: '2026-10-06T12:00:00Z',
          changedBy: 'Recovered researcher',
          settingKey: 'DataCollection',
          changeSummary: 'Recovered change',
        },
      ],
      recovered: () => expect(screen.getByText('Recovered change')).toBeTruthy(),
    },
    {
      name: 'export history',
      Page: StudyBulkDownloadsPage,
      path: `${studyPath}/export`,
      body: [
        {
          exportId: 'recovered-export',
          studyId: 'recovery',
          createdAt: '2026-10-06T12:00:00Z',
          format: 'CSV',
          status: 'COMPLETED',
          rowCount: 1,
        },
      ],
      recovered: () => expect(screen.getByText('recovered-export')).toBeTruthy(),
    },
    {
      name: 'download study details',
      Page: StudyBulkDownloadsPage,
      path: studyPath,
      body: study,
      recovered: () => expect(screen.getByRole('heading', { name: /Recovered study/ })).toBeTruthy(),
    },
  ])('$name retries a failed request and displays the recovered response', async ({ Page, path, body, recovered }) => {
    let calls = 0;
    let resolveRetry: ((response: Response) => void) | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const requestPath = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname;
      if (requestPath === path) {
        calls++;
        if (calls === 1) return new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
        return new Promise<Response>((resolve) => {
          resolveRetry = resolve;
        });
      }
      const defaults = new Map<string, unknown>([
        [studyPath, study],
        [`${studyPath}/settings/type/DataCollection`, { modules: {} }],
        [`${studyPath}/participants/stats`, {}],
      ]);
      const data = defaults.get(requestPath) ?? [];
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const store = createApiStore();
    render(
      <Provider store={store}>
        <LanguageProvider initialSearch="">
          <MemoryRouter initialEntries={['/studies/recovery']}>
            <Routes>
              <Route path="/studies/:studyId" element={<Page />} />
            </Routes>
          </MemoryRouter>
        </LanguageProvider>
      </Provider>,
    );
    try {
      const retry = await screen.findByRole<HTMLButtonElement>('button', { name: 'Try again' });
      expect(calls).toBe(1);
      expect(retry.disabled).toBe(false);
      fireEvent.click(retry);
      await waitFor(() => expect(calls).toBe(2));
      expect(resolveRetry).toBeDefined();
      expect(
        Object.values(store.getState().studyOperationsApi.queries).some(
          (query) => query?.status === QueryStatus.pending,
        ),
      ).toBe(true);
      await act(async () => {
        resolveRetry?.(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }));
        await Promise.resolve();
      });
      await waitFor(recovered);
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    } finally {
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test('StatePanel disables a busy retry and enables it when the request settles', () => {
    const retry = mock(() => undefined);
    const panel = (isRetrying: boolean) => (
      <LanguageProvider initialSearch="">
        <StatePanel
          description="The request failed."
          icon={<span />}
          isRetrying={isRetrying}
          onRetry={retry}
          title="Failed to load"
          tone="destructive"
        />
      </LanguageProvider>
    );
    const view = render(panel(true));
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Try again' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
    view.rerender(panel(false));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
