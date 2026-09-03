import { CalendarRange, CircleAlert, Clock3, Download, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';

import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldHint } from '@/components/ui/field-hint';
import { Input } from '@/components/ui/input';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate, getEndOfDayIso, getStartOfDayIso } from '@/lib/format';
import {
  type TimeUseDiaryDataType,
  useDownloadStudyTudDataMutation,
  useGetStudySummaryQuery,
  useLazyGetStudyTudSubmissionGroupsQuery,
} from '@/state/study-operations-api';

const DATA_TYPES = {
  DAYTIME: 'DayTime',
  NIGHTTIME: 'NightTime',
  SUMMARIZED: 'Summarized',
} as const;

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getTwoWeeksAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString().slice(0, 10);
}

export function StudyTimeUseDiaryPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const [selectedStartDate, setSelectedStartDate] = useState(getTwoWeeksAgo);
  const [selectedEndDate, setSelectedEndDate] = useState(getToday);
  const [fetchSubmissions, submissionsState] = useLazyGetStudyTudSubmissionGroupsQuery();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  // Shares the whole-study TUD mutation with the Bulk Downloads tab rather than keeping
  // a second hand-rolled fetch() here.
  const [downloadTud, { isLoading: isDownloading }] = useDownloadStudyTudDataMutation();

  const hasValidDateRange = selectedStartDate.length > 0 && selectedEndDate.length > 0;

  const headingTitle = study?.title
    ? t('tud_exports.title_for', { name: study.title })
    : t('tud_exports.title_for_study', { studyId });

  const submissionGroups = useMemo(() => submissionsState.data ?? [], [submissionsState.data]);

  if (!studyId) {
    return (
      <StatePanel
        description={t('tud_exports.missing_description')}
        eyebrow={t('tud_exports.eyebrow')}
        icon={<CircleAlert className="h-5 w-5" />}
        title={t('tud_exports.missing_title')}
        tone="destructive"
      />
    );
  }

  const handleSearch = () => {
    if (!hasValidDateRange) {
      return;
    }

    fetchSubmissions({
      endDate: getEndOfDayIso(selectedEndDate),
      startDate: getStartOfDayIso(selectedStartDate),
      studyId,
    }).catch((err: unknown) => {
      setDownloadError(getErrorMessage(err, t('tud_exports.search_failed')));
    });
  };

  const handleDownload = async (date: string | null, dataType: TimeUseDiaryDataType) => {
    if (isDownloading) return;

    setDownloadError(null);
    try {
      await downloadTud({
        dataType,
        endDate: date ? getEndOfDayIso(date) : getEndOfDayIso(selectedEndDate),
        startDate: date ? getStartOfDayIso(date) : getStartOfDayIso(selectedStartDate),
        studyId,
      }).unwrap();
    } catch (error) {
      setDownloadError(getErrorMessage(error, t('tud_exports.download_failed')));
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        size="compact"
        description={t('tud_exports.description')}
        eyebrow={t('tud_exports.eyebrow')}
        icon={<Clock3 className="h-3.5 w-3.5" />}
        title={headingTitle}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('tud_exports.search_title')}</CardTitle>
          <CardDescription>{t('tud_exports.search_description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t('common.start_date')}
              </p>
              <Input
                aria-label={t('common.start_date')}
                onChange={(event) => setSelectedStartDate(event.target.value)}
                type="date"
                value={selectedStartDate}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t('common.end_date')}
              </p>
              <Input
                aria-label={t('common.end_date')}
                onChange={(event) => setSelectedEndDate(event.target.value)}
                type="date"
                value={selectedEndDate}
              />
            </div>
            <Button disabled={!hasValidDateRange || submissionsState.isFetching} onClick={handleSearch} size="lg">
              <CalendarRange className="h-4 w-4" />
              {submissionsState.isFetching ? t('tud_exports.searching') : t('tud_exports.search')}
            </Button>
          </div>

          <FieldHint>{t('tud_exports.default_range')}</FieldHint>
        </CardContent>
      </Card>

      {submissionsState.isError && (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(submissionsState.error, t('tud_exports.load_error_fallback'))}
          eyebrow={t('common.request_failed')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('tud_exports.load_error_title')}
          tone="destructive"
        />
      )}

      {submissionsState.isFetching && (
        <StatePanel
          className="max-w-none"
          description={t('tud_exports.loading_description')}
          eyebrow={t('common.loading')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('tud_exports.loading_title')}
        />
      )}

      {downloadError && (
        <StatePanel
          className="max-w-none"
          description={downloadError}
          eyebrow={t('tud_exports.download_failed_eyebrow')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('tud_exports.download_failed_title')}
          tone="destructive"
        />
      )}

      {submissionsState.isSuccess && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              disabled={isDownloading}
              onClick={() => void handleDownload(null, DATA_TYPES.SUMMARIZED)}
              variant="outline"
            >
              <Download className="h-4 w-4" />
              {isDownloading ? t('tud_exports.downloading') : t('tud_exports.download_all_summarized')}
            </Button>
          </div>

          {submissionGroups.length === 0 ? (
            <StatePanel
              className="max-w-none"
              description={t('tud_exports.empty_description')}
              eyebrow={t('tud_exports.empty_eyebrow')}
              icon={<Clock3 className="h-5 w-5" />}
              title={t('tud_exports.empty_title')}
            />
          ) : (
            submissionGroups.map((group) => (
              <Card key={group.date}>
                <CardContent className="grid gap-4 md:grid-cols-[1.1fr_0.75fr_1.5fr] md:items-center">
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-foreground">{formatDisplayDate(group.date)}</p>
                    <p className="text-sm text-muted-foreground">{t('tud_exports.daily_group')}</p>
                  </div>

                  <Badge className="w-fit" variant="muted">
                    {t('tud_exports.submissions_count', { count: String(group.ids.length) })}
                  </Badge>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button
                      disabled={isDownloading}
                      onClick={() => void handleDownload(group.date, DATA_TYPES.SUMMARIZED)}
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                      {t('tud_exports.summarized')}
                    </Button>
                    <Button
                      disabled={isDownloading}
                      onClick={() => void handleDownload(group.date, DATA_TYPES.DAYTIME)}
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                      {t('tud_exports.daytime')}
                    </Button>
                    <Button
                      disabled={isDownloading}
                      onClick={() => void handleDownload(group.date, DATA_TYPES.NIGHTTIME)}
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                      {t('tud_exports.nighttime')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
