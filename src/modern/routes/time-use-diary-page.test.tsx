import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { TudSettings } from '@/components/tud/tud-flow';
import type { TudStudySettings } from '@/components/tud/tud-page-settings';
import { LanguageProvider } from '@/i18n';

let query: { currentData?: TudStudySettings; isSuccess: boolean; isError: boolean };
let retries = 0;
const configured: TudStudySettings = {
  clockFormat: 24,
  clockFormatLocked: true,
  enableChangesForOhioStateUniversity: true,
  enableChangesForSherbrookeUniversity: true,
  language: 'en',
};
const realFormModule = { ...(await import('@/components/tud/tud-form')) };
const apiModule = { ...(await import('@/state/study-operations-api')) };
const realSettingsQuery = apiModule.studyOperationsApi.useGetTimeUseDiarySettingsQuery;
await mock.module('@/state/study-operations-api', () => ({
  ...apiModule,
  useGetTimeUseDiarySettingsQuery: () => ({
    ...query,
    refetch: () => {
      retries++;
      query = { currentData: configured, isSuccess: true, isError: false };
    },
  }),
}));
await mock.module('@/components/tud/tud-form', () => ({
  TimeUseDiaryForm: ({ settings }: { settings: TudSettings }) => (
    <output data-testid="instrument">{JSON.stringify(settings)}</output>
  ),
}));

afterAll(async () => {
  cleanup();
  await mock.module('@/components/tud/tud-form', () => realFormModule);
  await mock.module('@/state/study-operations-api', () => ({
    ...apiModule,
    useGetTimeUseDiarySettingsQuery: realSettingsQuery,
  }));
});

import { TimeUseDiaryPage } from './time-use-diary-page';

const search = '?studyId=s1&participantId=p1&date=2026-10-02';
function route() {
  return (
    <LanguageProvider initialSearch={search}>
      <MemoryRouter initialEntries={[`/time-use-diary${search}`]}>
        <TimeUseDiaryPage />
      </MemoryRouter>
    </LanguageProvider>
  );
}
beforeEach(() => {
  retries = 0;
  query = { isError: true, isSuccess: false };
});
test('W07 first settings failure blocks OSU/Sherbrooke diary, retry resolves it and refresh retains it', () => {
  const view = render(route());
  expect(screen.queryByTestId('instrument')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retries).toBe(1);
  view.rerender(route());
  expect(screen.getByTestId('instrument').textContent).toContain('"enableOsu":true');
  expect(screen.getByTestId('instrument').textContent).toContain('"enableSherbrooke":true');
  query = { currentData: configured, isError: true, isSuccess: false };
  view.rerender(route());
  expect(screen.getByTestId('instrument').textContent).toContain('"clockFormat":24');
});
