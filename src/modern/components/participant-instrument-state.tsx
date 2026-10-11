import { LoaderCircle } from 'lucide-react';
import { StatePanel } from '@/components/state-panel';
import { useTranslator } from '@/i18n';

export function ParticipantInstrumentState({
  isError,
  loadingLabel,
  onRetry,
}: {
  isError: boolean;
  loadingLabel: string;
  onRetry: () => unknown;
}) {
  const { t } = useTranslator();
  if (isError) {
    return (
      <StatePanel
        description={t('common.request_failed')}
        icon={<LoaderCircle className="h-5 w-5" />}
        onRetry={onRetry}
        title={t('common.error')}
        titleAs="h2"
        tone="destructive"
      />
    );
  }
  return (
    <div className="mx-auto flex max-w-2xl items-center gap-2 p-6 text-sm text-muted-foreground">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      {loadingLabel}
    </div>
  );
}
