import type { Participant } from '@/state/study-operations-api';

export function canChangeEnrollment(participant: Participant): boolean {
  return !participant.withdrawnAt && participant.participationStatus !== 'ERASED';
}

export function getStatusVariant(status: unknown) {
  switch (status) {
    case 'ENROLLED':
      return 'success' as const;
    case 'PAUSED':
      return 'warning' as const;
    case 'COLLECTION_COMPLETED':
      return 'default' as const;
    case 'NOT_ENROLLED':
      return 'outline' as const;
    default:
      return 'muted' as const;
  }
}
