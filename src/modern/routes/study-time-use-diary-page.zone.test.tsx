import { afterEach, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

// The real store and queries; only the file download (a native POST navigation) is captured.
const downloads: Array<{ startDate: string; endDate: string }> = [];
const studyOperationsApiModule = await import('@/state/study-operations-api');
await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useDownloadStudyTudDataMutation: () => [
    (args: { startDate: string; endDate: string }) => {
      downloads.push(args);
      return { unwrap: () => Promise.resolve(null) };
    },
    { isLoading: false },
  ],
}));
const { studyOperationsApi } = studyOperationsApiModule;
const { StudyTimeUseDiaryPage } = await import('./study-time-use-diary-page');

const studyId = 'tud-zone-study';
const studyPath = `/chronicle/api/web/study/${studyId}`;
const idsPath = `/chronicle/api/web/time-use-diary/${studyId}/ids`;
const santiagoStudy = () =>
  Response.json({ id: studyId, title: 'Santiago study', settings: { TimeUseDiary: { timeZone: 'America/Santiago' } } });
// Santiago skips 2026-09-06 00:00; the study day starts at 01:00 -03:00 and ends at the next midnight.
const SANTIAGO_DAY = { startDate: '2026-09-06T01:00:00.000-03:00', endDate: '2026-09-07T00:00:00.000-03:00' };

const savedFetch = globalThis.fetch;
let restoreRequest: () => void = () => undefined;
let store = createApiStore();
const searches: URLSearchParams[] = [];

function renderPage(studyRoute: () => Response | Promise<Response>) {
  restoreRequest = installRelativeRequest();
  store = createApiStore();
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: studyRoute,
    [`GET ${idsPath}`]: (request) => {
      searches.push(new URL(request.url).searchParams);
      return Response.json({ '2026-09-06': ['submission-1'] });
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/tud?from=2026-09-06&to=2026-09-06`]}>
        <Routes>
          <Route path="/studies/:studyId/tud" element={<StudyTimeUseDiaryPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

async function searchAndDownloadInStudyZone() {
  fireEvent.click(await screen.findByRole('button', { name: 'Search' }));
  await waitFor(() => expect(searches).toHaveLength(1));
  expect(Object.fromEntries(searches[0] ?? [])).toEqual({ ...SANTIAGO_DAY, timeZone: 'America/Santiago' });
  await act(async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Download all summarized data' }));
    await Promise.resolve();
  });
  expect(downloads).toHaveLength(1);
  expect(downloads[0]).toMatchObject(SANTIAGO_DAY);
}

afterEach(() => {
  cleanup();
  store.dispatch(studyOperationsApi.util.resetApiState());
  globalThis.fetch = savedFetch;
  restoreRequest();
  downloads.length = 0;
  searches.length = 0;
});

test('the diary page offers no search or export before the study zone is known', async () => {
  let resolveStudy: () => void = () => undefined;
  renderPage(() => new Promise<Response>((resolve) => (resolveStudy = () => resolve(santiagoStudy()))));
  expect(await screen.findByRole('status', { name: 'Loading study…' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  expect(searches).toHaveLength(0);
  await act(async () => {
    resolveStudy();
    await new Promise((settle) => setTimeout(settle, 0));
  });
  await searchAndDownloadInStudyZone();
});

test('a failed study load shows the error with retry, and the retried study zone is used', async () => {
  let attempts = 0;
  renderPage(() => (++attempts === 1 ? Response.json({ message: 'boom' }, { status: 500 }) : santiagoStudy()));
  expect(await screen.findByText('Failed to load study summary')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await searchAndDownloadInStudyZone();
  expect(attempts).toBe(2);
});
