import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { participantDataTypesForModules } from '@/lib/participant-data-types';
import type { StudyModule } from '@/lib/study-constants';
import {
  type TimeUseDiaryDataType,
  useDownloadParticipantDataMutation,
  useDownloadParticipantTudDataMutation,
} from '@/state/study-operations-api';

type DownloadParticipantDataModalProps = {
  modules: string[];
  onClose: () => void;
  participantIds: string[];
  studyId: string;
};

// Time Use Diary is deliberately NOT a ParticipantDataType: it is served by
// TimeUseDiaryController on its own route, with its own DayTime/NightTime/Summarized
// enum. Typing the two families separately is what stops a TUD value being posted to the
// StudyController endpoint, which is what used to happen.
const TUD_TYPE = { module: 'TIME_USE_DIARY' as StudyModule, value: 'TimeUseDiary' } as const;

// `value` is the wire enum (posted to TimeUseDiaryController); `labelKey` is what the
// researcher reads. They are deliberately separate so a language switch never changes
// what the export request carries.
const TUD_SUB_TYPES = [
  { labelKey: 'tud_exports.daytime', value: 'DayTime' },
  { labelKey: 'tud_exports.nighttime', value: 'NightTime' },
  { labelKey: 'tud_exports.summarized', value: 'Summarized' },
] as const;

export function DownloadParticipantDataModal({
  modules,
  onClose,
  participantIds,
  studyId,
}: DownloadParticipantDataModalProps) {
  const [downloadData, { isLoading }] = useDownloadParticipantDataMutation();
  const [downloadTud, { isLoading: isTudLoading }] = useDownloadParticipantTudDataMutation();
  const [selectedType, setSelectedType] = useState('');
  const [tudSubType, setTudSubType] = useState<TimeUseDiaryDataType>('DayTime');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslator();

  const availableTypes = [
    ...participantDataTypesForModules(modules),
    ...(modules.includes(TUD_TYPE.module) ? [{ ...TUD_TYPE, label: t('download_modal.tud_label') }] : []),
  ];
  const isBatch = participantIds.length > 1;
  const isTud = selectedType === TUD_TYPE.value;
  const busy = isLoading || isTudLoading;

  const handleDownload = async () => {
    if (!selectedType) return;
    setError(null);

    // Two endpoints, not one: TUD goes to TimeUseDiaryController with its own enum,
    // everything else to StudyController's participants/data.
    const args = { participantIds, studyId } as {
      endDate?: string;
      filename?: string;
      participantIds: string[];
      startDate?: string;
      studyId: string;
    };
    if (startDate) args.startDate = startDate;
    if (endDate) args.endDate = endDate;
    if (filename) args.filename = filename;

    try {
      if (isTud) {
        await downloadTud({ ...args, dataType: tudSubType }).unwrap();
      } else {
        await downloadData({ ...args, dataType: selectedType }).unwrap();
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t('common.download_failed')));
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,32rem)]">
        <DialogTitle>
          <Download className="mr-2 inline h-5 w-5" />
          {t('download_modal.title')}
        </DialogTitle>
        <DialogDescription>
          {isBatch
            ? t('download_modal.description_many', { count: String(participantIds.length) })
            : t('download_modal.description_one', { id: participantIds[0] ?? '' })}
        </DialogDescription>

        <div className="mt-4 space-y-4">
          {/* Data type selection */}
          <div className="space-y-2">
            <Label>{t('download_modal.data_type')}</Label>
            <div className="flex flex-wrap gap-2">
              {availableTypes.map((dt) => (
                <Button
                  key={dt.value}
                  onClick={() => setSelectedType(dt.value)}
                  size="sm"
                  variant={selectedType === dt.value ? 'default' : 'outline'}
                >
                  {dt.value === TUD_TYPE.value ? dt.label : translateCatalog(t, 'data_type', dt.value, dt.label)}
                </Button>
              ))}
            </div>
            {availableTypes.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('download_modal.no_types')}</p>
            )}
          </div>

          {/* TUD sub-type selector */}
          {isTud && (
            <div className="space-y-2">
              <Label>{t('download_modal.tud_type')}</Label>
              <div className="flex gap-2">
                {TUD_SUB_TYPES.map((st) => (
                  <Button
                    key={st.value}
                    onClick={() => setTudSubType(st.value)}
                    size="sm"
                    variant={tudSubType === st.value ? 'default' : 'outline'}
                  >
                    {t(st.labelKey)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Date range */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="download-start">{t('download_modal.start_optional')}</Label>
              <Input id="download-start" onChange={(e) => setStartDate(e.target.value)} type="date" value={startDate} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="download-end">{t('download_modal.end_optional')}</Label>
              <Input id="download-end" onChange={(e) => setEndDate(e.target.value)} type="date" value={endDate} />
            </div>
          </div>

          {/* Custom filename */}
          <div className="space-y-1.5">
            <Label htmlFor="download-filename">{t('download_modal.filename_optional')}</Label>
            <Input
              id="download-filename"
              onChange={(e) => setFilename(e.target.value)}
              placeholder="custom-filename.csv"
              value={filename}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button onClick={onClose} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedType || busy}
              onClick={() => {
                handleDownload().catch((err) => {
                  setError(getErrorMessage(err, t('common.download_failed')));
                });
              }}
            >
              {busy && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.download')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
