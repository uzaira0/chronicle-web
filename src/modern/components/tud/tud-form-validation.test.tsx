import { describe, expect, mock, spyOn, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';

// Spread the real module: mock.module is process-wide, so a partial stub leaks into later files.
const realStudyOperationsApi = await import('@/state/study-operations-api');

await mock.module('@/state/study-operations-api', () => ({
  ...realStudyOperationsApi,
  useSubmitTimeUseDiaryMutation: () => [() => {}, {}],
}));

const { TimeUseDiaryForm } = await import('./tud-form');
const { resolveTudSettings } = await import('./tud-page-settings');

describe('TimeUseDiaryForm validation', () => {
  test('Next on an unanswered page focuses the first invalid field and links its message', () => {
    spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(
      <LanguageProvider initialSearch="">
        <TimeUseDiaryForm
          activityDate="2026-10-01"
          activityDay="yesterday"
          effectiveCode="en"
          participantId="p1"
          settings={resolveTudSettings(new URLSearchParams(), undefined)}
          studyId="s1"
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    const messages = screen.getAllByText('Response is required');
    expect(messages.length).toBeGreaterThan(0);
    const focused = document.activeElement as HTMLElement;
    const field = focused.closest('fieldset') ?? focused;
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(messages[0]?.id ?? null);
  });
});
