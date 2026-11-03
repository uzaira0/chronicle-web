import { CircleAlert, Clock3, Download, FileArchive, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel, TableSkeleton } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { isReversedDateRange, localDay } from '@/lib/format';
import {
  TIME_USE_DIARY_DATA_TYPES,
  type TimeUseDiaryDataType,
  toExportDateTime,
  useDownloadQuestionnaireResponsesMutation,
  useDownloadStudyTudDataMutation,
  useGetStudyExportAvailabilityQuery,
  useGetStudyQuestionnairesQuery,
} from '@/state/study-operations-api';
import { useStudyTimeZone } from '@/state/study-time-zone';

function defaultRangeEnd() {
  return localDay(new Date());
}

function defaultRangeStart() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return localDay(date);
}

type DownloadScope = { studyId: string; timeZone: string };
type Notice = { message?: string; error?: string };

function DownloadNotice({ notice, onClear }: { notice: Notice; onClear: () => void }) {
  const { t } = useTranslator();
  if (!notice.message && !notice.error) return null;
  return (
    <>
      <p
        className={`text-sm ${notice.error ? 'text-destructive' : 'text-muted-foreground'}`}
        role={notice.error ? 'alert' : 'status'}
      >
        {notice.error ?? notice.message}
      </p>
      {notice.error && (
        <Button className="w-fit" onClick={onClear} size="sm" variant="ghost">
          {t('bulk_downloads.clear_notice')}
        </Button>
      )}
    </>
  );
}

function OptionsFailure({ query }: { query: { isError?: boolean; error?: unknown; refetch: () => unknown } }) {
  const { t } = useTranslator();
  if (!query.isError) return null;
  return (
    <StatePanel
      icon={<CircleAlert className="h-5 w-5" />}
      title={t('common.request_failed')}
      description={getErrorMessage(query.error, t('bulk_downloads.options_failed'))}
      onRetry={() => void query.refetch()}
      tone="destructive"
    />
  );
}

function DiaryDownloads({ studyId, timeZone }: DownloadScope) {
  const { t } = useTranslator();
  const availability = useGetStudyExportAvailabilityQuery(studyId);
  const [download, { isLoading }] = useDownloadStudyTudDataMutation();
  const [start, setStart] = useState(defaultRangeStart);
  const [end, setEnd] = useState(defaultRangeEnd);
  const [notice, setNotice] = useState<Notice>({});
  const reversed = isReversedDateRange(start, end);
  const submit = async (dataType: TimeUseDiaryDataType) => {
    if (!start || !end || reversed) return;
    setNotice({});
    try {
      await download({
        dataType,
        startDate: toExportDateTime(start, false, timeZone),
        endDate: toExportDateTime(end, true, timeZone),
        studyId,
      }).unwrap();
      setNotice({ message: t('bulk_downloads.downloaded_tud', { type: dataType }) });
    } catch (error) {
      setNotice({ error: getErrorMessage(error, t('bulk_downloads.tud_failed')) });
    }
  };
  if (availability.isError) return <OptionsFailure query={availability} />;
  if (!availability.currentData?.timeUseDiary) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle layout="icon">
          <Clock3 className="h-4 w-4" />
          {t('bulk_downloads.tud_title')}
        </CardTitle>
        <CardDescription>{t('bulk_downloads.tud_description')}</CardDescription>
      </CardHeader>
      <CardContent spacing={4}>
        <p className="text-sm text-muted-foreground">{t('download_modal.time_zone', { zone: timeZone })}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tud-start">{t('common.start_date')}</Label>
            <Input
              id="tud-start"
              name="tud-start"
              aria-invalid={reversed}
              max={end || undefined}
              onChange={(event) => setStart(event.target.value)}
              type="date"
              value={start}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tud-end">{t('common.end_date')}</Label>
            <Input
              id="tud-end"
              name="tud-end"
              aria-invalid={reversed}
              min={start || undefined}
              onChange={(event) => setEnd(event.target.value)}
              type="date"
              value={end}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TIME_USE_DIARY_DATA_TYPES.map((dataType) => (
            <Button
              disabled={isLoading || !start || !end || reversed}
              key={dataType}
              onClick={() => void submit(dataType)}
              size="sm"
              variant="outline"
            >
              <Download className="mr-1.5 h-4 w-4" />
              {dataType}
            </Button>
          ))}
        </div>
        <DownloadNotice notice={notice} onClear={() => setNotice({})} />
      </CardContent>
    </Card>
  );
}

function QuestionnaireDownloads({ studyId }: { studyId: string }) {
  const { t } = useTranslator();
  const query = useGetStudyQuestionnairesQuery(studyId);
  const [download, { isLoading }] = useDownloadQuestionnaireResponsesMutation();
  const [notice, setNotice] = useState<Notice>({});
  const submit = async (questionnaireId: string) => {
    setNotice({});
    try {
      await download({ questionnaireId, studyId }).unwrap();
      setNotice({ message: t('bulk_downloads.downloaded_questionnaire') });
    } catch (error) {
      setNotice({ error: getErrorMessage(error, t('bulk_downloads.questionnaire_failed')) });
    }
  };
  if (query.isError) return <OptionsFailure query={query} />;
  if (!query.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle layout="icon">
          <ScrollText className="h-4 w-4" />
          {t('bulk_downloads.questionnaire_responses')}
        </CardTitle>
        <CardDescription>{t('bulk_downloads.questionnaire_description')}</CardDescription>
      </CardHeader>
      <CardContent spacing={2}>
        {query.data.map((questionnaire) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            key={questionnaire.id}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{questionnaire.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t('bulk_downloads.question_count', { count: String(questionnaire.questions.length) })}
                {questionnaire.active ? '' : t('bulk_downloads.inactive_suffix')}
              </p>
            </div>
            <Button disabled={isLoading} onClick={() => void submit(questionnaire.id)} size="sm" variant="outline">
              <Download className="mr-1.5 h-4 w-4" />
              {t('common.download')}
            </Button>
          </div>
        ))}
        <DownloadNotice notice={notice} onClear={() => setNotice({})} />
      </CardContent>
    </Card>
  );
}

export function StudyBulkDownloadsPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { query, timeZone } = useStudyTimeZone(studyId);
  if (!studyId) return <MissingStudyIdPanel section={t('bulk_downloads.section')} />;
  if (query.isError)
    return (
      <StatePanel
        className="max-w-none"
        description={getErrorMessage(query.error, t('bulk_downloads.load_error_fallback'))}
        eyebrow={t('common.error')}
        icon={<CircleAlert className="h-5 w-5" />}
        isRetrying={query.isFetching}
        onRetry={() =>
          query
            .refetch()
            .unwrap()
            .catch(() => undefined)
        }
        title={t('bulk_downloads.load_error_title')}
        tone="destructive"
      />
    );
  if (!timeZone) return <TableSkeleton label={t('bulk_downloads.loading_title')} />;
  const scope = { studyId, timeZone };
  return (
    <div className="space-y-6" key={studyId}>
      <SectionHeader
        size="compact"
        description={t('bulk_downloads.description')}
        eyebrow={t('bulk_downloads.eyebrow')}
        icon={<FileArchive className="h-3.5 w-3.5" />}
        title={t('bulk_downloads.title', { name: query.currentData?.title || studyId })}
      />
      <DiaryDownloads {...scope} />
      <QuestionnaireDownloads studyId={studyId} />
    </div>
  );
}
