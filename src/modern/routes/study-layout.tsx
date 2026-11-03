import { CircleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router';
import { DeletionStatusCard } from '@/components/deletion-status-card';
import { RouteOutlet } from '@/components/error-boundary';
import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { RouteSkeleton, StatePanel } from '@/components/state-panel';
import { type StudyFormData, StudyFormDialog } from '@/components/study-form-dialog';
import { StudyNotices } from '@/components/study-notices';
import { Badge } from '@/components/ui/badge';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage, isRetryableHttpStatus } from '@/lib/errors';
import {
  buildStudyParticipantPolicy,
  EMPTY_PARTICIPANT_POLICY_FORM,
  participantPolicyUnchanged,
} from '@/lib/participant-policy';
import {
  buildAppUsageSurveySetting,
  buildDataCollectionSetting,
  buildStudyLimits,
  buildStudyUpdatePayload,
  buildTimeUseDiarySetting,
  buildWithdrawalSetting,
  studyLimitsUnchanged,
} from '@/lib/study-form-helpers';
import { studyFeatureLabel, studyNavigationActionError, studyNavigationFailedSteps } from '@/lib/study-navigation';
import {
  STUDY_SAVE_STEP,
  StudySaveError,
  type StudySaveFailure,
  saveStep,
  settingWrites,
  writeSettingsInOrder,
} from '@/lib/study-save';
import { allStudyTabs } from '@/lib/study-tabs';
import { cn } from '@/lib/utils';
import { isSettingsConflict, StudySettingsConflictError } from '@/state/settings-revision';
import {
  type StudyLifecycleStatus,
  useGetStudyDeletionsQuery,
  useGetStudyLifecycleStatusQuery,
  useGetStudyLimitsQuery,
  useGetStudySummaryQuery,
  useSetStudyLimitsMutation,
  useUpdateStudyMutation,
  useUpdateStudySettingsMutation,
} from '@/state/study-operations-api';

import {
  getAuthoritativeStudyLifecycleStatus,
  getStudyLifecycleActionVisibility,
  StudyLifecycleActions,
} from './study-layout/lifecycle-actions';

function useStudySave({ studyId, canEdit }: { studyId: string; canEdit: boolean }) {
  const { t } = useTranslator();
  const allowed = useRef(canEdit);
  allowed.current = canEdit;
  const [updateStudy] = useUpdateStudyMutation();
  const [updateStudySettings] = useUpdateStudySettingsMutation();
  const [setStudyLimits] = useSetStudyLimitsMutation();
  return async (form: StudyFormData, context: { settingsRevision?: string | undefined }) => {
    if (!allowed.current) {
      throw new Error(t('study_layout.status_unavailable_reload'));
    }

    const policyForm = form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM;
    // Enrollment locks the participant policy server-side. Re-sending an identical copy
    // would be rejected for no gain, so an untouched policy is simply not written.
    const participantPolicy = participantPolicyUnchanged(policyForm, form.loadedParticipantPolicy)
      ? null
      : buildStudyParticipantPolicy(policyForm);
    // Untouched limits are not re-sent: the PUT is admin-only and re-derives the study end
    // date from "now", so a title edit would otherwise move it (and 403 for others). A cleared
    // duration is sent without one, which means the study has no end.
    const limits = studyLimitsUnchanged(form) ? null : buildStudyLimits(form);

    // The settings PATCHes run in order (see writeSettingsInOrder); every failed step is
    // named in the error so the user knows exactly what did not persist.
    const writes = settingWrites({
      AppUsageSurvey: buildAppUsageSurveySetting(form),
      Withdrawal: buildWithdrawalSetting(form),
      TimeUseDiary: buildTimeUseDiarySetting(form),
      DataCollection: buildDataCollectionSetting(form),
      ParticipantPolicy: participantPolicy,
    });

    // Each write follows the revision loaded by the form, then the preceding successful write.
    const requireRevision = () => {
      if (!context.settingsRevision) {
        throw new StudySaveError({
          failures: [
            {
              step: STUDY_SAVE_STEP.details,
              error: new StudySettingsConflictError(t('study_layout.settings_conflict')),
            },
          ],
          t,
        });
      }
      return context.settingsRevision;
    };
    const assertSaved = (failures: StudySaveFailure[], unattempted: StudySaveFailure['step'][] = []) => {
      if (!failures.length) return;
      throw new StudySaveError({
        failures: [...failures, ...unattempted.map((step) => ({ step, error: undefined }))],
        t,
      });
    };
    requireRevision();
    const settings = await writeSettingsInOrder(
      writes,
      async (write) => {
        const result = await updateStudySettings({ studyId, ifMatch: requireRevision(), ...write }).unwrap();
        context.settingsRevision = result.settingsRevision;
        return result;
      },
      isSettingsConflict,
    );
    assertSaved(settings.failures, [STUDY_SAVE_STEP.details, ...(limits ? [STUDY_SAVE_STEP.limits] : [])]);
    assertSaved(
      await saveStep(
        STUDY_SAVE_STEP.details,
        updateStudy({ studyId, study: buildStudyUpdatePayload(form), ifMatch: requireRevision() })
          .unwrap()
          .then((result) => {
            context.settingsRevision = result.settingsRevision;
          }),
      ),
      limits ? [STUDY_SAVE_STEP.limits] : [],
    );
    if (limits)
      assertSaved(
        await saveStep(
          STUDY_SAVE_STEP.limits,
          setStudyLimits({ studyId, limits, ifMatch: requireRevision() }).unwrap(),
        ),
      );
  };
}

function useStudyLayoutQueries(studyId: string) {
  const {
    data: study,
    error,
    isError,
    isLoading,
    refetch: refetchStudy,
  } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: lifecycleStatus,
    isError: isLifecycleError,
    isFetching: isLifecycleFetching,
    isSuccess: isLifecycleSuccess,
  } = useGetStudyLifecycleStatusQuery(studyId, { skip: !studyId });

  const { data: limits } = useGetStudyLimitsQuery(studyId, {
    skip: !studyId,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
  });

  const status = getAuthoritativeStudyLifecycleStatus({
    data: lifecycleStatus,
    isError: isLifecycleError,
    isFetching: isLifecycleFetching,
    isSuccess: isLifecycleSuccess,
  });

  const errorStatus = (error as { status?: number | string } | undefined)?.status;
  const canRetainStudy = !!study && (typeof errorStatus !== 'number' || isRetryableHttpStatus(errorStatus));
  return { study, error, isError, isLoading, refetchStudy, isLifecycleFetching, limits, status, canRetainStudy };
}

function StudyLoadFailure({ error, studyId, onRetry }: { error: unknown; studyId: string; onRetry: () => unknown }) {
  const { t } = useTranslator();
  const status = (error as { status?: number } | undefined)?.status;
  const isNotFound = status === 404;
  const isAuthError = status === 401 || status === 403;
  return (
    <StatePanel
      description={
        isNotFound
          ? t('study_layout.not_found_description', { studyId })
          : isAuthError
            ? t('study_layout.access_denied_description')
            : `${getErrorMessage(error, t('study_layout.load_error_fallback'))} ${t('study_layout.load_error_suffix')}`
      }
      eyebrow={isNotFound ? t('common.not_found') : isAuthError ? t('common.access_denied') : t('common.error')}
      icon={<CircleAlert className="h-5 w-5" />}
      onRetry={onRetry}
      title={isNotFound ? t('study_layout.not_found_title') : t('study_layout.unavailable_title')}
      tone="destructive"
    />
  );
}

/**
 * A study erasure hides the study summary until it is erased or cancelled, so the owner's controls
 * render from the lifecycle status and the deletion list instead.
 */
function HiddenStudyDeletionPanel({
  studyId,
  status,
  isLifecycleFetching,
}: {
  studyId: string;
  status: StudyLifecycleStatus;
  isLifecycleFetching: boolean;
}) {
  const { t } = useTranslator();
  const deletions = useGetStudyDeletionsQuery(studyId, { refetchOnMountOrArgChange: true });
  return (
    <div className="space-y-6">
      <SectionHeader
        actions={<StudyLifecycleActions studyId={studyId} title={studyId} status={status} />}
        description={t('study_layout.section')}
        eyebrow={t('study_layout.section')}
        title={studyId}
      />
      <StudyNotices
        isLifecycleFetching={isLifecycleFetching}
        status={status}
        studyDataExpires={undefined}
        actionError={null}
        createFailedSteps={[]}
      />
      <DeletionStatusCard
        studyId={studyId}
        operations={deletions.currentData ?? []}
        error={deletions.isError ? getErrorMessage(deletions.error, t('participants.refresh_deletion_failed')) : null}
        isFetching={deletions.isFetching}
        onRefresh={() => void deletions.refetch()}
      />
    </div>
  );
}

function StudyNavigation({ modules }: { modules: string[] }) {
  const { t } = useTranslator();
  const visibleTabs = allStudyTabs.filter((tab) => tab.module === null || modules.includes(tab.module));
  return (
    <>
      {/* Module badges */}
      {modules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {modules.map((mod) => (
            <Badge casing="natural" key={mod} variant="muted">
              {translateCatalog(t, 'feature', mod, studyFeatureLabel(mod))}
            </Badge>
          ))}
        </div>
      )}
      {/* Tab navigation — conditional on study modules */}
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {visibleTabs.map(({ icon: Icon, labelKey, to }) => (
          <NavLink
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )
            }
            end={to === ''}
            key={to}
            to={to}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function StudyLayout() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { t } = useTranslator();
  const { study, error, isError, isLoading, refetchStudy, isLifecycleFetching, limits, status, canRetainStudy } =
    useStudyLayoutQueries(studyId);
  const [actionError] = useState<string | null>(() => studyNavigationActionError(location.state));
  const [createFailedSteps] = useState(() => studyNavigationFailedSteps(location.state));
  const lifecycleActions = getStudyLifecycleActionVisibility(status);
  const canEdit = lifecycleActions.showEdit && !isError;
  const handleEditStudy = useStudySave({ studyId, canEdit });
  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);
  if (!studyId) return <MissingStudyIdPanel section={t('study_layout.section')} />;
  if (isLoading) return <RouteSkeleton />;
  if (isError && status === 'SCHEDULED_FOR_DELETION')
    return <HiddenStudyDeletionPanel studyId={studyId} status={status} isLifecycleFetching={isLifecycleFetching} />;
  const failure = <StudyLoadFailure error={error} studyId={studyId} onRetry={refetchStudy} />;
  if (isError && !canRetainStudy) return failure;
  return (
    <div className="space-y-6">
      <SectionHeader
        actions={
          <div className="flex items-center gap-2">
            {study && (
              <StudyFormDialog key={studyId} canEdit={canEdit} mode="edit" onSubmit={handleEditStudy} study={study} />
            )}
            <StudyLifecycleActions
              studyId={studyId}
              title={study?.title ?? ''}
              status={status}
              settingsRevision={study?.settingsRevision}
            />
          </div>
        }
        description={study?.description || t('common.no_description')}
        eyebrow={
          study?.version ? t('study_layout.version_eyebrow', { version: study.version }) : t('study_layout.section')
        }
        title={study?.title || studyId}
      />
      {isError && failure}
      <StudyNotices
        isLifecycleFetching={isLifecycleFetching}
        status={status}
        studyDataExpires={limits?.studyDataExpires ?? undefined}
        actionError={actionError}
        createFailedSteps={createFailedSteps}
      />
      <StudyNavigation modules={modules} />
      <RouteOutlet />
    </div>
  );
}
