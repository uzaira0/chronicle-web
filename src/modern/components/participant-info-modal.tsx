import { useCallback, useEffect, useRef, useState } from 'react';
import { QrEnrollmentModal } from '@/components/qr-enrollment-modal';
import { resolveBaseLang, supportsTodayDiary } from '@/components/tud/tud-page-settings';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { localDay } from '@/lib/format';
import { getAppUsageLink, getTimeUseDiaryLink } from '@/lib/participant-links';
import type { Participant } from '@/state/study-operations-api';
import { useGetTimeUseDiarySettingsQuery, useIssueParticipantAccessCodeMutation } from '@/state/study-operations-api';

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
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code translate="no" className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-xs">
          {value}
        </code>
        <CopyButton aria-label={t('common.copy_named', { name: label })} className="h-8 w-8" value={value} />
      </div>
    </div>
  );
}

export function ParticipantInfoModal({ modules, onClose, participant, studyId }: ParticipantInfoModalProps) {
  const [issueAccessCode] = useIssueParticipantAccessCodeMutation();
  const hasDataCollection = modules.includes('CHRONICLE_DATA_COLLECTION');
  const hasTud = modules.includes('TIME_USE_DIARY');
  const { data: tudSettings } = useGetTimeUseDiarySettingsQuery(studyId, { skip: !hasTud });
  // Same resolution the diary page applies, so the modal never offers a link the page would refuse.
  const hasTudToday =
    hasTud && tudSettings !== undefined && supportsTodayDiary(resolveBaseLang(new URLSearchParams(), tudSettings));
  const { t } = useTranslator();
  const [participantLinks, setParticipantLinks] = useState<{
    appUsage?: string;
    tudToday?: string;
    tudYesterday?: string;
  }>({});
  const [showEnrollment, setShowEnrollment] = useState(false);
  const [showFormLinks, setShowFormLinks] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const issuedLinks = useRef(new Set<string>());
  // The Today diary code depends on the study language, which loads separately; it is issued
  // at most once per modal so settings refetches never mint duplicate codes.
  const tudTodayIssuedFor = useRef<string | null>(null);

  const issue = useCallback(
    async (formKind: 'APP_USAGE' | 'TIME_USE_DIARY', logicalDate?: string): Promise<string> => {
      const payload = await issueAccessCode({
        studyId,
        participantId: participant.participantId,
        formKind,
        ...(logicalDate ? { logicalDate } : {}),
      }).unwrap();
      if (typeof payload.accessCode !== 'string') throw new Error(t('participant_info.malformed'));
      return payload.accessCode;
    },
    [issueAccessCode, participant.participantId, studyId, t],
  );

  useEffect(() => {
    if (!showFormLinks) return;
    let cancelled = false;
    if (retryAttempt > 0) setLinkError(null);
    // The diary day is the researcher's local calendar day, not the UTC one.
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const todayDate = localDay(today);
    const yesterdayDate = localDay(yesterday);

    const issueMissing = (kind: 'APP_USAGE' | 'TIME_USE_DIARY', date?: string) =>
      issuedLinks.current.has(`${kind}/${date ?? ''}`) ? Promise.resolve(null) : issue(kind, date);
    Promise.allSettled([
      hasDataCollection ? issueMissing('APP_USAGE', todayDate) : Promise.resolve(null),
      hasTud ? issueMissing('TIME_USE_DIARY', yesterdayDate) : Promise.resolve(null),
    ])
      .then((results) => {
        if (cancelled) return;
        const [appAccessCode, yesterdayAccessCode] = results.map((result) =>
          result.status === 'fulfilled' ? result.value : null,
        );
        const links: { appUsage?: string; tudYesterday?: string } = {};
        if (appAccessCode) {
          issuedLinks.current.add(`APP_USAGE/${todayDate}`);
          links.appUsage = getAppUsageLink(studyId, participant.participantId, todayDate, appAccessCode);
        }
        if (yesterdayAccessCode) {
          issuedLinks.current.add(`TIME_USE_DIARY/${yesterdayDate}`);
          links.tudYesterday = getTimeUseDiaryLink(
            studyId,
            participant.participantId,
            'yesterday',
            yesterdayDate,
            yesterdayAccessCode,
          );
        }
        setParticipantLinks((current) => ({ ...current, ...links }));
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected')
          setLinkError(getErrorMessage(failure.reason, t('participant_info.links_failed')));
      })
      .catch((error: unknown) => {
        if (!cancelled) setLinkError(getErrorMessage(error, t('participant_info.links_failed')));
      });
    return () => {
      cancelled = true;
    };
  }, [hasDataCollection, hasTud, issue, participant.participantId, studyId, t, retryAttempt, showFormLinks]);

  useEffect(() => {
    if (!showFormLinks) return;
    if (retryAttempt > 0) setLinkError(null);
    const target = `${studyId}/${participant.participantId}`;
    if (!hasTudToday || tudTodayIssuedFor.current === target) return;
    tudTodayIssuedFor.current = target;
    const todayDate = localDay(new Date());
    issue('TIME_USE_DIARY', todayDate)
      .then((accessCode) => {
        const tudToday = getTimeUseDiaryLink(studyId, participant.participantId, 'today', todayDate, accessCode);
        setParticipantLinks((current) => ({ ...current, tudToday }));
      })
      .catch((error: unknown) => {
        tudTodayIssuedFor.current = null;
        setLinkError(getErrorMessage(error, t('participant_info.links_failed')));
      });
  }, [hasTudToday, issue, participant.participantId, studyId, t, retryAttempt, showFormLinks]);

  if (showEnrollment) {
    return <QrEnrollmentModal onClose={onClose} participantId={participant.participantId} studyId={studyId} />;
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-11/12 max-w-lg">
        <DialogTitle>{t('participant_info.title')}</DialogTitle>
        <DialogDescription>{t('participant_info.description', { id: participant.participantId })}</DialogDescription>

        <div className="mt-4 space-y-4">
          <CopyField label={t('common.participant_id')} value={participant.participantId} />
          <CopyField label={t('participant_info.study_id')} value={studyId} />
          <Button onClick={() => setShowEnrollment(true)}>{t('qr_modal.issue')}</Button>
          {!showFormLinks && (hasDataCollection || hasTud) && (
            <Button onClick={() => setShowFormLinks(true)} variant="outline">
              {t('participant_info.issue_links')}
            </Button>
          )}

          {linkError && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive" role="alert">
                {linkError}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setLinkError(null);
                  setRetryAttempt((attempt) => attempt + 1);
                }}
              >
                {t('common.retry')}
              </Button>
            </div>
          )}
          {showFormLinks &&
            !linkError &&
            (hasDataCollection || hasTud) &&
            Object.keys(participantLinks).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('participant_info.issuing')}</p>
            )}

          {participantLinks.appUsage && (
            <CopyField label={t('participant_info.app_usage_survey')} value={participantLinks.appUsage} />
          )}

          {hasTudToday && participantLinks.tudToday && (
            <CopyField label={t('participant_info.tud_today')} value={participantLinks.tudToday} />
          )}
          {participantLinks.tudYesterday && (
            <CopyField label={t('participant_info.tud_yesterday')} value={participantLinks.tudYesterday} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
