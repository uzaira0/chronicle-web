import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Clock3,
  Download,
  FileArchive,
  LoaderCircle,
  RotateCw,
  ScrollText,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { statusLabel, translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { getEndOfDayIso, getStartOfDayIso } from '@/lib/format';
import { participantDataTypesForModules } from '@/lib/participant-data-types';
import {
  type CreateStudyExportRequest,
  type ParticipantDataType,
  type StudyExportFormat,
  type StudyExportJobInfo,
  type StudyExportJobStatus,
  TIME_USE_DIARY_DATA_TYPES,
  type TimeUseDiaryDataType,
  useCreateStudyExportMutation,
  useDownloadQuestionnaireResponsesMutation,
  useDownloadStudyExportMutation,
  useDownloadStudyTudDataMutation,
  useGetStudyQuestionnairesQuery,
  useGetStudySummaryQuery,
  useListStudyExportsQuery,
} from '@/state/study-operations-api';

const EXPORT_FORMATS: readonly StudyExportFormat[] = ['EXCEL', 'CSV', 'JSON'];

function defaultRangeEnd() {
  return new Date().toISOString().slice(0, 10);
}

function defaultRangeStart() {
  const date = new Date();
  date.setDate(date.getDate() - 14);
  return date.toISOString().slice(0, 10);
}

function statusVariant(status: StudyExportJobStatus) {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'FAILED':
      return 'destructive';
    case 'RUNNING':
      return 'warning';
    case 'PENDING':
      return 'muted';
    default:
      return 'outline';
  }
}

function statusIcon(status: StudyExportJobStatus) {
  switch (status) {
    case 'COMPLETED':
      return <CheckCircle2 className="h-4 w-4" />;
    case 'FAILED':
      return <CircleAlert className="h-4 w-4" />;
    case 'RUNNING':
    case 'PENDING':
      return <LoaderCircle className="h-4 w-4 animate-spin" />;
    default:
      return <CircleDashed className="h-4 w-4" />;
  }
}

function jobCreatedAt(job: StudyExportJobInfo, unknown: string) {
  const created = new Date(job.createdAt);
  return Number.isNaN(created.getTime()) ? unknown : created.toLocaleString();
}

function exportFilename(job: StudyExportJobInfo) {
  const extension = job.format === 'EXCEL' ? 'xlsx' : job.format.toLowerCase();
  return `chronicle-${job.studyId}-export-${job.exportId}.${extension}`;
}

function canDownloadJob(job: StudyExportJobInfo) {
  return job.status === 'COMPLETED';
}

function canCreateStatusKey(availableTypesCount: number, isCreating: boolean) {
  if (availableTypesCount === 0) return 'bulk_downloads.no_types_enabled';
  if (isCreating) return 'bulk_downloads.queuing';
  return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This route page owns study + export-list loading/error/fetching state, create/download mutations, action messaging, and derived data-type maps; extracting it would scatter the cohesive load→list→action flow (mirrors StudyLayout).
export function StudyBulkDownloadsPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const {
    data: study,
    error: studyError,
    isError: isStudyError,
    isLoading: studyIsLoading,
  } = useGetStudySummaryQuery(studyId, { skip: !studyId });

  const {
    data: exportJobs = [],
    error: exportListError,
    isError: isExportListError,
    isLoading: exportListLoading,
    isFetching: isExportListFetching,
    refetch: refetchExportJobs,
  } = useListStudyExportsQuery({ limit: 50, offset: 0, studyId }, { skip: !studyId });

  const [createExport, { isLoading: isCreating }] = useCreateStudyExportMutation();
  const [downloadExport, { isLoading: isDownloading }] = useDownloadStudyExportMutation();

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadingExportId, setDownloadingExportId] = useState('');
  const createInFlightRef = useRef(false);

  // The backend's CreateStudyExportRequest already accepts a type subset, a format and a
  // date range; this page used to hard-code "all types, EXCEL, full range" and expose
  // none of it.
  const [excludedTypes, setExcludedTypes] = useState<ReadonlySet<ParticipantDataType>>(new Set());
  const [format, setFormat] = useState<StudyExportFormat>('EXCEL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tudStart, setTudStart] = useState(defaultRangeStart);
  const [tudEnd, setTudEnd] = useState(defaultRangeEnd);
  const exportStateStudyIdRef = useRef(studyId);

  useEffect(() => {
    if (exportStateStudyIdRef.current === studyId) return;
    exportStateStudyIdRef.current = studyId;
    setExcludedTypes(new Set());
    setFormat('EXCEL');
    setStartDate('');
    setEndDate('');
    setTudStart(defaultRangeStart());
    setTudEnd(defaultRangeEnd());
    setActionMessage(null);
    setActionError(null);
    setDownloadingExportId('');
  }, [studyId]);

  const [downloadStudyTud, { isLoading: isTudDownloading }] = useDownloadStudyTudDataMutation();
  const [downloadQuestionnaire, { isLoading: isQuestionnaireDownloading }] =
    useDownloadQuestionnaireResponsesMutation();
  const { data: questionnaires = [] } = useGetStudyQuestionnairesQuery(studyId, { skip: !studyId });

  const handleTudDownload = async (dataType: TimeUseDiaryDataType) => {
    setActionError(null);
    try {
      await downloadStudyTud({
        dataType,
        endDate: getEndOfDayIso(tudEnd),
        startDate: getStartOfDayIso(tudStart),
        studyId,
      }).unwrap();
      setActionMessage(t('bulk_downloads.downloaded_tud', { type: dataType }));
    } catch (err) {
      setActionError(getErrorMessage(err, t('bulk_downloads.tud_failed')));
    }
  };

  const handleQuestionnaireDownload = async (questionnaireId: string) => {
    setActionError(null);
    try {
      await downloadQuestionnaire({ questionnaireId, studyId }).unwrap();
      setActionMessage(t('bulk_downloads.downloaded_questionnaire'));
    } catch (err) {
      setActionError(getErrorMessage(err, t('bulk_downloads.questionnaire_failed')));
    }
  };

  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);

  const availableDataTypes = useMemo(() => participantDataTypesForModules(modules), [modules]);

  const selectedDataTypes = availableDataTypes.filter((option) => !excludedTypes.has(option.value));
  const createStatusKey = canCreateStatusKey(availableDataTypes.length, isCreating);
  const canCreate = selectedDataTypes.length > 0;

  const toggleType = (value: ParticipantDataType) => {
    setExcludedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  if (!studyId) {
    return <MissingStudyIdPanel section={t('bulk_downloads.section')} />;
  }

  if (studyIsLoading) {
    return (
      <StatePanel
        className="max-w-none"
        description={t('bulk_downloads.loading_description')}
        eyebrow={t('common.loading')}
        icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
        title={t('bulk_downloads.loading_title')}
      />
    );
  }

  if (isStudyError) {
    return (
      <StatePanel
        className="max-w-none"
        description={getErrorMessage(studyError, t('bulk_downloads.load_error_fallback'))}
        eyebrow={t('common.error')}
        icon={<CircleAlert className="h-5 w-5" />}
        title={t('bulk_downloads.load_error_title')}
        tone="destructive"
      />
    );
  }

  const handleCreateExport = async () => {
    if (!studyId || !canCreate || createInFlightRef.current) return;

    createInFlightRef.current = true;
    setActionMessage(null);
    setActionError(null);
    try {
      const request: CreateStudyExportRequest = {
        dataTypes: selectedDataTypes.map((option) => option.value),
        format,
      };
      if (startDate) request.startDate = getStartOfDayIso(startDate);
      if (endDate) request.endDate = getEndOfDayIso(endDate);
      const job = await createExport({ studyId, request }).unwrap();
      setActionMessage(t('bulk_downloads.queued', { id: job.exportId }));
      await refetchExportJobs();
    } catch (err) {
      setActionError(getErrorMessage(err, t('bulk_downloads.queue_failed')));
    } finally {
      createInFlightRef.current = false;
    }
  };

  const handleDownloadJob = async (job: StudyExportJobInfo) => {
    if (!canDownloadJob(job)) return;
    try {
      setDownloadingExportId(job.exportId);
      await downloadExport({
        studyId,
        exportId: job.exportId,
        format: job.format,
        filename: exportFilename(job),
      }).unwrap();
      setActionMessage(t('bulk_downloads.downloaded', { id: job.exportId }));
      setActionError(null);
    } catch (err) {
      setActionError(getErrorMessage(err, t('bulk_downloads.download_failed')));
    } finally {
      setDownloadingExportId('');
    }
  };

  return (
    <div className="space-y-6">
      {/* The start button used to live up here, detached from the type/format/range
          controls it reads. It now sits with them. */}
      <SectionHeader
        size="compact"
        description={t('bulk_downloads.description')}
        eyebrow={t('bulk_downloads.eyebrow')}
        icon={<FileArchive className="h-3.5 w-3.5" />}
        title={t('bulk_downloads.title', { name: study?.title || studyId })}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('bulk_downloads.full_export')}</CardTitle>
          <CardDescription>{t('bulk_downloads.full_export_description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('bulk_downloads.include_types')}</Label>
            {availableDataTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('bulk_downloads.no_exportable_types')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableDataTypes.map((option) => (
                  <Button
                    aria-pressed={!excludedTypes.has(option.value)}
                    key={option.value}
                    onClick={() => toggleType(option.value)}
                    size="sm"
                    variant={excludedTypes.has(option.value) ? 'outline' : 'default'}
                  >
                    {translateCatalog(t, 'data_type', option.value, option.label)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="export-format">{t('common.format')}</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                id="export-format"
                onChange={(e) => setFormat(e.target.value as StudyExportFormat)}
                value={format}
              >
                {EXPORT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-start">{t('bulk_downloads.start_optional')}</Label>
              <Input id="export-start" onChange={(e) => setStartDate(e.target.value)} type="date" value={startDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="export-end">{t('bulk_downloads.end_optional')}</Label>
              <Input id="export-end" onChange={(e) => setEndDate(e.target.value)} type="date" value={endDate} />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {createStatusKey
              ? t(createStatusKey)
              : canCreate
                ? t(startDate || endDate ? 'bulk_downloads.summary_range' : 'bulk_downloads.summary_full', {
                    selected: String(selectedDataTypes.length),
                    total: String(availableDataTypes.length),
                  })
                : t('bulk_downloads.select_one_type')}
          </p>
          {(actionMessage || actionError) && (
            <p className={`text-sm ${actionError ? 'text-destructive' : 'text-muted-foreground'}`}>
              {actionError ?? actionMessage}
            </p>
          )}
          {actionError && (
            <Button
              className="w-fit"
              onClick={() => {
                setActionError(null);
                setActionMessage(null);
              }}
              size="sm"
              variant="ghost"
            >
              {t('bulk_downloads.clear_notice')}
            </Button>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button
              disabled={!canCreate || isCreating}
              onClick={() => {
                handleCreateExport().catch((err) => {
                  setActionError(getErrorMessage(err, t('bulk_downloads.queue_failed')));
                });
              }}
            >
              <RotateCw className={`mr-2 h-4 w-4 ${isCreating ? 'animate-spin' : ''}`} />
              {t('bulk_downloads.start_export')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TUD and questionnaires are served by their own controllers and cannot ride the
          ParticipantDataType export job, so they get their own whole-study download here
          rather than being reachable only from their individual tabs. */}
      {modules.includes('TIME_USE_DIARY') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {t('bulk_downloads.tud_title')}
            </CardTitle>
            <CardDescription>{t('bulk_downloads.tud_description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tud-start">{t('common.start_date')}</Label>
                <Input id="tud-start" onChange={(e) => setTudStart(e.target.value)} type="date" value={tudStart} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tud-end">{t('common.end_date')}</Label>
                <Input id="tud-end" onChange={(e) => setTudEnd(e.target.value)} type="date" value={tudEnd} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {TIME_USE_DIARY_DATA_TYPES.map((dataType) => (
                <Button
                  disabled={isTudDownloading || !tudStart || !tudEnd}
                  key={dataType}
                  onClick={() => {
                    handleTudDownload(dataType).catch((err) => {
                      setActionError(getErrorMessage(err, t('bulk_downloads.tud_failed')));
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {dataType}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {questionnaires.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              {t('bulk_downloads.questionnaire_responses')}
            </CardTitle>
            <CardDescription>{t('bulk_downloads.questionnaire_description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {questionnaires.map((questionnaire) => (
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
                <Button
                  disabled={isQuestionnaireDownloading}
                  onClick={() => {
                    handleQuestionnaireDownload(questionnaire.id).catch((err) => {
                      setActionError(getErrorMessage(err, t('bulk_downloads.questionnaire_failed')));
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  {t('common.download')}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-2 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {t('bulk_downloads.recent_jobs')}
            </CardTitle>
            <CardDescription>{t('bulk_downloads.recent_jobs_description')}</CardDescription>
          </div>
          <Button
            disabled={isExportListFetching}
            onClick={() => {
              refetchExportJobs()
                .unwrap()
                .catch((err) => {
                  setActionError(getErrorMessage(err, t('bulk_downloads.refresh_history_failed')));
                });
            }}
            variant="outline"
          >
            <RotateCw className={`mr-2 h-4 w-4 ${isExportListFetching ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {exportListLoading ? (
            <div className="px-6 py-4">
              <StatePanel
                description={t('bulk_downloads.loading_exports_description')}
                eyebrow={t('common.loading')}
                icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
                title={t('bulk_downloads.loading_exports_title')}
              />
            </div>
          ) : isExportListError ? (
            <div className="px-6 py-4">
              <StatePanel
                description={getErrorMessage(exportListError, t('bulk_downloads.exports_error_fallback'))}
                eyebrow={t('common.error')}
                icon={<CircleAlert className="h-5 w-5" />}
                title={t('bulk_downloads.exports_error_title')}
                tone="destructive"
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.created')}</TableHead>
                  <TableHead>{t('bulk_downloads.col_export_id')}</TableHead>
                  <TableHead>{t('common.format')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('bulk_downloads.col_rows')}</TableHead>
                  <TableHead className="w-32">{t('common.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportJobs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                      {t('bulk_downloads.no_exports')}
                    </TableCell>
                  </TableRow>
                ) : (
                  exportJobs.map((job) => (
                    <TableRow key={job.exportId}>
                      <TableCell>{jobCreatedAt(job, t('common.unknown'))}</TableCell>
                      <TableCell className="font-mono text-xs">{job.exportId}</TableCell>
                      <TableCell>{job.format}</TableCell>
                      <TableCell>
                        <Badge className="gap-1.5 uppercase" variant={statusVariant(job.status)}>
                          {statusIcon(job.status)}
                          {statusLabel(t, 'job', job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{job.rowCount.toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          disabled={!canDownloadJob(job) || isDownloading || downloadingExportId === job.exportId}
                          onClick={() => {
                            handleDownloadJob(job).catch((err) => {
                              setActionError(getErrorMessage(err, t('bulk_downloads.download_failed')));
                            });
                          }}
                          size="sm"
                          variant="outline"
                        >
                          <Download className="mr-1.5 h-4 w-4" />
                          {t('common.download')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
