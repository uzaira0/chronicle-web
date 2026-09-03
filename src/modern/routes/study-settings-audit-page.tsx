import { ChevronDown, ChevronUp, CircleAlert, History, LoaderCircle } from 'lucide-react';
import { Fragment, useCallback, useState } from 'react';
import { useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDateTime } from '@/lib/format';
import {
  type CollectionAcknowledgmentEntry,
  type StudySettingsAuditEntry,
  useGetStudyCollectionAcknowledgmentsQuery,
  useGetStudySettingsAuditQuery,
  useGetStudySummaryQuery,
} from '@/state/study-operations-api';

function SettingsAuditEntryRows({
  entry,
  expandedRow,
  toggleRow,
}: {
  entry: StudySettingsAuditEntry;
  expandedRow: string | null;
  toggleRow: (id: string) => void;
}) {
  const isExpanded = expandedRow === entry.id;
  const { t } = useTranslator();
  return (
    <Fragment>
      <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(entry.id)}>
        <TableCell className="whitespace-nowrap font-medium text-xs">
          {formatDisplayDateTime(entry.changedAt)}
        </TableCell>
        <TableCell className="text-sm">{entry.changedBy}</TableCell>
        <TableCell className="text-sm font-semibold">{entry.settingKey}</TableCell>
        <TableCell className="text-sm">{entry.changeSummary}</TableCell>
        <TableCell>{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={5}>
            <div className="grid grid-cols-2 gap-4 p-4">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('settings_audit.before')}
                </span>
                <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-3 text-[10px] leading-relaxed">
                  {entry.beforeValue != null ? JSON.stringify(entry.beforeValue, null, 2) : t('common.none_paren')}
                </pre>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('settings_audit.after')}
                </span>
                <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-3 text-[10px] leading-relaxed">
                  {entry.afterValue != null ? JSON.stringify(entry.afterValue, null, 2) : t('common.none_paren')}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

const TRIGGER_KEYS: Record<NonNullable<CollectionAcknowledgmentEntry['trigger']>, string> = {
  ENROLLMENT: 'settings_audit.trigger_enrollment',
  PARTICIPANT_TOGGLE: 'settings_audit.trigger_self_toggle',
  SETTINGS_CHANGE: 'settings_audit.trigger_settings_change',
  WITHDRAWAL: 'settings_audit.trigger_withdrawal',
};

function AcknowledgmentsCard({ entries }: { entries: CollectionAcknowledgmentEntry[] }) {
  const { t } = useTranslator();
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t('settings_audit.consent_title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings_audit.consent_description')}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">{t('settings_audit.col_recorded')}</TableHead>
            <TableHead>{t('settings_audit.col_participant')}</TableHead>
            <TableHead>{t('settings_audit.col_accepted')}</TableHead>
            <TableHead>{t('settings_audit.col_declined')}</TableHead>
            <TableHead className="w-[140px]">{t('settings_audit.col_trigger')}</TableHead>
            <TableHead className="w-[160px]">{t('settings_audit.col_device')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>
                {t('settings_audit.no_consent')}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const declined = entry.declinedModules ?? [];
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap font-medium text-xs">
                    {formatDisplayDateTime(entry.recordedAt)}
                  </TableCell>
                  <TableCell className="text-sm">{entry.participantId}</TableCell>
                  <TableCell className="text-sm">{entry.acknowledgedModules.join(', ') || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{declined.join(', ') || '—'}</TableCell>
                  <TableCell className="text-xs">{t(TRIGGER_KEYS[entry.trigger ?? 'ENROLLMENT'])}</TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">{entry.sourceDeviceId}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

export function StudySettingsAuditPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: auditEntries = [],
    error,
    isError,
    isLoading,
  } = useGetStudySettingsAuditQuery({ studyId }, { skip: !studyId });
  const { data: acknowledgments = [] } = useGetStudyCollectionAcknowledgmentsQuery({ studyId }, { skip: !studyId });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = useCallback((id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  }, []);

  if (!studyId) {
    return <MissingStudyIdPanel section={t('settings_audit.section')} />;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        size="compact"
        description={t('settings_audit.description')}
        eyebrow={t('settings_audit.eyebrow')}
        icon={<History className="h-3.5 w-3.5" />}
        title={t('settings_audit.title', { name: study?.title || studyId })}
      />

      {isLoading ? (
        <StatePanel
          className="max-w-none"
          description={t('settings_audit.loading_description')}
          eyebrow={t('common.loading')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('settings_audit.loading_title')}
        />
      ) : isError ? (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(error, t('settings_audit.load_error_fallback'))}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('settings_audit.load_error_title')}
          tone="destructive"
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{t('settings_audit.col_timestamp')}</TableHead>
                <TableHead>{t('settings_audit.col_changed_by')}</TableHead>
                <TableHead>{t('settings_audit.col_setting')}</TableHead>
                <TableHead>{t('settings_audit.col_summary')}</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditEntries.length === 0 ? (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                    {t('settings_audit.no_changes')}
                  </TableCell>
                </TableRow>
              ) : (
                auditEntries.map((entry) => (
                  <SettingsAuditEntryRows
                    entry={entry}
                    expandedRow={expandedRow}
                    key={entry.id}
                    toggleRow={toggleRow}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {!isLoading && !isError && <AcknowledgmentsCard entries={acknowledgments} />}
    </div>
  );
}
