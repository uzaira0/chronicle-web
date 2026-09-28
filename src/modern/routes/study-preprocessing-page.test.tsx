import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { HOSTED_PREPROCESSING_GUI_URL, PREPROCESSING_GUI_PATH } from '@/lib/preprocessing-gui';

const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetStudySummaryQuery: () => ({
    data: { id: 'study-1', modules: { CHRONICLE_DATA_COLLECTION: {} }, title: 'Pilot' },
    error: undefined,
    isError: false,
    isLoading: false,
    refetch: () => undefined,
  }),
}));

const { StudyPreprocessingPage } = await import('./study-preprocessing-page');
const realFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function renderWithGuiResponse(body: string) {
  globalThis.fetch = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
  render(
    <MemoryRouter initialEntries={['/study/study-1/preprocessing']}>
      <Routes>
        <Route element={<StudyPreprocessingPage />} path="/study/:studyId/preprocessing" />
      </Routes>
    </MemoryRouter>,
  );
}

test('without a local service the button opens the hosted app', async () => {
  // The dashboard's SPA catch-all answering for the missing route.
  renderWithGuiResponse('<div id="app"></div><title>Chronicle</title>');
  const link = await screen.findByRole('link', { name: /open preprocessing gui/i });
  expect(link.getAttribute('href')).toBe(HOSTED_PREPROCESSING_GUI_URL);
});

test('with a local service the button opens it', async () => {
  renderWithGuiResponse('<title>Preprocessing</title>');
  const link = await screen.findByRole('link', { name: /open preprocessing gui/i });
  expect(link.getAttribute('href')).toStartWith(PREPROCESSING_GUI_PATH);
});
