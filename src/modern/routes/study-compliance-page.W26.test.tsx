import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { ComplianceViolation, ComplianceViolationsMap } from '@/state/study-operations-api';
import { LanguageProvider } from '@/i18n';
import { MemoryRouter, Route, Routes } from 'react-router';

const rawViolation: ComplianceViolation = {
  description: 'No recent uploads',
  reason: 'NO_RECENT_DATA_UPLOADED',
};
const complianceMap: ComplianceViolationsMap = { 'participant-7': [rawViolation] };
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
  useGetStudySummaryQuery: () => ({ data: { id: 'study-1', title: 'Study One' } }),
}));

import { StudyCompliancePage } from './study-compliance-page';

afterEach(() => cleanup());

describe('StudyCompliancePage compliance wire shape', () => {
  test('accepts wire violations without participantId and renders the map key on the row', () => {
    render(
      <LanguageProvider initialSearch="">
        <MemoryRouter initialEntries={['/studies/study-1/compliance']}>
          <Routes>
            <Route element={<StudyCompliancePage />} path="/studies/:studyId/compliance" />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByText('participant-7')).toBeTruthy();
    expect(screen.getByText('No recent uploads')).toBeTruthy();
    expect(rawViolation).not.toHaveProperty('participantId');
  });
});
