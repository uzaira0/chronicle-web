import { CircleAlert } from 'lucide-react';
import { RouteSkeleton, StatePanel } from '@/components/state-panel';
import { useTranslator } from '@/i18n';
import { getParticipantReadErrorMessage } from '@/lib/errors';

export function ParticipantInstrumentState({
  isError,
  loadingLabel,
  onRetry,
  error,
}: {
  isError: boolean;
  loadingLabel: string;
  onRetry: () => unknown;
  error?: unknown;
}) {
  const { t } = useTranslator();
  if (isError) {
    return (
      <StatePanel
        description={getParticipantReadErrorMessage(error, t)}
        icon={<CircleAlert className="h-5 w-5" />}
        onRetry={onRetry}
        title={t('common.error')}
        titleAs="h2"
        tone="destructive"
      />
    );
  }
  return (
    <div className="mx-auto max-w-2xl p-6">
      <RouteSkeleton label={loadingLabel} />
    </div>
  );
}
