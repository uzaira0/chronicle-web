import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/i18n';
import { AppUsageDayPicker } from './app-usage-day-picker';
import { AppUsageSurveyDate } from './app-usage-survey';

// `?lang=` sets the module-level language that code outside React reads (getCurrentLanguage);
// put English back so later test files do not render Spanish.
afterEach(() => {
  cleanup();
  render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>);
  cleanup();
});

function renderPicker(search: string) {
  render(
    <LanguageProvider initialSearch={search}>
      <AppUsageDayPicker
        days={[{ date: '2026-10-28', state: 'UNANSWERED' }]}
        onSelect={() => undefined}
        selected="2026-10-28"
      />
    </LanguageProvider>,
  );
}

describe('AppUsageDayPicker', () => {
  // The month title and the day labels share one locale: the picked language, not the browser's.
  test('day labels follow the picked language like the month title', () => {
    renderPicker('?lang=es');
    expect(screen.getByText('octubre de 2026')).toBeDefined();
    const day = screen.getByRole('button', { name: /^28 oct 2026: Sin responder$/ });
    expect(day.getAttribute('aria-pressed')).toBe('true');
  });

  test('English keeps English day labels', () => {
    renderPicker('?lang=en');
    expect(screen.getByText('October 2026')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Oct 28, 2026: Not answered' })).toBeDefined();
  });

  test('the survey date heading uses the same picked language', () => {
    render(
      <LanguageProvider initialSearch="?lang=es">
        <AppUsageSurveyDate date="2026-10-28" />
      </LanguageProvider>,
    );
    expect(screen.getByText('28 oct 2026')).toBeDefined();
  });

  // Sparse server days across a year end and a leap February stay reachable month by month, the
  // arrows stop at the first and last listed month, and only listed days can be opened.
  test('navigates sparse server days across December, January and a leap February', () => {
    const opened: string[] = [];
    render(
      <LanguageProvider initialSearch="?lang=en">
        <AppUsageDayPicker
          days={[
            { date: '2027-12-30', state: 'UNANSWERED' },
            { date: '2028-01-02', state: 'ANSWERED' },
            { date: '2028-02-29', state: 'NEW_APPS' },
          ]}
          onSelect={(date) => opened.push(date)}
          selected="2028-01-02"
        />
      </LanguageProvider>,
    );
    const previous = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Previous month' });
    const next = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Next month' });
    const dayButtons = () =>
      screen.getAllByRole<HTMLButtonElement>('button').filter((b) => /^\d+$/.test(b.textContent ?? ''));
    const enabledDays = () =>
      dayButtons()
        .filter((b) => !b.disabled)
        .map((b) => b.title);

    // 1 January 2028 is a Saturday: the sixth column of a Monday-first week.
    expect(screen.getByText('January 2028')).toBeDefined();
    expect(dayButtons()).toHaveLength(31);
    expect(dayButtons()[0]?.className).toContain('col-start-6');
    expect(enabledDays()).toEqual(['Jan 2, 2028: Answered']);
    expect(previous().disabled).toBe(false);
    expect(next().disabled).toBe(false);

    fireEvent.click(previous());
    expect(screen.getByText('December 2027')).toBeDefined();
    expect(dayButtons()[0]?.className).toContain('col-start-3');
    expect(previous().disabled).toBe(true);
    expect(enabledDays()).toEqual(['Dec 30, 2027: Not answered']);
    fireEvent.click(screen.getByRole('button', { name: 'Dec 31, 2027' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dec 30, 2027: Not answered' }));
    expect(opened).toEqual(['2027-12-30']);

    fireEvent.click(next());
    fireEvent.click(next());
    expect(screen.getByText('February 2028')).toBeDefined();
    expect(dayButtons()).toHaveLength(29);
    expect(dayButtons()[0]?.className).toContain('col-start-2');
    expect(next().disabled).toBe(true);
    expect(enabledDays()).toEqual(['Feb 29, 2028: New apps to answer']);
  });
});
