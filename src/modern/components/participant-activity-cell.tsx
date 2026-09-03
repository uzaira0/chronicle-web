import { useTranslator } from '@/i18n';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/format';
import type { ParticipantStats } from '@/state/study-operations-api';

const STALE_AFTER_DAYS = 7;

type ActivityStream = {
  days: number;
  first: string | null | undefined;
  label: string;
  last: string | null | undefined;
  unit: 'days' | 'entries';
};

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * One column replacing the nine sparse per-platform date columns.
 *
 * The table previously carried Android/iOS/TUD × (first, last, count). Any given
 * participant reports on one platform, so most of that grid was em-dashes and the
 * rows grew three lines tall wrapping timestamps. Here each participant shows only
 * the streams that actually have data, and a stream with no recent upload is called
 * out — which is the thing worth scanning for.
 */
const UNIT_KEYS = {
  days: { one: 'activity_cell.day', other: 'activity_cell.days' },
  entries: { one: 'activity_cell.entry', other: 'activity_cell.entries' },
} as const;

export function ParticipantActivityCell({ hasTud, ps }: { hasTud: boolean; ps?: ParticipantStats | undefined }) {
  const { t } = useTranslator();
  const streams: ActivityStream[] = [
    {
      label: t('common.android'),
      unit: 'days' as const,
      days: ps?.androidUniqueDates.length ?? 0,
      first: ps?.androidFirstDate,
      last: ps?.androidLastPing,
    },
    {
      label: t('common.ios'),
      unit: 'days' as const,
      days: ps?.iosUniqueDates.length ?? 0,
      first: ps?.iosFirstDate,
      last: ps?.iosLastPing,
    },
    ...(hasTud
      ? [
          {
            label: t('activity_cell.diary'),
            unit: 'entries' as const,
            days: ps?.tudUniqueDates.length ?? 0,
            first: ps?.tudFirstDate,
            last: ps?.tudLastDate,
          },
        ]
      : []),
  ].filter((stream) => stream.days > 0 || Boolean(stream.first) || Boolean(stream.last));

  if (streams.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('activity_cell.no_data')}</span>;
  }

  return (
    <div className="space-y-0.5">
      {streams.map((stream) => {
        const idle = daysSince(stream.last);
        const stale = idle !== null && idle > STALE_AFTER_DAYS;
        return (
          <div className="flex items-baseline gap-2 text-xs" key={stream.label}>
            <span className="w-14 shrink-0 font-medium">{stream.label}</span>
            <span className="w-16 shrink-0 tabular-nums text-muted-foreground">
              {stream.days} {t(stream.days === 1 ? UNIT_KEYS[stream.unit].one : UNIT_KEYS[stream.unit].other)}
            </span>
            <span
              className={stale ? 'text-[var(--eq-warning)]' : 'text-muted-foreground'}
              title={
                stream.last ? t('activity_cell.last_upload', { time: formatDisplayDateTime(stream.last) }) : undefined
              }
            >
              {stream.first ? formatDisplayDate(stream.first) : '?'}
              {' → '}
              {stream.last ? formatDisplayDate(stream.last) : '?'}
              {stale ? ` ${t('activity_cell.idle', { days: String(idle) })}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
