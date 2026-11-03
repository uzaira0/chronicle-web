import { Download, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SYNC_EXPORT_MAX_FILENAME_CHARS } from '@/generated/chronicle-contracts';
import { type Translator, translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { isReversedDateRange } from '@/lib/format';
import { participantDataTypesForAvailability } from '@/lib/participant-data-types';
import { toSyncExportSelection } from '@/lib/sync-export-selection';
import {
  TIME_USE_DIARY_DATA_TYPE,
  TIME_USE_DIARY_DATA_TYPES,
  type TimeUseDiaryDataType,
  useDownloadParticipantDataMutation,
  useDownloadParticipantTudDataMutation,
  useGetStudyExportAvailabilityQuery,
} from '@/state/study-operations-api';
import { useStudyTimeZone } from '@/state/study-time-zone';

type DownloadParticipantDataModalProps = {
  onClose: () => void;
  participantIds: string[];
  studyId: string;
};
const TUD_TYPE = { value: 'TimeUseDiary' } as const;
const TUD_SUB_TYPE_LABELS = {
  DayTime: 'tud_exports.daytime',
  NightTime: 'tud_exports.nighttime',
  Summarized: 'tud_exports.summarized',
} as const satisfies Record<TimeUseDiaryDataType, string>;
const TUD_SUB_TYPES = TIME_USE_DIARY_DATA_TYPES.map((value) => ({ value, labelKey: TUD_SUB_TYPE_LABELS[value] }));

type DownloadDraft = {
  selectedType: string;
  tudSubType: TimeUseDiaryDataType;
  startDate: string;
  endDate: string;
  filename: string;
};

function dateRangeError(start: string, end: string, t: Translator['t']) {
  if (!start || !end) return null;
  if (isReversedDateRange(start, end)) return t('download_modal.range_reversed');
  return null;
}

function useDownloadForm({ onClose, participantIds, studyId }: DownloadParticipantDataModalProps) {
  const [downloadData, dataRequest] = useDownloadParticipantDataMutation();
  const [downloadTud, tudRequest] = useDownloadParticipantTudDataMutation();
  const typesQuery = useGetStudyExportAvailabilityQuery(studyId, { skip: !studyId });
  const { query: studyQuery, timeZone } = useStudyTimeZone(studyId);
  const { t } = useTranslator();
  const options = [
    ...participantDataTypesForAvailability(typesQuery.currentData?.dataTypes ?? []),
    ...(typesQuery.currentData?.timeUseDiary ? [{ ...TUD_TYPE, label: t('download_modal.tud_label') }] : []),
  ];
  const [draft, setDraft] = useState<DownloadDraft>(() => ({
    selectedType: options.length === 1 ? (options[0]?.value ?? '') : '',
    tudSubType: TIME_USE_DIARY_DATA_TYPE.dayTime,
    startDate: '',
    endDate: '',
    filename: '',
  }));
  const update = <K extends keyof DownloadDraft>(field: K, value: DownloadDraft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const [error, setError] = useState<string | null>(null);
  const rangeError = dateRangeError(draft.startDate, draft.endDate, t);
  const selection = toSyncExportSelection(participantIds);
  const optionsError = typesQuery.isError ? getErrorMessage(typesQuery.error, t('common.download_failed')) : null;
  const studyError = studyQuery.isError
    ? getErrorMessage(studyQuery.error, t('bulk_downloads.load_error_fallback'))
    : null;
  const busy = dataRequest.isLoading || tudRequest.isLoading;
  const hasType = options.some(({ value }) => value === draft.selectedType);
  const canDownload = Boolean(selection && hasType && timeZone && !rangeError && !optionsError && !busy);
  const submit = async () => {
    if (!selection || !timeZone || !canDownload) return;
    setError(null);
    const args = {
      participantIds: selection,
      studyId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      timeZone,
      ...(draft.filename ? { filename: draft.filename } : {}),
    };
    try {
      if (draft.selectedType === TUD_TYPE.value) await downloadTud({ ...args, dataType: draft.tudSubType }).unwrap();
      else await downloadData({ ...args, dataType: draft.selectedType }).unwrap();
      onClose();
    } catch (failure) {
      setError(getErrorMessage(failure, t('common.download_failed')));
    }
  };
  return {
    timeZone,
    draft,
    update,
    options,
    rangeError,
    busy,
    loading: typesQuery.isFetching || (!timeZone && !studyError),
    retry: () => {
      if (optionsError) void typesQuery.refetch();
      if (studyError) void studyQuery.refetch();
    },
    canDownload,
    submit,
    errors: { options: optionsError, study: studyError, request: error },
  };
}
type DownloadForm = ReturnType<typeof useDownloadForm>;

function DownloadTypeFields({ form }: { form: DownloadForm }) {
  const { t } = useTranslator();
  return (
    <>
      <div className="space-y-2">
        <Label>{t('download_modal.data_type')}</Label>
        <div className="flex flex-wrap gap-2">
          {form.options.map((option) => (
            <Button
              key={option.value}
              aria-pressed={form.draft.selectedType === option.value}
              onClick={() => form.update('selectedType', option.value)}
              size="sm"
              variant={form.draft.selectedType === option.value ? 'selected' : 'outline'}
            >
              {option.value === TUD_TYPE.value
                ? option.label
                : translateCatalog(t, 'data_type', option.value, option.label)}
            </Button>
          ))}
        </div>
        {form.options.length === 0 && <p className="text-sm text-muted-foreground">{t('download_modal.no_types')}</p>}
      </div>
      {form.draft.selectedType === TUD_TYPE.value && (
        <div className="space-y-2">
          <Label>{t('download_modal.tud_type')}</Label>
          <div className="flex gap-2">
            {TUD_SUB_TYPES.map((option) => (
              <Button
                key={option.value}
                aria-pressed={form.draft.tudSubType === option.value}
                onClick={() => form.update('tudSubType', option.value)}
                size="sm"
                variant={form.draft.tudSubType === option.value ? 'selected' : 'outline'}
              >
                {t(option.labelKey)}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function DownloadDateInput({ field, form }: { field: 'startDate' | 'endDate'; form: DownloadForm }) {
  const { t } = useTranslator();
  const id = useId();
  const start = field === 'startDate';
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t(start ? 'common.start_date' : 'common.end_date')}</Label>
      <Input
        id={id}
        name={id}
        max={start ? form.draft.endDate || undefined : undefined}
        min={start ? undefined : form.draft.startDate || undefined}
        aria-invalid={Boolean(form.rangeError)}
        onChange={(event) => form.update(field, event.target.value)}
        type="date"
        value={form.draft[field]}
      />
    </div>
  );
}

function DownloadFileFields({ form }: { form: DownloadForm }) {
  const { t } = useTranslator();
  const id = useId();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <DownloadDateInput field="startDate" form={form} />
        <DownloadDateInput field="endDate" form={form} />
        <p className="text-xs text-muted-foreground sm:col-span-2">
          {form.timeZone && t('download_modal.time_zone', { zone: form.timeZone })}{' '}
          {t('download_modal.date_range_hint')}
        </p>
        {form.rangeError && (
          <p className="text-sm text-destructive sm:col-span-2" role="alert">
            {form.rangeError}
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id}>{t('download_modal.filename_optional')}</Label>
        <Input
          id={id}
          name={id}
          maxLength={SYNC_EXPORT_MAX_FILENAME_CHARS}
          onChange={(event) => form.update('filename', event.target.value)}
          value={form.draft.filename}
        />
      </div>
    </>
  );
}

export function DownloadParticipantDataModal(props: DownloadParticipantDataModalProps) {
  const { t } = useTranslator();
  const form = useDownloadForm(props);
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      open
    >
      <DialogContent className="w-11/12 max-w-lg">
        <DialogTitle>
          <Download className="mr-2 inline h-5 w-5" />
          {t('download_modal.title')}
        </DialogTitle>
        <DialogDescription>
          {props.participantIds.length > 1
            ? t('download_modal.description_many', { count: String(props.participantIds.length) })
            : t('download_modal.description_one', { id: props.participantIds[0] ?? '' })}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          {form.loading && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
          )}
          {Object.entries(form.errors).map(
            ([kind, message]) =>
              message && (
                <p key={kind} className="text-sm text-destructive" role="alert">
                  {message}
                </p>
              ),
          )}
          {(form.errors.options || form.errors.study) && (
            <Button variant="outline" onClick={form.retry}>
              {t('common.try_again')}
            </Button>
          )}
          <DownloadTypeFields form={form} />
          <DownloadFileFields form={form} />
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button onClick={props.onClose} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button disabled={!form.canDownload} onClick={() => void form.submit()}>
              {form.busy && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.download')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
