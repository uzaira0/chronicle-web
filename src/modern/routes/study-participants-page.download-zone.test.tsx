import { expect, mock, test } from 'bun:test';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PARTICIPANT_DATA_TYPES } from '@/generated/chronicle-contracts';
import participant from '@/test/golden/backend-participant.json';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';

// The real store and queries; only the file download (a native POST navigation) is captured.
const downloads: Array<{ timeZone?: string; startDate?: string }> = [];
const studyOperationsApiModule = await import('@/state/study-operations-api');
await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useDownloadParticipantDataMutation: () => [
    (args: { timeZone?: string; startDate?: string }) => {
      downloads.push(args);
      return { unwrap: () => Promise.resolve(null) };
    },
    { isLoading: false },
  ],
}));
const AndroidDiagnosticsPanel = () => null;
await mock.module('@/components/android-diagnostics-panel', () => ({ AndroidDiagnosticsPanel }));
const { studyOperationsApi } = studyOperationsApiModule;
const { StudyParticipantsPage } = await import('./study-participants-page');
const { useStudyTimeZone } = await import('@/state/study-time-zone');

test.each(['America/Chicago', undefined])('a study switch loads the new zone (%p) after retry', async (zone) => {
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  let resolveStudy: (response: Response) => void = () => undefined;
  let attempts = 0;
  globalThis.fetch = routeFetch({
    'GET /chronicle/api/web/study/a': () =>
      Response.json({ id: 'a', settings: { TimeUseDiary: { timeZone: 'America/Santiago' } } }),
    'GET /chronicle/api/web/study/b': () =>
      ++attempts === 1
        ? new Promise<Response>((resolve) => {
            resolveStudy = resolve;
          })
        : Response.json({ id: 'b', settings: zone ? { TimeUseDiary: { timeZone: zone } } : {} }),
  });
  const view = renderHook(({ studyId }) => useStudyTimeZone(studyId), {
    initialProps: { studyId: 'a' },
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
  try {
    await waitFor(() => expect(view.result.current.timeZone).toBe('America/Santiago'));
    view.rerender({ studyId: 'b' });
    await waitFor(() => expect(attempts).toBe(1));
    expect(view.result.current.query.data?.id).toBe('a');
    expect(view.result.current.query.currentData).toBeUndefined();
    expect(view.result.current.timeZone).toBeUndefined();
    await act(async () => {
      resolveStudy(Response.json({}, { status: 503 }));
      await Promise.resolve();
    });
    await waitFor(() => expect(view.result.current.query.isError).toBe(true));
    expect(view.result.current.timeZone).toBeUndefined();
    await act(async () => {
      await view.result.current.query.refetch();
    });
    await waitFor(() => expect(view.result.current.timeZone).toBe(zone ?? 'UTC'));
    expect(view.result.current.query.currentData?.id).toBe('b');
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});

test('a download started before the study summary loads uses the study zone, not UTC', async () => {
  const studyId = 'zone-study';
  const participantId = participant.participantId;
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  let resolveStudy: () => void = () => undefined;
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: () =>
      new Promise<Response>((resolve) => {
        resolveStudy = () =>
          resolve(
            Response.json({
              id: studyId,
              title: 'Santiago study',
              modules: {},
              settings: { TimeUseDiary: { timeZone: 'America/Santiago' } },
            }),
          );
      }),
    [`GET ${studyPath}/participants`]: () => Response.json([participant]),
    [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
    [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
    [`GET ${studyPath}/export/availability`]: () =>
      Response.json({ dataTypes: PARTICIPANT_DATA_TYPES, timeUseDiary: false }),
  });
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
        <Routes>
          <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  try {
    fireEvent.click(await screen.findByRole('checkbox', { name: `Select participant ${participantId}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Download data (1)' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Usage Events' }));
    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: '2026-09-07' } });
    const download = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Download' });

    expect(download.disabled).toBe(true);
    fireEvent.click(download);
    expect(downloads).toHaveLength(0);
    expect(within(dialog).queryByText(/study time zone/)).toBeNull();

    await act(async () => {
      resolveStudy();
      await new Promise((settle) => setTimeout(settle, 0));
    });
    await waitFor(() => expect(download.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(download);
      await Promise.resolve();
    });
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ timeZone: 'America/Santiago', startDate: '2026-09-07' });
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
    downloads.length = 0;
  }
});

test('a failed summary refetch blocks cached study exports until retry succeeds', async () => {
  const studyId = 'zone-study-loaded';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  let failStudy = false;
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: () => {
      if (failStudy) return Response.json({ message: 'Study unavailable' }, { status: 503 });
      return Response.json({
        id: studyId,
        title: 'Santiago study',
        modules: {},
        settings: { TimeUseDiary: { timeZone: 'America/Santiago' } },
      });
    },
    [`GET ${studyPath}/participants`]: () => Response.json([participant]),
    [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
    [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
    [`GET ${studyPath}/export/availability`]: () =>
      Response.json({ dataTypes: PARTICIPANT_DATA_TYPES, timeUseDiary: false }),
  });
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
        <Routes>
          <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  try {
    fireEvent.click(await screen.findByRole('checkbox', { name: `Select participant ${participant.participantId}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Download data (1)' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Usage Events' }));
    fireEvent.change(within(dialog).getByLabelText(/^Start date/), { target: { value: '2026-09-07' } });
    const download = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Download' });
    await waitFor(() => expect(download.disabled).toBe(false));
    failStudy = true;
    await act(async () => {
      await store.dispatch(studyOperationsApi.endpoints.getStudySummary.initiate(studyId, { forceRefetch: true }));
    });
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(download.disabled).toBe(true);
    fireEvent.click(download);
    expect(downloads).toHaveLength(0);
    failStudy = false;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(download.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Download' }));
      await Promise.resolve();
    });
    expect(downloads.map((args) => args.timeZone)).toEqual(['America/Santiago']);
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
    downloads.length = 0;
  }
});
