import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import {
  getDefaultEnrollmentServerUrl,
  getHttpsEnrollmentLink,
  isValidParticipantAccessCode,
} from '@/lib/participant-links';
import { useIssueParticipantAccessCodeMutation } from '@/state/study-operations-api';

type QrEnrollmentModalProps = {
  onClose: () => void;
  participantId?: string | undefined;
  studyId: string;
};

function readPublicServerConfiguration(fallback: string): { error: string | null; serverUrl: string | null } {
  try {
    return { error: null, serverUrl: getDefaultEnrollmentServerUrl() };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : fallback,
      serverUrl: null,
    };
  }
}

type IssuedCode = { accessCode: string; participantId: string };

// The server binds an enrollment code to the participant it was issued for; pairing it with any
// other id yields a QR that enrollment rejects.
function buildQrLink(
  issued: IssuedCode | null,
  participantId: string,
  publicServerUrl: string | null,
  studyId: string,
): string {
  if (!issued || issued.participantId !== participantId.trim() || !publicServerUrl) return '';
  return getHttpsEnrollmentLink(studyId, issued.participantId, { accessCode: issued.accessCode });
}

export function QrEnrollmentModal({ onClose, participantId: initialPid, studyId }: QrEnrollmentModalProps) {
  const [issueAccessCode, { isLoading: issuing }] = useIssueParticipantAccessCodeMutation();
  const [participantId, setParticipantId] = useState(initialPid ?? '');
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const currentParticipantId = useRef(participantId);
  const [linkError, setLinkError] = useState<string | null>(null);
  const autoIssued = useRef(false);
  const inFlight = useRef(false);
  const { t } = useTranslator();

  const { error: configurationError, serverUrl: publicServerUrl } = readPublicServerConfiguration(
    t('qr_modal.server_not_configured'),
  );
  const link = buildQrLink(issued, participantId, publicServerUrl, studyId);

  const issueEnrollmentLink = useCallback(async () => {
    const normalizedParticipantId = participantId.trim();
    if (!normalizedParticipantId || inFlight.current) return;
    inFlight.current = true;
    setLinkError(null);
    setIssued(null);
    try {
      const payload = await issueAccessCode({
        studyId,
        participantId: normalizedParticipantId,
        formKind: 'ENROLLMENT',
      }).unwrap();
      if (!isValidParticipantAccessCode(payload.accessCode)) throw new Error(t('qr_modal.malformed'));
      // A response for an id that has since changed is stale.
      if (currentParticipantId.current.trim() !== normalizedParticipantId) return;
      setIssued({ accessCode: payload.accessCode, participantId: normalizedParticipantId });
    } catch (error: unknown) {
      setLinkError(getErrorMessage(error, t('qr_modal.issue_failed_generic')));
    } finally {
      inFlight.current = false;
    }
  }, [participantId, issueAccessCode, studyId, t]);
  useEffect(() => {
    if (!initialPid || !publicServerUrl || autoIssued.current) return;
    autoIssued.current = true;
    void issueEnrollmentLink();
  }, [initialPid, publicServerUrl, issueEnrollmentLink]);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-11/12 max-w-md">
        <DialogTitle>{t('qr_modal.title')}</DialogTitle>
        <DialogDescription>{t('qr_modal.description')}</DialogDescription>

        <div className="mt-4 space-y-4">
          {!initialPid && (
            <div className="space-y-1.5">
              <Label htmlFor="qr-pid">{t('common.participant_id')}</Label>
              <Input
                disabled={issuing}
                id="qr-pid"
                name="participant-id"
                spellCheck={false}
                onChange={(e) => {
                  currentParticipantId.current = e.target.value;
                  setParticipantId(e.target.value);
                  setIssued(null);
                }}
                placeholder={t('qr_modal.pid_placeholder')}
                value={participantId}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('qr_modal.public_server')}</Label>
            <code translate="no" className="block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
              {publicServerUrl ?? t('common.not_configured')}
            </code>
            <p className="text-xs text-muted-foreground">{t('qr_modal.server_note')}</p>
            {configurationError && <p className="text-sm font-medium text-destructive">{configurationError}</p>}
          </div>

          <Button
            disabled={!participantId.trim() || !publicServerUrl || issuing}
            onClick={() => {
              void issueEnrollmentLink();
            }}
          >
            {issuing ? t('qr_modal.issuing') : issued ? t('qr_modal.issue_new') : t('qr_modal.issue')}
          </Button>
          {linkError && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {linkError}
            </p>
          )}

          {link ? (
            <>
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                {/* qrcode.react emits a bare <svg>, which has no accessible name — axe
                    flags it serious/svg-img-alt. The URL itself is below in a copyable
                    field, so the name only has to identify what the graphic is. */}
                <QRCodeSVG
                  aria-label={t('qr_modal.qr_aria', { id: participantId.trim() })}
                  role="img"
                  size={200}
                  value={link}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('common.url')}</Label>
                <div className="flex gap-2">
                  <code translate="no" className="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                    {link}
                  </code>
                  <CopyButton aria-label={t('qr_modal.copy_link')} value={link} />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('qr_modal.enter_pid')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
