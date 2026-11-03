import { CircleAlert, Download, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ANDROID_UPLOAD_ISSUE_CATEGORIES } from '@/generated/chronicle-contracts';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDateTime, localDay } from '@/lib/format';
import { ANDROID_DIAGNOSTIC_FAMILIES } from '@/lib/study-constants';
import { toSyncExportSelection } from '@/lib/sync-export-selection';
import { useSearchParamsUpdate } from '@/lib/use-list-search-params';
import {
  type AndroidDiagnosticCodeSummary,
  type AndroidDiagnosticsHistoryRow,
  useDownloadParticipantDataMutation,
  useGetAndroidDiagnosticsQuery,
} from '@/state/study-operations-api';
import { useStudyTimeZone } from '@/state/study-time-zone';

type DiagnosticCategory = (typeof ANDROID_UPLOAD_ISSUE_CATEGORIES)[keyof typeof ANDROID_UPLOAD_ISSUE_CATEGORIES];
const CATEGORY_ORDER: readonly DiagnosticCategory[] = [
  'data_loss',
  'quarantined',
  'upload_failures',
  'app_crashes',
  'collection_paused',
];

/** The generated issue-code catalog owns each code's category; retired codes count as lost data. */
function categoryFor(code: string): DiagnosticCategory {
  return Object.hasOwn(ANDROID_UPLOAD_ISSUE_CATEGORIES, code)
    ? ANDROID_UPLOAD_ISSUE_CATEGORIES[code as keyof typeof ANDROID_UPLOAD_ISSUE_CATEGORIES]
    : 'data_loss';
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
            {t('participants.diagnostics_device')}: {row.randomDeviceId ?? t('participants.diagnostics_unknown_device')}
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
                    className="rounded bg-muted px-2 py-1 text-xs"
                    key={`${code.moduleFamily}:${code.issueCode}`}
                    title={code.issueCode}
                  >
                    {translateCatalog(t, 'upload_issue', code.issueCode, code.issueCode)} ·{' '}
                    {code.count.toLocaleString()}
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
  onRetry,
}: {
  onRetry: () => unknown;
  isError: boolean;
  isLoading: boolean;
  rows: AndroidDiagnosticsHistoryRow[];
}) {
  const { t } = useTranslator();
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('participants.diagnostics_loading')}</p>;
  if (isError)
    return (
      <StatePanel
        description={t('participants.diagnostics_load_failed')}
        icon={<CircleAlert className="h-5 w-5" />}
        onRetry={onRetry}
        title={t('participants.diagnostics_title')}
        titleAs="h3"
        tone="destructive"
      />
    );
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('participants.diagnostics_empty')}</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <HistoryRow key={`${row.participantId}:${row.randomDeviceId ?? 'none'}:${row.day}`} row={row} />
      ))}
    </div>
  );
}

/** History and download share independently optional bounds, defaulting only an entirely blank range. */
function diagnosticsDays(fromDay: string, toDay: string, today: Date): { fromDay?: string; toDay?: string } {
  if (fromDay || toDay) return { ...(fromDay ? { fromDay } : {}), ...(toDay ? { toDay } : {}) };
  const monthAgo = new Date(today);
  monthAgo.setDate(today.getDate() - 29);
  return { fromDay: localDay(monthAgo), toDay: localDay(today) };
}

function diagnosticsFilters(params: URLSearchParams, prefix: string) {
  return {
    fromDay: params.get(`${prefix}from`) ?? '',
    toDay: params.get(`${prefix}to`) ?? '',
    randomDeviceId: params.get(`${prefix}device`) ?? '',
    moduleFamily: params.get(`${prefix}module`) ?? '',
    issueCode: params.get(`${prefix}issue`) ?? '',
  };
}

export function AndroidDiagnosticsPanel({ participantId, studyId }: { participantId: string; studyId: string }) {
  const { t } = useTranslator();
  const idPrefix = useId();
  const [params, updateParams] = useSearchParamsUpdate();
  const prefix = `diagnostics.${participantId}.`;
  const { fromDay, toDay, randomDeviceId, moduleFamily, issueCode } = diagnosticsFilters(params, prefix);
  const [settledRandomDeviceId, setSettledRandomDeviceId] = useState(randomDeviceId.trim());
  const [settledIssueCode, setSettledIssueCode] = useState(issueCode.trim());
  const pageCursors = new URLSearchParams(params.get(`${prefix}pages`) ?? '').getAll('cursor');
  const cursor = pageCursors.at(-1);
  const [today, setToday] = useState(() => new Date());
  const days = diagnosticsDays(fromDay, toDay, new Date());
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useEffect(() => {
    const tomorrow = new Date(today);
    tomorrow.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => setToday(new Date()), tomorrow.getTime() - Date.now());
    return () => window.clearTimeout(timeout);
  }, [today]);
  useEffect(() => {
    if (randomDeviceId.trim() === settledRandomDeviceId && issueCode.trim() === settledIssueCode) return;
    const timeout = window.setTimeout(() => {
      setSettledRandomDeviceId(randomDeviceId.trim());
      setSettledIssueCode(issueCode.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [randomDeviceId, issueCode, settledRandomDeviceId, settledIssueCode]);

  const query = useGetAndroidDiagnosticsQuery({
    studyId,
    participantId,
    ...days,
    ...(settledRandomDeviceId ? { randomDeviceId: settledRandomDeviceId } : {}),
    ...(moduleFamily ? { moduleFamily } : {}),
    ...(settledIssueCode ? { issueCode: settledIssueCode } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 25,
  });
  const nextCursor = query.data?.nextCursor;
  const [downloadData, { isLoading: isDownloading }] = useDownloadParticipantDataMutation();
  const { query: studyQuery, timeZone } = useStudyTimeZone(studyId);
  const rows = useMemo(() => query.data?.items ?? [], [query.data?.items]);

  const updateFilter = (name: string, value: string) =>
    updateParams({ [`${prefix}${name}`]: value, [`${prefix}pages`]: '' });
  const setPageCursors = (cursors: string[]) =>
    updateParams({ [`${prefix}pages`]: new URLSearchParams(cursors.map((value) => ['cursor', value])).toString() });

  const handleDownload = async () => {
    if (!timeZone) return;
    setDownloadError(null);
    const days = diagnosticsDays(fromDay, toDay, new Date());
    try {
      const selection = toSyncExportSelection([participantId]);
      if (!selection) throw new Error(t('participants.diagnostics_download_failed'));
      await downloadData({
        dataType: 'UploadDiagnostics',
        ...(days.fromDay ? { startDate: days.fromDay } : {}),
        ...(days.toDay ? { endDate: days.toDay } : {}),
        participantIds: selection,
        studyId,
        timeZone,
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
        <Button disabled={isDownloading || !timeZone} onClick={() => void handleDownload()} size="sm" variant="outline">
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
          <Label htmlFor={`${idPrefix}-from`}>{t('participants.diagnostics_from')}</Label>
          <Input
            id={`${idPrefix}-from`}
            name={`${idPrefix}-from`}
            onChange={(event) => updateFilter('from', event.target.value)}
            type="date"
            value={fromDay}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-to`}>{t('participants.diagnostics_to')}</Label>
          <Input
            id={`${idPrefix}-to`}
            name={`${idPrefix}-to`}
            onChange={(event) => updateFilter('to', event.target.value)}
            type="date"
            value={toDay}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-device`}>{t('participants.diagnostics_device_filter')}</Label>
          <Input
            id={`${idPrefix}-device`}
            name={`${idPrefix}-device`}
            onChange={(event) => updateFilter('device', event.target.value)}
            placeholder={t('participants.diagnostics_device_placeholder')}
            spellCheck={false}
            value={randomDeviceId}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-module`}>{t('participants.diagnostics_module_family')}</Label>
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            id={`${idPrefix}-module`}
            name={`${idPrefix}-module`}
            onChange={(event) => updateFilter('module', event.target.value)}
            value={moduleFamily}
          >
            <option value="">{t('participants.diagnostics_any')}</option>
            {ANDROID_DIAGNOSTIC_FAMILIES.map(({ value }) => (
              <option key={value} value={value}>
                {translateCatalog(t, 'diagnostic_family', value, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-issue`}>{t('participants.diagnostics_issue_code')}</Label>
          <Input
            id={`${idPrefix}-issue`}
            name={`${idPrefix}-issue`}
            onChange={(event) => updateFilter('issue', event.target.value)}
            placeholder={t('participants.diagnostics_issue_placeholder')}
            spellCheck={false}
            value={issueCode}
          />
        </div>
      </div>

      {downloadError && (
        <p className="text-sm text-destructive" role="alert">
          {downloadError}
        </p>
      )}
      {studyQuery.isError && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive" role="alert">
            {getErrorMessage(studyQuery.error, t('bulk_downloads.load_error_fallback'))}
          </p>
          <Button onClick={() => void studyQuery.refetch()} size="sm" variant="outline">
            {t('common.try_again')}
          </Button>
        </div>
      )}
      <HistoryContent isError={query.isError} isLoading={query.isLoading} rows={rows} onRetry={() => query.refetch()} />

      <div className="flex items-center justify-between border-t border-border pt-3">
        <Button
          disabled={pageCursors.length === 0 || query.isFetching}
          onClick={() => setPageCursors(pageCursors.slice(0, -1))}
          size="sm"
          variant="outline"
        >
          {t('participants.diagnostics_previous')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('participants.diagnostics_page', { page: String(pageCursors.length + 1) })}
        </span>
        <Button
          disabled={!nextCursor || query.isFetching}
          onClick={() => {
            if (nextCursor) setPageCursors([...pageCursors, nextCursor]);
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
