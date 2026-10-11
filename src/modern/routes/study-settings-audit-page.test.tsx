import { afterEach, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { StudySettingsAuditEntry } from '@/state/study-operations-api';

const entry: StudySettingsAuditEntry = {
  id: 'change-1',
  studyId: 'study-1',
  changedAt: '2026-10-07T10:00:00Z',
  changedBy: 'researcher',
  settingKey: 'DataCollection',
  beforeValue: { enabled: false },
  afterValue: { enabled: true },
};
const apiModule = await import('@/state/study-operations-api');
// Spread the real module: mock.module is process-wide, so a partial stub leaks into later files.
const realStudyOperationsApi = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...realStudyOperationsApi,
  ...apiModule,
  useGetStudySummaryQuery: () => ({ data: { id: entry.studyId, title: 'Audit study' } }),
  useGetStudySettingsAuditQuery: () => ({ data: [entry] }),
  useGetStudyCollectionAcknowledgmentsQuery: () => ({ data: [] }),
}));
await mock.module('@/components/api-keys-panel', () => ({ ApiKeysPanel: () => null }));
const { StudySettingsAuditPage } = await import('./study-settings-audit-page');

afterEach(cleanup);

test('audit details have a named native button with expanded state', () => {
  render(
    <MemoryRouter initialEntries={['/studies/study-1/audit']}>
      <Routes>
        <Route element={<StudySettingsAuditPage />} path="/studies/:studyId/audit" />
      </Routes>
    </MemoryRouter>,
  );
  const toggle = screen.getByRole('button', { name: 'Toggle details for DataCollection' });
  expect(toggle.tagName).toBe('BUTTON');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Before')).toBeNull();
  toggle.focus();
  expect(document.activeElement).toBe(toggle);
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/"enabled": false/)).toBeTruthy();
  expect(screen.getByText(/"enabled": true/)).toBeTruthy();
});
