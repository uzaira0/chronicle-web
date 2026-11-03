import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AppUsageDayState } from '@/generated/chronicle-contracts';
import { useTranslator } from '@/i18n';
import { formatDisplayDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppUsageSurveyDays } from '@/state/study-operations-api';

const STATE_STYLE: Record<AppUsageDayState, string> = {
  ANSWERED: 'border-border bg-muted text-muted-foreground',
  NEW_APPS: 'border-amber-500 bg-amber-50 text-foreground dark:bg-amber-950',
  UNANSWERED: 'border-primary bg-primary/10 text-foreground',
};

/** Grid column of a month's first day, Monday = 0; literal classes so Tailwind emits them. */
const FIRST_COLUMN = [
  'col-start-1',
  'col-start-2',
  'col-start-3',
  'col-start-4',
  'col-start-5',
  'col-start-6',
  'col-start-7',
];

/** 'YYYY-MM' of a 'YYYY-MM-DD' day, shifted by [months]. */
function monthOf(day: string, months = 0): string {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

/** The month's days, and the weekday (Monday = 0) its first day falls on. */
function monthGrid(month: string): { days: string[]; firstColumn: number } {
  const first = new Date(`${month}-01T00:00:00Z`);
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    days: Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
    firstColumn: (first.getUTCDay() + 6) % 7,
  };
}

/**
 * Calendar of the participant's survey days: each ended day the server lists is marked unanswered, answered
 * or new apps and can be opened; other days cannot.
 */
export function AppUsageDayPicker({
  days,
  selected,
  onSelect,
}: {
  days: AppUsageSurveyDays['days'];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { t, effectiveCode } = useTranslator();
  const [month, setMonth] = useState(() => monthOf(selected));
  const states = new Map(days.map((day) => [day.date, day.state]));
  const first = days[0]?.date;
  const last = days.at(-1)?.date;
  const stateLabel = (state: AppUsageDayState) => t(`app_usage_survey.day_state.${state.toLowerCase()}`);
  const grid = monthGrid(month);
  const monthTitle = new Intl.DateTimeFormat(effectiveCode, { month: 'long', timeZone: 'UTC', year: 'numeric' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  return (
    <section aria-label={t('app_usage_survey.day_picker_label')} className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <Button
          aria-label={t('app_usage_survey.previous_month')}
          disabled={!first || month <= monthOf(first)}
          onClick={() => setMonth(monthOf(month, -1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p aria-live="polite" className="text-sm font-semibold">
          {monthTitle}
        </p>
        <Button
          aria-label={t('app_usage_survey.next_month')}
          disabled={!last || month >= monthOf(last)}
          onClick={() => setMonth(monthOf(month, 1))}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.days.map((day, index) => {
          const state = states.get(day);
          const date = formatDisplayDate(day, effectiveCode);
          const label = state ? `${date}: ${stateLabel(state)}` : date;
          return (
            <button
              aria-label={label}
              aria-pressed={day === selected}
              className={cn(
                'h-10 rounded-md border text-sm enabled:hover:underline disabled:cursor-not-allowed disabled:border-transparent disabled:opacity-40',
                state && STATE_STYLE[state],
                day === selected && 'ring-2 ring-ring ring-offset-1',
                index === 0 && FIRST_COLUMN[grid.firstColumn],
              )}
              disabled={!state}
              key={day}
              onClick={() => onSelect(day)}
              title={label}
              type="button"
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(['UNANSWERED', 'NEW_APPS', 'ANSWERED'] as const).map((state) => (
          <li className="flex items-center gap-1" key={state}>
            <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-sm border', STATE_STYLE[state])} />
            {stateLabel(state)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The day a survey link opens: the linked day if listed, else the oldest with apps to answer, else the latest. */
export function defaultSurveyDay(days: AppUsageSurveyDays['days'], linked: string | null): string | undefined {
  if (linked && days.some((day) => day.date === linked)) return linked;
  return (days.find((day) => day.state !== 'ANSWERED') ?? days.at(-1))?.date;
}
