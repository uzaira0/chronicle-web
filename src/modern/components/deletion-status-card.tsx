import { RefreshCw } from 'lucide-react';
import { EraseDeletionButton } from '@/components/erase-deletion-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { statusLabel, useTranslator } from '@/i18n';
import { formatDisplayDateTime } from '@/lib/format';
import { type DataDeletionOperation, STUDY_ERASURE_MODE } from '@/state/study-operations-api';

/** Pending erasures with their Erase now controls; nothing is erased until an owner presses one. */
export function DeletionStatusCard({
  studyId,
  operations,
  error,
  isFetching,
  onRefresh,
}: {
  studyId: string;
  operations: (Partial<DataDeletionOperation> & { operationId: string })[];
  error: string | null;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslator();
  if (operations.length === 0 && !error) return null;
  return (
    <Card variant="padded">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium" id="deletion-status-heading">
            {t('participants.deletion_status')}
          </p>
          <p className="text-sm text-muted-foreground">{t('participants.deletion_requests_note')}</p>
        </div>
        <Button disabled={isFetching} onClick={onRefresh} size="sm" variant="outline">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {t('participants.refresh_status')}
        </Button>
      </div>
      <div className="space-y-2">
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <ul aria-labelledby="deletion-status-heading" className="space-y-2">
          {operations.map((operation) => (
            <li className="flex flex-wrap items-center gap-2 text-sm" key={operation.operationId}>
              {/* Until its details load, a just-requested erasure is known only by its operation ID. */}
              {operation.participantId ? (
                <span translate="no">{operation.participantId}</span>
              ) : operation.mode === STUDY_ERASURE_MODE ? (
                <span>{t('participants.deletion_whole_study')}</span>
              ) : (
                <code translate="no" className="text-xs">
                  {operation.operationId}
                </code>
              )}
              <Badge variant={operation.status === 'COMPLETED' ? 'success' : 'warning'}>
                {operation.status ? statusLabel(t, 'job', operation.status) : t('common.loading')}
              </Badge>
              {operation.requestedAt && (
                <span className="text-muted-foreground">
                  {t('participants.requested_at', { time: formatDisplayDateTime(operation.requestedAt) })}
                </span>
              )}
              <EraseDeletionButton operation={operation} studyId={studyId} />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
