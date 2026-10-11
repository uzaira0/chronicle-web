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

function leaveIsBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('TimeUseDiaryForm leave guard', () => {
  test('asks before a reload once started, and opens each page at its top', () => {
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
    expect(leaveIsBlocked()).toBe(false);
    const scrollTo = spyOn(window, 'scrollTo').mockImplementation(() => {});

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(leaveIsBlocked()).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    scrollTo.mockRestore();
  });

  test('keeps asking after Back to the intro while answers are held', () => {
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
    const choice = screen.queryAllByRole('radio')[0] ?? screen.getAllByRole('checkbox')[0];
    if (!choice) throw new Error('page 1 has no answerable control');
    fireEvent.click(choice);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    expect(leaveIsBlocked()).toBe(true);
  });
});
