import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslator } from '@/i18n';
import { formatDisplayDateTime } from '@/lib/format';
import type { CollectionAcknowledgmentEntry } from '@/state/study-operations-api';

const TRIGGER_KEYS: Record<NonNullable<CollectionAcknowledgmentEntry['trigger']>, string> = {
  ENROLLMENT: 'settings_audit.trigger_enrollment',
  PARTICIPANT_TOGGLE: 'settings_audit.trigger_self_toggle',
  SETTINGS_CHANGE: 'settings_audit.trigger_settings_change',
  WITHDRAWAL: 'settings_audit.trigger_withdrawal',
};

export function AcknowledgmentsCard({ entries }: { entries: CollectionAcknowledgmentEntry[] }) {
  const { t } = useTranslator();
  return (
    <Card>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t('settings_audit.consent_title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings_audit.consent_description')}</p>
      </div>
      <Table aria-label={t('settings_audit.consent_title')}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-45">{t('settings_audit.col_recorded')}</TableHead>
            <TableHead>{t('settings_audit.col_participant')}</TableHead>
            <TableHead>{t('settings_audit.col_accepted')}</TableHead>
            <TableHead>{t('settings_audit.col_declined')}</TableHead>
            <TableHead className="w-35">{t('settings_audit.col_trigger')}</TableHead>
            <TableHead className="w-40">{t('settings_audit.col_device')}</TableHead>
            <TableHead>{t('settings_audit.col_app_version')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell tone="muted" className="h-24 text-center" colSpan={7}>
                {t('settings_audit.no_consent')}
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry) => {
              const declined = entry.declinedModules ?? [];
              return (
                <TableRow key={entry.id}>
                  <TableCell size="small" weight="medium" className="whitespace-nowrap">
                    {formatDisplayDateTime(entry.recordedAt)}
                  </TableCell>
                  <TableCell translate="no">{entry.participantId}</TableCell>
                  <TableCell>{entry.acknowledgedModules.join(', ') || '—'}</TableCell>
                  <TableCell tone="muted">{declined.join(', ') || '—'}</TableCell>
                  <TableCell size="small">{t(TRIGGER_KEYS[entry.trigger ?? 'ENROLLMENT'])}</TableCell>
                  <TableCell size="small" tone="muted" truncate>
                    {entry.sourceRandomDeviceId}
                  </TableCell>
                  <TableCell translate="no">{entry.appVersion ?? '—'}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
