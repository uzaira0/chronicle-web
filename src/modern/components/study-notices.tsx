import { AlertTriangle, Archive, CircleAlert } from 'lucide-react';
import { STUDY_LIFECYCLE_STATUS } from '@/generated/chronicle-contracts';
import { useTranslator } from '@/i18n';
import { PARTIAL_STUDY_CONFIGURATION_ERROR } from '@/lib/study-navigation';
import { type StudySaveStep, studySaveStepList } from '@/lib/study-save';
import type { StudyLifecycleStatus } from '@/state/study-operations-api';

function LifecycleBanner({ isPending, status }: { isPending: boolean; status: StudyLifecycleStatus | undefined }) {
  const { t } = useTranslator();
  if (status === STUDY_LIFECYCLE_STATUS.ACTIVE) return null;

  // An in-flight refetch also reports an undefined (non-authoritative) status. Staying
  // quiet while the request is still outstanding keeps a routine background refresh from
  // flashing the "status unavailable" alarm; a genuine failure still surfaces below.
  if (status === undefined && isPending) return null;

  if (status === STUDY_LIFECYCLE_STATUS.ARCHIVED) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning-bg px-4 py-3 text-sm text-warning">
        <Archive className="h-4 w-4 shrink-0" />
        {t('study_layout.banner_archived')}
      </div>
    );
  }

  if (status === STUDY_LIFECYCLE_STATUS.SCHEDULED_FOR_DELETION) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('study_layout.banner_deletion_requested')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning-bg px-4 py-3 text-sm text-warning">
      <CircleAlert className="h-4 w-4 shrink-0" />
      {t('study_layout.banner_unavailable')}
    </div>
  );
}

export function StudyNotices({
  isLifecycleFetching,
  status,
  studyDataExpires,
  actionError,
  createFailedSteps,
}: {
  isLifecycleFetching: boolean;
  status: StudyLifecycleStatus | undefined;
  studyDataExpires: string | undefined;
  actionError: string | null;
  createFailedSteps: StudySaveStep[];
}) {
  const { t } = useTranslator();
  return (
    <>
      {/* Lifecycle banner */}
      <LifecycleBanner isPending={isLifecycleFetching} status={status} />
      {studyDataExpires && Date.parse(studyDataExpires) <= Date.now() && (
        <div role="alert" className="rounded-lg border border-warning/50 bg-warning-bg px-4 py-3 text-sm text-warning">
          {t('study_layout.banner_retention_ended')}
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError !== PARTIAL_STUDY_CONFIGURATION_ERROR
            ? actionError
            : createFailedSteps.length > 0
              ? t('study_layout.created_changes_not_saved', { steps: studySaveStepList(createFailedSteps, t) })
              : t('study_layout.partial_configuration_error')}
        </div>
      )}
    </>
  );
}
