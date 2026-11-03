import type { ParticipationStatus } from '@/generated/chronicle-contracts';
import { PARTICIPATION_STATUS } from '@/generated/chronicle-contracts';
import type { Participant } from '@/state/study-operations-api';

type EnrollmentTransition = {
  target: ParticipationStatus;
  actionKey:
    | 'change_enrollment.pause'
    | 'change_enrollment.resume'
    | 'change_enrollment.enroll'
    | 'change_enrollment.mark_not_enrolled';
  consequenceKey:
    | 'change_enrollment.pause_confirmation'
    | 'change_enrollment.resume_confirmation'
    | 'change_enrollment.not_enrolled_consequence';
};

const PAUSE = {
  target: PARTICIPATION_STATUS.PAUSED,
  actionKey: 'change_enrollment.pause',
  consequenceKey: 'change_enrollment.pause_confirmation',
} as const satisfies EnrollmentTransition;
const RESUME = {
  target: PARTICIPATION_STATUS.ENROLLED,
  actionKey: 'change_enrollment.resume',
  consequenceKey: 'change_enrollment.resume_confirmation',
} as const satisfies EnrollmentTransition;
const ENROLL = { ...RESUME, actionKey: 'change_enrollment.enroll' } as const satisfies EnrollmentTransition;
/** A hard stop on the phone: collection ends and rows not yet uploaded are cleared. */
const MARK_NOT_ENROLLED = {
  target: PARTICIPATION_STATUS.NOT_ENROLLED,
  actionKey: 'change_enrollment.mark_not_enrolled',
  consequenceKey: 'change_enrollment.not_enrolled_consequence',
} as const satisfies EnrollmentTransition;

/** The changes the dialog offers from each status; the first is the primary action. */
export const ENROLLMENT_TRANSITIONS = {
  ENROLLED: [PAUSE, MARK_NOT_ENROLLED],
  NOT_ENROLLED: [ENROLL],
  PAUSED: [RESUME, MARK_NOT_ENROLLED],
  COLLECTION_COMPLETED: [RESUME, MARK_NOT_ENROLLED],
  UNKNOWN: [ENROLL, MARK_NOT_ENROLLED],
  ERASED: [ENROLL],
} as const satisfies Record<ParticipationStatus, readonly [EnrollmentTransition, ...EnrollmentTransition[]]>;

export function canChangeEnrollment(participant: Participant): boolean {
  return !participant.withdrawnAt && participant.participationStatus !== PARTICIPATION_STATUS.ERASED;
}

export function getStatusVariant(status: unknown) {
  switch (status) {
    case PARTICIPATION_STATUS.ENROLLED:
      return 'success' as const;
    case PARTICIPATION_STATUS.PAUSED:
      return 'warning' as const;
    case PARTICIPATION_STATUS.COLLECTION_COMPLETED:
      return 'default' as const;
    case PARTICIPATION_STATUS.NOT_ENROLLED:
      return 'outline' as const;
    default:
      return 'muted' as const;
  }
}
