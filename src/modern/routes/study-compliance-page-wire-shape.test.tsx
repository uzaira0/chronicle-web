import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { LanguageProvider } from '@/i18n';
import type { ComplianceViolationsMap } from '@/state/study-operations-api';
import type { components } from '@/types/chronicle-api.generated';

const rawViolation: components['schemas']['ComplianceViolation'] = {
  description: 'No recent uploads',
  reason: 'NO_RECENT_DATA_UPLOADED',
};
const violations: ComplianceViolationsMap = {
  'study-1': { 'participant-7': [rawViolation] },
  'other-study': { 'other-participant': [rawViolation] },
};
let complianceMap = violations;
let complianceError: unknown;
let refreshes = 0;
const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetComplianceViolationsQuery: () => ({
    data: complianceError ? undefined : complianceMap,
    error: complianceError,
    isError: complianceError !== undefined,
    isFetching: false,
    isLoading: false,
    refetch: () => {
      refreshes += 1;
      return {
        unwrap: () =>
          Promise.resolve().then(() => {
            if (complianceError) throw complianceError as unknown;
            return complianceMap;
          }),
      };
    },
  }),
  useGetStudySummaryQuery: () => ({ data: { id: 'study-1', title: 'Study One' } }),
}));

import { StudyCompliancePage } from './study-compliance-page';

afterEach(() => {
  cleanup();
  complianceMap = violations;
  complianceError = undefined;
  refreshes = 0;
});

function SearchState() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderPage(entry = '/studies/study-1/compliance') {
  return render(
    <LanguageProvider initialSearch="">
      <MemoryRouter initialEntries={[entry]}>
        <SearchState />
        <Routes>
          <Route element={<StudyCompliancePage />} path="/studies/:studyId/compliance" />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

describe('StudyCompliancePage compliance wire shape', () => {
  test('accepts wire violations without participantId and renders the map key on the row', () => {
    renderPage();

    expect(screen.getByText('participant-7')).toBeTruthy();
    expect(screen.getByText('No recent uploads')).toBeTruthy();
    expect(rawViolation).not.toHaveProperty('participantId');
    expect(screen.queryByText('other-participant')).toBeNull();
  });

  // Each reason is named in the researcher's words, a participant with no data at all stands out from one who is
  // not enrolled, and a reason a newer server adds is still readable rather than dropped.
  test('names every violation reason and keeps a newer server reason readable', () => {
    complianceMap = {
      'study-1': {
        'p-no-data': [{ description: 'Never uploaded', reason: 'NO_DATA_UPLOADED' }],
        'p-not-enrolled': [{ description: 'Enrollment link unused', reason: 'NOT_ENROLLED' }],
        'p-future': [
          {
            description: 'Phone replaced',
            reason: 'DEVICE_REPLACED' as components['schemas']['ComplianceViolation']['reason'],
          },
        ],
      },
    };
    renderPage();
    const reason = (participantId: string) =>
      screen.getByText(participantId).closest('tr')?.querySelectorAll('td')[1]?.firstElementChild as HTMLElement;
    expect(reason('p-no-data').textContent).toBe('No data uploaded');
    expect(reason('p-not-enrolled').textContent).toBe('Not enrolled');
    expect(reason('p-future').textContent).toBe('DEVICE REPLACED');
    expect(reason('p-no-data').className).toContain('text-destructive');
    expect(reason('p-not-enrolled').className).not.toContain('text-destructive');
    expect(reason('p-not-enrolled').className).not.toBe(reason('p-future').className);
  });

  // A compliance read that fails shows why, never an empty "no violations" report; Refresh asks the server again.
  test('a failed compliance read shows the failure instead of a clean report, and Refresh retries', async () => {
    complianceError = { status: 503, data: { message: 'Compliance service unavailable' } };
    renderPage();
    expect(screen.getByText('Failed to load compliance data')).toBeTruthy();
    expect(screen.getByText('Compliance service unavailable')).toBeTruthy();
    expect(screen.queryByText('No compliance violations found for this study.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await Promise.resolve();
    expect(refreshes).toBe(1);
  });

  test('shows a clean compliance report when nothing is violated', () => {
    complianceMap = {};
    renderPage();
    expect(screen.getByText('No compliance violations found for this study.')).toBeTruthy();
  });
});

test('compliance restores revealed rows from the URL and preserves participant identifiers', () => {
  complianceMap = {
    'study-1': Object.fromEntries(Array.from({ length: 120 }, (_, index) => [`person-${index}`, [rawViolation]])),
  };
  renderPage('/studies/study-1/compliance?page=2');
  expect(screen.getByText('person-99').closest('td')?.getAttribute('translate')).toBe('no');
  expect(screen.queryByText('person-100')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Show/ }));
  expect(new URLSearchParams(screen.getByTestId('search').textContent ?? '').get('page')).toBe('3');
  expect(screen.getByText('person-119')).toBeTruthy();
});
