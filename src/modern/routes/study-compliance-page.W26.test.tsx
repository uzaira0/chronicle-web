import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { LanguageProvider } from '@/i18n';
import type { ComplianceViolation, ComplianceViolationsMap } from '@/state/study-operations-api';

const rawViolation: ComplianceViolation = {
  description: 'No recent uploads',
  reason: 'NO_RECENT_DATA_UPLOADED',
};
const violations: ComplianceViolationsMap = {
  'study-1': { 'participant-7': [rawViolation] },
  'other-study': { 'other-participant': [rawViolation] },
};
let complianceMap = violations;
let notificationsEnabled = true;
const studyOperationsApiModule = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...studyOperationsApiModule,
  useGetComplianceViolationsQuery: () => ({
    data: complianceMap,
    error: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: () => Promise.resolve(),
  }),
  useGetStudySummaryQuery: () => ({ data: { id: 'study-1', title: 'Study One', notificationsEnabled } }),
}));

import { StudyCompliancePage } from './study-compliance-page';

afterEach(() => {
  cleanup();
  complianceMap = violations;
  notificationsEnabled = true;
});

function renderPage() {
  return render(
    <LanguageProvider initialSearch="">
      <MemoryRouter initialEntries={['/studies/study-1/compliance']}>
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

  test('shows a clean compliance report when email notifications are disabled', () => {
    notificationsEnabled = false;
    complianceMap = {};
    renderPage();
    expect(screen.queryByText('Compliance monitoring is off because study notifications are disabled.')).toBeNull();
    expect(screen.getByText('No compliance violations found for this study.')).toBeTruthy();
  });
});
