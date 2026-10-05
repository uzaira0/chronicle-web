import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { LanguageProvider } from '@/i18n';

const complianceMap = Object.fromEntries(
  Array.from({ length: 300 }, (_, index) => [
    `participant-${index}`,
    [{ description: 'Missing data', reason: 'NO_DATA_UPLOADED' }],
  ]),
);

await mock.module('@/state/study-operations-api', () => ({
  useGetComplianceViolationsQuery: () => ({
    data: complianceMap,
    error: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: () => Promise.resolve(),
  }),
  useGetStudySummaryQuery: () => ({ data: { id: 's1', title: 'Study One' } }),
}));

import { StudyCompliancePage } from './study-compliance-page';

afterEach(() => cleanup());

describe('StudyCompliancePage large reports', () => {
  test('shows a bounded window and makes all 300 violations reachable with show more', () => {
    const { container } = render(
      <LanguageProvider initialSearch="">
        <MemoryRouter initialEntries={['/studies/s1/compliance']}>
          <Routes>
            <Route element={<StudyCompliancePage />} path="/studies/:studyId/compliance" />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    const visibleRows = () => container.querySelectorAll('tbody tr').length;
    expect(visibleRows()).toBe(50);
    for (const count of [100, 150, 200, 250, 300]) {
      fireEvent.click(screen.getByRole('button', { name: /Show 50 more/ }));
      expect(visibleRows()).toBe(count);
    }
    expect(screen.getByText('participant-299')).toBeTruthy();
  });
});
