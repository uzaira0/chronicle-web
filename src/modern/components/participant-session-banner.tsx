import { Button } from '@/components/ui/button';
import type { Translator } from '@/i18n';
import type { ParticipantKeepAliveStatus } from '@/lib/participant-access-guard';

export function ParticipantSessionBanner({
  onRetry,
  status,
  translate,
}: {
  onRetry: () => void;
  status: ParticipantKeepAliveStatus;
  translate: Translator['t'];
}) {
  if (status !== 'expired' && status !== 'unavailable') return null;
  const prefix = status === 'expired' ? 'expired' : 'unavailable';
  return (
    <div className="space-y-2 rounded-md border border-warning/50 bg-warning-bg p-3 text-sm text-warning" role="alert">
      <p className="font-semibold">{translate(`participant_session.${prefix}_title`)}</p>
      <p>{translate(`participant_session.${prefix}_description`)}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        {translate('participant_session.retry')}
      </Button>
    </div>
  );
}
