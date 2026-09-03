import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import { participantAccessCodeIssueUrl } from '@/lib/participant-access';
import { getAppUsageLink, getHttpsEnrollmentLink, getTimeUseDiaryLink } from '@/lib/participant-links';
import type { Participant } from '@/state/study-operations-api';
import { fetchWithCsrf } from '@/state/study-operations-api';

type ParticipantInfoModalProps = {
  modules: string[];
  onClose: () => void;
  participant: Participant;
  studyId: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslator();
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">{value}</code>
        <CopyButton aria-label={t('common.copy_named', { name: label })} className="h-8 w-8" value={value} />
      </div>
    </div>
  );
}

export function ParticipantInfoModal({ modules, onClose, participant, studyId }: ParticipantInfoModalProps) {
  const hasDataCollection = modules.includes('CHRONICLE_DATA_COLLECTION');
  const hasTud = modules.includes('TIME_USE_DIARY');
  const { t } = useTranslator();
  const [participantLinks, setParticipantLinks] = useState<{
    enrollment?: string;
    appUsage?: string;
    tudToday?: string;
    tudYesterday?: string;
  }>({});
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const todayDate = today.toISOString().slice(0, 10);
    const yesterdayDate = yesterday.toISOString().slice(0, 10);

    async function issue(
      formKind: 'ENROLLMENT' | 'APP_USAGE' | 'TIME_USE_DIARY',
      logicalDate?: string,
    ): Promise<string> {
      const enrollmentExpiry = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetchWithCsrf(participantAccessCodeIssueUrl(studyId, participant.participantId), {
        body: JSON.stringify({
          formKind,
          ...(logicalDate ? { logicalDate } : {}),
          ...(formKind === 'ENROLLMENT' ? { expiresAt: enrollmentExpiry } : {}),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error(t('participant_info.issue_failed', { status: String(response.status) }));
      const payload = (await response.json()) as { accessCode?: unknown };
      if (typeof payload.accessCode !== 'string') throw new Error(t('participant_info.malformed'));
      return payload.accessCode;
    }

    Promise.all([
      issue('ENROLLMENT'),
      hasDataCollection ? issue('APP_USAGE', todayDate) : Promise.resolve(null),
      hasTud ? issue('TIME_USE_DIARY', todayDate) : Promise.resolve(null),
      hasTud ? issue('TIME_USE_DIARY', yesterdayDate) : Promise.resolve(null),
    ])
      .then(([enrollmentAccessCode, appAccessCode, todayAccessCode, yesterdayAccessCode]) => {
        if (cancelled) return;
        const links: { enrollment?: string; appUsage?: string; tudToday?: string; tudYesterday?: string } = {
          enrollment: getHttpsEnrollmentLink(studyId, participant.participantId, {
            accessCode: enrollmentAccessCode,
          }),
        };
        if (appAccessCode) {
          links.appUsage = getAppUsageLink(studyId, participant.participantId, todayDate, appAccessCode);
        }
        if (todayAccessCode) {
          links.tudToday = getTimeUseDiaryLink(studyId, participant.participantId, 'today', todayDate, todayAccessCode);
        }
        if (yesterdayAccessCode) {
          links.tudYesterday = getTimeUseDiaryLink(
            studyId,
            participant.participantId,
            'yesterday',
            yesterdayDate,
            yesterdayAccessCode,
          );
        }
        setParticipantLinks(links);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLinkError(error instanceof Error ? error.message : t('participant_info.links_failed'));
      });
    return () => {
      cancelled = true;
    };
  }, [hasDataCollection, hasTud, participant.participantId, studyId, t]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,32rem)]">
        <DialogTitle>{t('participant_info.title')}</DialogTitle>
        <DialogDescription>{t('participant_info.description', { id: participant.participantId })}</DialogDescription>

        <div className="mt-4 space-y-4">
          <CopyField label={t('common.participant_id')} value={participant.participantId} />
          <CopyField label={t('participant_info.study_id')} value={studyId} />
          {participantLinks.enrollment && (
            <CopyField label={t('participant_info.enrollment_link')} value={participantLinks.enrollment} />
          )}

          {linkError && <p className="text-sm font-medium text-destructive">{linkError}</p>}
          {!linkError && Object.keys(participantLinks).length === 0 && (
            <p className="text-sm text-muted-foreground">{t('participant_info.issuing')}</p>
          )}

          {participantLinks.appUsage && (
            <CopyField label={t('participant_info.app_usage_survey')} value={participantLinks.appUsage} />
          )}

          {participantLinks.tudToday && participantLinks.tudYesterday && (
            <>
              <CopyField label={t('participant_info.tud_today')} value={participantLinks.tudToday} />
              <CopyField label={t('participant_info.tud_yesterday')} value={participantLinks.tudYesterday} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
