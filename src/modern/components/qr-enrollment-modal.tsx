import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import { participantAccessCodeIssueUrl } from '@/lib/participant-access';
import {
  getDefaultEnrollmentServerUrl,
  getHttpsEnrollmentLink,
  isValidParticipantAccessCode,
} from '@/lib/participant-links';
import { fetchWithCsrf } from '@/state/study-operations-api';

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

function buildQrLink(
  accessCode: string,
  participantId: string,
  publicServerUrl: string | null,
  studyId: string,
): string {
  const normalizedParticipantId = participantId.trim();
  if (!normalizedParticipantId || !accessCode || !publicServerUrl) return '';
  return getHttpsEnrollmentLink(studyId, normalizedParticipantId, { accessCode });
}

export function QrEnrollmentModal({ onClose, participantId: initialPid, studyId }: QrEnrollmentModalProps) {
  const [participantId, setParticipantId] = useState(initialPid ?? '');
  const [accessCode, setAccessCode] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const { t } = useTranslator();

  const { error: configurationError, serverUrl: publicServerUrl } = readPublicServerConfiguration(
    t('qr_modal.server_not_configured'),
  );
  const link = buildQrLink(accessCode, participantId, publicServerUrl, studyId);

  async function issueEnrollmentLink() {
    const normalizedParticipantId = participantId.trim();
    if (!normalizedParticipantId) return;
    setIssuing(true);
    setLinkError(null);
    setAccessCode('');
    try {
      const response = await fetchWithCsrf(participantAccessCodeIssueUrl(studyId, normalizedParticipantId), {
        body: JSON.stringify({
          expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(),
          formKind: 'ENROLLMENT',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error(t('qr_modal.issue_failed', { status: String(response.status) }));
      const payload = (await response.json()) as { accessCode?: unknown };
      if (!isValidParticipantAccessCode(payload.accessCode)) throw new Error(t('qr_modal.malformed'));
      setAccessCode(payload.accessCode);
    } catch (error: unknown) {
      setLinkError(error instanceof Error ? error.message : t('qr_modal.issue_failed_generic'));
    } finally {
      setIssuing(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,28rem)]">
        <DialogTitle>{t('qr_modal.title')}</DialogTitle>
        <DialogDescription>{t('qr_modal.description')}</DialogDescription>

        <div className="mt-4 space-y-4">
          {!initialPid && (
            <div className="space-y-1.5">
              <Label htmlFor="qr-pid">{t('common.participant_id')}</Label>
              <Input
                id="qr-pid"
                onChange={(e) => {
                  setParticipantId(e.target.value);
                  setAccessCode('');
                }}
                placeholder={t('qr_modal.pid_placeholder')}
                value={participantId}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('qr_modal.public_server')}</Label>
            <code className="block overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
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
            {issuing ? t('qr_modal.issuing') : accessCode ? t('qr_modal.issue_new') : t('qr_modal.issue')}
          </Button>
          {linkError && <p className="text-sm font-medium text-destructive">{linkError}</p>}

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
                  <code className="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">{link}</code>
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
