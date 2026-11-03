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
  loadInvitationServerCa,
} from '@/lib/participant-links';
import {
  useIssueParticipantAccessCodeMutation,
  useLookupLiveEnrollmentCodeMutation,
} from '@/state/study-operations-api';

// Version 40 at L correction holds at most 2,953 bytes. Invitation URLs are ASCII-escaped.
export const MAX_QR_BYTE_LENGTH = 2_953;

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
// `serverCa` is undefined until the deployment's CA root (local HTTPS trial only) has been read.
function buildQrLink(
  issued: IssuedCode | null,
  participantId: string,
  publicServerUrl: string | null,
  studyId: string,
  serverCa: string | null | undefined,
): string {
  if (!issued || issued.participantId !== participantId.trim() || !publicServerUrl || serverCa === undefined) return '';
  return getHttpsEnrollmentLink(studyId, issued.participantId, { accessCode: issued.accessCode, serverCa });
}

function EnrollmentQr({ label, link, hasServerCa }: { label: string; link: string; hasServerCa: boolean }) {
  if (link.length > MAX_QR_BYTE_LENGTH) return null;
  return (
    <div className="flex justify-center rounded-lg border border-border bg-white p-4">
      {/* qrcode.react emits a bare <svg>, which has no accessible name — axe
        flags it serious/svg-img-alt. The URL itself is below in a copyable
        field, so the name only has to identify what the graphic is. */}
      <QRCodeSVG
        aria-label={label}
        role="img"
        boostLevel={!hasServerCa}
        className="h-auto max-w-full"
        level="L"
        marginSize={4}
        size={hasServerCa ? 384 : 200}
        value={link}
      />
    </div>
  );
}

function EnrollmentQrPlaceholder({ pending, error }: { pending: boolean; error: string | null }) {
  const { t } = useTranslator();
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {error ? t('participant_access.server_ca_unavailable') : pending ? t('common.loading') : t('qr_modal.enter_pid')}
    </div>
  );
}

export function QrEnrollmentModal({ onClose, participantId: initialPid, studyId }: QrEnrollmentModalProps) {
  const [issueAccessCode, { isLoading: issuingCode }] = useIssueParticipantAccessCodeMutation();
  const [lookupLiveCode, { isLoading: lookingUp }] = useLookupLiveEnrollmentCodeMutation();
  const issuing = issuingCode || lookingUp;
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
  const [serverCa, setServerCa] = useState<string | null | undefined>(undefined);
  const [serverCaError, setServerCaError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    loadInvitationServerCa().then(
      (value) => current && setServerCa(value),
      (error: unknown) =>
        current && setServerCaError(getErrorMessage(error, t('participant_access.server_ca_unavailable'))),
    );
    return () => {
      current = false;
    };
  }, [t]);
  const serverReady = publicServerUrl !== null && serverCa !== undefined;
  const link = buildQrLink(issued, participantId, publicServerUrl, studyId, serverCa);

  // A response for an id that has since changed is stale.
  const isCurrent = useCallback(
    (normalizedParticipantId: string) => currentParticipantId.current.trim() === normalizedParticipantId,
    [],
  );

  // Issuing revokes the link already sent, so only the explicit replace action (or a participant with none) calls it.
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
      if (!isCurrent(normalizedParticipantId)) return;
      setIssued({ accessCode: payload.accessCode, participantId: normalizedParticipantId });
    } catch (error: unknown) {
      setLinkError(getErrorMessage(error, t('qr_modal.issue_failed_generic')));
    } finally {
      inFlight.current = false;
    }
  }, [participantId, issueAccessCode, studyId, t, isCurrent]);

  // The link already sent, or null when the participant has none; throws when the lookup fails or answers garbage.
  const lookupSentLink = useCallback(
    async (normalizedParticipantId: string): Promise<string | null> => {
      const live = await lookupLiveCode({ studyId, participantId: normalizedParticipantId }).unwrap();
      if (!live) return null;
      if (!isValidParticipantAccessCode(live.accessCode)) throw new Error(t('qr_modal.malformed'));
      return live.accessCode;
    },
    [lookupLiveCode, studyId, t],
  );

  // Shows the link already sent; issues one only when the participant has none.
  const showEnrollmentLink = useCallback(async () => {
    const normalizedParticipantId = participantId.trim();
    if (!normalizedParticipantId || inFlight.current) return;
    inFlight.current = true;
    setLinkError(null);
    setIssued(null);
    let sent: string | null;
    try {
      sent = await lookupSentLink(normalizedParticipantId);
    } catch (error: unknown) {
      setLinkError(getErrorMessage(error, t('qr_modal.lookup_failed')));
      return;
    } finally {
      inFlight.current = false;
    }
    if (!isCurrent(normalizedParticipantId)) return;
    if (sent) setIssued({ accessCode: sent, participantId: normalizedParticipantId });
    else await issueEnrollmentLink();
  }, [participantId, lookupSentLink, t, isCurrent, issueEnrollmentLink]);
  useEffect(() => {
    if (!initialPid || !serverReady || autoIssued.current) return;
    autoIssued.current = true;
    void showEnrollmentLink();
  }, [initialPid, serverReady, showEnrollmentLink]);

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
            {configurationError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {configurationError}
              </p>
            )}
            {serverCaError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {serverCaError}
              </p>
            )}
          </div>

          <Button
            disabled={!participantId.trim() || !serverReady || issuing}
            onClick={() => {
              void (issued ? issueEnrollmentLink() : showEnrollmentLink());
            }}
          >
            {issuing ? t('qr_modal.issuing') : issued ? t('qr_modal.replace') : t('qr_modal.issue')}
          </Button>
          {issued && !issuing && <p className="text-xs text-muted-foreground">{t('qr_modal.replace_note')}</p>}
          {linkError && (
            <p className="text-sm font-medium text-destructive" role="alert">
              {linkError}
            </p>
          )}

          {link ? (
            <>
              <EnrollmentQr
                label={t('qr_modal.qr_aria', { id: participantId.trim() })}
                link={link}
                hasServerCa={Boolean(serverCa)}
              />

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
            <EnrollmentQrPlaceholder pending={serverCa === undefined} error={serverCaError} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
