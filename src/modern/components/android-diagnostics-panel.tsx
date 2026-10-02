import { Download, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDateTime } from '@/lib/format';
import {
  type AndroidDiagnosticCodeSummary,
  type AndroidDiagnosticsHistoryRow,
  exportRangeExceedsLimit,
  useDownloadParticipantDataMutation,
  useGetAndroidDiagnosticsQuery,
} from '@/state/study-operations-api';

const MODULE_FAMILIES = [
  'USAGE_LIFECYCLE',
  'BATTERY',
  'DEVICE_TELEMETRY',
  'SENSOR',
  'APP_RUNTIME',
  'INTERACTION',
  'AUDIO_ACTIVITY',
  'AUDIO_CONTENT',
  'NOTIFICATION',
  'SLEEP',
  'ACTIVITY_RECOGNITION',
  'HEALTH',
  'CONNECTIVITY',
  'APP_NETWORK',
  'DEVICE_SETTINGS',
  'LOCAL_STORE',
] as const;

const CATEGORY_ORDER = ['data_loss', 'quarantined', 'upload_failures', 'app_crashes', 'collection_paused'] as const;
type DiagnosticCategory = (typeof CATEGORY_ORDER)[number];

/** `YYYY-MM-DD` in the viewer's time zone, the format date inputs use. */
function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function categoryFor(code: string): DiagnosticCategory {
  if (code === 'COLLECTION_PAUSED_STORAGE' || code === 'COLLECTION_ACCESS_MISSING') return 'collection_paused';
  if (code === 'APP_CRASH' || code === 'APP_CRASH_NATIVE' || code === 'APP_ANR') return 'app_crashes';
  if (code.includes('QUARANTINED') || code === 'DIRECT_BOOT_CORRUPT_RECORD') return 'quarantined';
  if (
    code.startsWith('DESTINATION_') ||
    code.startsWith('HTTP_') ||
    ['TIMEOUT', 'DNS_FAILURE', 'TLS_FAILURE', 'CONNECTION_FAILURE', 'UPLOAD_FAILURE'].includes(code)
  )
    return 'upload_failures';
  return 'data_loss';
}

function groupedCodes(codes: AndroidDiagnosticCodeSummary[]) {
  const groups = new Map<string, AndroidDiagnosticCodeSummary & { count: number }>();
  for (const code of codes) {
    const key = `${categoryFor(code.issueCode)}:${code.issueCode}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += code.occurrenceCount;
      if (Date.parse(code.firstOccurredAt) < Date.parse(existing.firstOccurredAt)) {
        existing.firstOccurredAt = code.firstOccurredAt;
      }
      if (Date.parse(code.lastOccurredAt) > Date.parse(existing.lastOccurredAt)) {
        existing.lastOccurredAt = code.lastOccurredAt;
      }
    } else {
      groups.set(key, { ...code, count: code.occurrenceCount });
    }
  }
  return [...groups.values()].sort((left, right) => {
    const categoryOrder =
      CATEGORY_ORDER.indexOf(categoryFor(left.issueCode)) - CATEGORY_ORDER.indexOf(categoryFor(right.issueCode));
    return categoryOrder || left.issueCode.localeCompare(right.issueCode);
  });
}

function HistoryRow({ row }: { row: AndroidDiagnosticsHistoryRow }) {
  const { t } = useTranslator();
  if (row.dataQualityAlert) {
    return (
      <div className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{t('participants.diagnostics_quality_alert')}</span>
          <span className="text-xs text-muted-foreground">{formatDisplayDateTime(row.dataQualityAlert.createdAt)}</span>
        </div>
        <p className="mt-1 text-sm">
          {row.dataQualityAlert.alertType} · {row.dataQualityAlert.score.toFixed(1)}%
        </p>
      </div>
    );
  }

  const codes = groupedCodes(row.codes);
  if (codes.length === 0) return null;
  const firstCode = codes[0];
  if (!firstCode) return null;
  const first = codes.reduce(
    (value, code) => (Date.parse(code.firstOccurredAt) < Date.parse(value) ? code.firstOccurredAt : value),
    firstCode.firstOccurredAt,
  );
  const latest = codes.reduce(
    (value, code) => (Date.parse(code.lastOccurredAt) > Date.parse(value) ? code.lastOccurredAt : value),
    firstCode.lastOccurredAt,
  );
  const categories = CATEGORY_ORDER.filter((category) =>
    codes.some((code) => categoryFor(code.issueCode) === category),
  );

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{row.day}</p>
          <p className="text-xs text-muted-foreground">
            {t('participants.diagnostics_device')}: {row.deviceId ?? t('participants.diagnostics_unknown_device')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('participants.diagnostics_first_latest', {
            first: formatDisplayDateTime(first),
            latest: formatDisplayDateTime(latest),
          })}
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {categories.map((category) => (
          <section key={category}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`participants.diagnostics_category_${category}`)}
            </h4>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {codes
                .filter((code) => categoryFor(code.issueCode) === category)
                .map((code) => (
                  <li
                    className="rounded bg-muted px-2 py-1 font-mono text-xs"
                    key={`${code.moduleFamily}:${code.issueCode}`}
                  >
                    {code.issueCode} · {code.count.toLocaleString()}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function HistoryContent({
  isError,
  isLoading,
  rows,
}: {
  isError: boolean;
  isLoading: boolean;
  rows: AndroidDiagnosticsHistoryRow[];
}) {
  const { t } = useTranslator();
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('participants.diagnostics_loading')}</p>;
  if (isError) return <p className="text-sm text-destructive">{t('participants.diagnostics_load_failed')}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('participants.diagnostics_empty')}</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <HistoryRow key={`${row.day}:${row.deviceId ?? 'alert'}:${row.dataQualityAlert?.alertId ?? index}`} row={row} />
      ))}
    </div>
  );
}

export function AndroidDiagnosticsPanel({ participantId, studyId }: { participantId: string; studyId: string }) {
  const { t } = useTranslator();
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [moduleFamily, setModuleFamily] = useState('');
  const [issueCode, setIssueCode] = useState('');
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const cursor = pageCursors[pageCursors.length - 1];
  const query = useGetAndroidDiagnosticsQuery({
    studyId,
    participantId,
    ...(fromDay ? { fromDay } : {}),
    ...(toDay ? { toDay } : {}),
    ...(deviceId.trim() ? { deviceId: deviceId.trim() } : {}),
    ...(moduleFamily ? { moduleFamily } : {}),
    ...(issueCode.trim() ? { issueCode: issueCode.trim() } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const nextCursor = query.data?.nextCursor;
  const [downloadData, { isLoading: isDownloading }] = useDownloadParticipantDataMutation();
  const rows = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  const updateFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPageCursors([undefined]);
  };

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      // The synchronous export takes at most 31 days; default to the last 30 when no range is set.
      const today = new Date();
      const monthAgo = new Date(today);
      monthAgo.setDate(today.getDate() - 29);
      const startDate = fromDay || localDay(monthAgo);
      const endDate = toDay || localDay(today);
      if (exportRangeExceedsLimit(startDate, endDate)) {
        setDownloadError(t('download_modal.range_too_long'));
        return;
      }
      await downloadData({
        dataType: 'UploadDiagnostics',
        endDate,
        participantIds: [participantId],
        startDate,
        studyId,
      }).unwrap();
    } catch (error) {
      setDownloadError(getErrorMessage(error, t('participants.diagnostics_download_failed')));
    }
  };

  return (
    <section
      aria-label={t('participants.diagnostics_title')}
      className="space-y-3 rounded-lg border border-border bg-card/70 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('participants.diagnostics_title')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('participants.diagnostics_description')}</p>
          <p className="text-xs text-muted-foreground">{t('participants.diagnostics_download_hint')}</p>
        </div>
        <Button disabled={isDownloading} onClick={() => void handleDownload()} size="sm" variant="outline">
          {isDownloading ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t('participants.diagnostics_download')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor={`diagnostics-from-${participantId}`}>{t('participants.diagnostics_from')}</Label>
          <Input
            id={`diagnostics-from-${participantId}`}
            onChange={(event) => updateFilter(setFromDay)(event.target.value)}
            type="date"
            value={fromDay}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`diagnostics-to-${participantId}`}>{t('participants.diagnostics_to')}</Label>
          <Input
            id={`diagnostics-to-${participantId}`}
            onChange={(event) => updateFilter(setToDay)(event.target.value)}
            type="date"
            value={toDay}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`diagnostics-device-${participantId}`}>{t('participants.diagnostics_device_filter')}</Label>
          <Input
            id={`diagnostics-device-${participantId}`}
            onChange={(event) => updateFilter(setDeviceId)(event.target.value)}
            placeholder={t('participants.diagnostics_device_placeholder')}
            value={deviceId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`diagnostics-module-${participantId}`}>{t('participants.diagnostics_module_family')}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            id={`diagnostics-module-${participantId}`}
            onChange={(event) => updateFilter(setModuleFamily)(event.target.value)}
            value={moduleFamily}
          >
            <option value="">{t('participants.diagnostics_any')}</option>
            {MODULE_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`diagnostics-issue-${participantId}`}>{t('participants.diagnostics_issue_code')}</Label>
          <Input
            id={`diagnostics-issue-${participantId}`}
            onChange={(event) => updateFilter(setIssueCode)(event.target.value)}
            placeholder={t('participants.diagnostics_issue_placeholder')}
            value={issueCode}
          />
        </div>
      </div>

      {downloadError && <p className="text-sm text-destructive">{downloadError}</p>}
      <HistoryContent isError={query.isError} isLoading={query.isLoading} rows={rows} />

      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button
          disabled={pageCursors.length <= 1 || query.isFetching}
          onClick={() => setPageCursors((current) => current.slice(0, -1))}
          size="sm"
          variant="outline"
        >
          {t('participants.diagnostics_previous')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('participants.diagnostics_page', { page: String(pageCursors.length) })}
        </span>
        <Button
          disabled={!nextCursor || query.isFetching}
          onClick={() => {
            if (nextCursor) setPageCursors((current) => [...current, nextCursor]);
          }}
          size="sm"
          variant="outline"
        >
          {t('participants.diagnostics_next')}
        </Button>
      </div>
    </section>
  );
}
