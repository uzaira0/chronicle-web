import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CircleAlert,
  ClipboardList,
  Clock3,
  FileArchive,
  History,
  LoaderCircle,
  MoreVertical,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router';

import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import { SectionHeader } from '@/components/section-header';
import { StatePanel } from '@/components/state-panel';
import { type StudyFormData, StudyFormDialog } from '@/components/study-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { buildStudyParticipantPolicy, EMPTY_PARTICIPANT_POLICY_FORM } from '@/lib/participant-policy';
import { STUDY_FEATURES, type StudyModule } from '@/lib/study-constants';
import {
  buildDataCollectionSetting,
  buildIosSensorSetting,
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
} from '@/lib/study-form-helpers';
import { PARTIAL_STUDY_CONFIGURATION_ERROR, studyNavigationActionError } from '@/lib/study-navigation';
import { cn } from '@/lib/utils';
import {
  type StudyLifecycleStatus,
  useArchiveStudyMutation,
  useCancelScheduledDeletionMutation,
  useGetStudyLifecycleStatusQuery,
  useGetStudySummaryQuery,
  useScheduleStudyDeletionMutation,
  useSetStudyLimitsMutation,
  useUnarchiveStudyMutation,
  useUpdateStudyMutation,
  useUpdateStudySettingsMutation,
} from '@/state/study-operations-api';

const allStudyTabs: ReadonlyArray<{
  icon: typeof ClipboardList;
  labelKey: string;
  module: StudyModule | null;
  to: string;
}> = [
  { icon: ClipboardList, labelKey: 'study_layout.tab_overview', module: null, to: '' },
  { icon: Users, labelKey: 'study_layout.tab_participants', module: null, to: 'participants' },
  {
    icon: SlidersHorizontal,
    labelKey: 'study_layout.tab_preprocessing',
    module: 'CHRONICLE_DATA_COLLECTION',
    to: 'preprocessing',
  },
  { icon: FileArchive, labelKey: 'study_layout.tab_downloads', module: null, to: 'downloads' },
  { icon: ScrollText, labelKey: 'study_layout.tab_questionnaires', module: 'CHRONICLE_SURVEYS', to: 'questionnaires' },
  { icon: Shield, labelKey: 'study_layout.tab_compliance', module: null, to: 'compliance' },
  { icon: Clock3, labelKey: 'study_layout.tab_tud', module: 'TIME_USE_DIARY', to: 'time-use-diary' },
  { icon: History, labelKey: 'study_layout.tab_audit', module: null, to: 'audit' },
];

const FEATURE_LABELS = new Map<string, string>(STUDY_FEATURES.map(({ label, value }) => [value, label]));

function moduleLabel(moduleId: string) {
  return FEATURE_LABELS.get(moduleId) ?? moduleId.replace(/_/g, ' ');
}

function LifecycleBanner({ isPending, status }: { isPending: boolean; status: StudyLifecycleStatus | undefined }) {
  const { t } = useTranslator();
  if (status === 'ACTIVE') return null;

  // An in-flight refetch also reports an undefined (non-authoritative) status. Staying
  // quiet while the request is still outstanding keeps a routine background refresh from
  // flashing the "status unavailable" alarm; a genuine failure still surfaces below.
  if (status === undefined && isPending) return null;

  if (status === 'ARCHIVED') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        <Archive className="h-4 w-4 shrink-0" />
        {t('study_layout.banner_archived')}
      </div>
    );
  }

  if (status === 'SCHEDULED_FOR_DELETION') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t('study_layout.banner_scheduled')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
      <CircleAlert className="h-4 w-4 shrink-0" />
      {t('study_layout.banner_unavailable')}
    </div>
  );
}

type StudyLifecycleActionVisibility = Readonly<{
  showActions: boolean;
  showArchive: boolean;
  showDelete: boolean;
  showEdit: boolean;
  showRestore: boolean;
}>;

/** @internal Exported for focused action-visibility regression tests. */
export function getStudyLifecycleActionVisibility(status: unknown): StudyLifecycleActionVisibility {
  switch (status) {
    case 'ACTIVE':
      return { showActions: true, showArchive: true, showDelete: true, showEdit: true, showRestore: false };
    case 'ARCHIVED':
      return { showActions: true, showArchive: false, showDelete: true, showEdit: true, showRestore: true };
    case 'SCHEDULED_FOR_DELETION':
      return { showActions: true, showArchive: false, showDelete: false, showEdit: false, showRestore: true };
    default:
      return { showActions: false, showArchive: false, showDelete: false, showEdit: false, showRestore: false };
  }
}

type StudyLifecycleQueryAuthority = Readonly<{
  data: StudyLifecycleStatus | undefined;
  isError: boolean;
  isFetching: boolean;
  isSuccess: boolean;
}>;

/** Cached RTK Query data is authoritative only after the current request succeeds and settles. */
export function getAuthoritativeStudyLifecycleStatus({
  data,
  isError,
  isFetching,
  isSuccess,
}: StudyLifecycleQueryAuthority): StudyLifecycleStatus | undefined {
  return isSuccess && !isFetching && !isError ? data : undefined;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This layout owns route-level loading/error/action/dialog state; extraction would obscure the flow more than it reduces risk.
export function StudyLayout() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { data: study, error, isError, isLoading } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: lifecycleStatus,
    isError: isLifecycleError,
    isFetching: isLifecycleFetching,
    isSuccess: isLifecycleSuccess,
  } = useGetStudyLifecycleStatusQuery(studyId, { skip: !studyId });
  const [updateStudy] = useUpdateStudyMutation();
  const [updateStudySettings] = useUpdateStudySettingsMutation();
  const [setStudyLimits] = useSetStudyLimitsMutation();
  const [archiveStudy, { isLoading: isArchiving }] = useArchiveStudyMutation();
  const [unarchiveStudy, { isLoading: isUnarchiving }] = useUnarchiveStudyMutation();
  const [cancelScheduledDeletion, { isLoading: isCancellingDeletion }] = useCancelScheduledDeletionMutation();
  const [scheduleStudyDeletion, { isLoading: isDeleting }] = useScheduleStudyDeletionMutation();
  const navigate = useNavigate();
  const { t } = useTranslator();

  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [actionError, setActionError] = useState<string | null>(() => studyNavigationActionError(location.state));

  const status = getAuthoritativeStudyLifecycleStatus({
    data: lifecycleStatus,
    isError: isLifecycleError,
    isFetching: isLifecycleFetching,
    isSuccess: isLifecycleSuccess,
  });
  const lifecycleActions = getStudyLifecycleActionVisibility(status);
  const lifecycleActionsRef = useRef(lifecycleActions);
  lifecycleActionsRef.current = lifecycleActions;
  const isScheduledForDeletion = status === 'SCHEDULED_FOR_DELETION';
  const deleteConfirmMatch = deleteConfirmText.trim() === (study?.title ?? '').trim();

  useEffect(() => {
    if (!lifecycleActions.showArchive) setShowArchiveDialog(false);
    if (!lifecycleActions.showRestore) setShowRestoreDialog(false);
    if (!lifecycleActions.showDelete) {
      setShowDeleteDialog(false);
      setDeleteConfirmText('');
    }
  }, [lifecycleActions.showArchive, lifecycleActions.showDelete, lifecycleActions.showRestore]);

  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);

  const visibleTabs = useMemo(
    () => allStudyTabs.filter((tab) => tab.module === null || modules.includes(tab.module)),
    [modules],
  );

  if (!studyId) {
    return <MissingStudyIdPanel section={t('study_layout.section')} />;
  }

  if (isLoading) {
    return (
      <StatePanel
        description={t('study_layout.loading_description')}
        eyebrow={t('study_layout.section')}
        icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
        title={t('study_layout.loading_title')}
      />
    );
  }

  if (isError) {
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
        title={isNotFound ? t('study_layout.not_found_title') : t('study_layout.unavailable_title')}
        tone="destructive"
      />
    );
  }

  const handleEditStudy = async (form: StudyFormData) => {
    if (!lifecycleActionsRef.current.showEdit) {
      throw new Error(t('study_layout.status_unavailable_reload'));
    }

    const sensorSetting = buildSensorSetting(form);
    const iosSensorSetting = buildIosSensorSetting(form, true);
    const dataCollection = buildDataCollectionSetting(form);
    const participantPolicy = buildStudyParticipantPolicy(form.participantPolicy ?? EMPTY_PARTICIPANT_POLICY_FORM);
    const limits = buildStudyLimits(form);

    // The settings PATCHes share a read-merge-write of the full settings map, so
    // they must run sequentially or they would clobber each other. The general study
    // update and the limits write touch disjoint columns and run in parallel.
    const writeSettings = async () => {
      // Write the legally significant policy first. If the server has locked it
      // after enrollment activity, stop before applying other setting changes.
      await updateStudySettings({
        studyId,
        settingType: 'ParticipantPolicy',
        setting: participantPolicy,
      }).unwrap();
      if (sensorSetting) {
        await updateStudySettings({ studyId, settingType: 'AndroidSensor', setting: sensorSetting }).unwrap();
      }
      await updateStudySettings({ studyId, settingType: 'Sensor', setting: iosSensorSetting }).unwrap();
      if (dataCollection) {
        await updateStudySettings({ studyId, settingType: 'DataCollection', setting: dataCollection }).unwrap();
      }
    };

    const results = await Promise.allSettled([
      updateStudy({ studyId, study: buildStudyPayload(form) }).unwrap(),
      writeSettings(),
      limits ? setStudyLimits({ studyId, limits }).unwrap() : null,
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(t('study_layout.some_changes_failed'));
    }
  };

  const handleArchive = async () => {
    if (!lifecycleActionsRef.current.showArchive) {
      setShowArchiveDialog(false);
      return;
    }
    setActionError(null);
    try {
      await archiveStudy(studyId).unwrap();
      setShowArchiveDialog(false);
    } catch (err) {
      setActionError(getErrorMessage(err, t('study_layout.archive_failed')));
    }
  };

  const handleUnarchive = async () => {
    if (!lifecycleActionsRef.current.showRestore) {
      setShowRestoreDialog(false);
      return;
    }
    setActionError(null);
    try {
      if (isScheduledForDeletion) {
        await cancelScheduledDeletion(studyId).unwrap();
      } else {
        await unarchiveStudy(studyId).unwrap();
      }
      setShowRestoreDialog(false);
    } catch (err) {
      setActionError(
        getErrorMessage(
          err,
          isScheduledForDeletion ? t('study_layout.cancel_deletion_failed') : t('study_layout.restore_failed'),
        ),
      );
    }
  };

  const handleDelete = async () => {
    if (!lifecycleActionsRef.current.showDelete) {
      setShowDeleteDialog(false);
      setDeleteConfirmText('');
      return;
    }
    setActionError(null);
    try {
      await scheduleStudyDeletion({ deleteAfter: new Date().toISOString(), studyId }).unwrap();
      setShowDeleteDialog(false);
      await navigate('/studies');
    } catch (err) {
      setActionError(getErrorMessage(err, t('study_layout.schedule_deletion_failed')));
    }
  };

  return (
    <div className="space-y-6">
      {/* Study header */}
      <SectionHeader
        actions={
          lifecycleActions.showActions ? (
            <div className="flex items-center gap-2">
              {study && lifecycleActions.showEdit && (
                <StudyFormDialog mode="edit" onSubmit={handleEditStudy} study={study} />
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={t('study_layout.actions_aria')} size="icon" variant="outline">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {lifecycleActions.showArchive && (
                    <DropdownMenuItem
                      onClick={() => {
                        setActionError(null);
                        setShowArchiveDialog(true);
                      }}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      {t('study_layout.archive')}
                    </DropdownMenuItem>
                  )}
                  {lifecycleActions.showRestore && (
                    <DropdownMenuItem
                      onClick={() => {
                        setActionError(null);
                        setShowRestoreDialog(true);
                      }}
                    >
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                      {isScheduledForDeletion ? t('study_layout.cancel_deletion') : t('study_layout.restore')}
                    </DropdownMenuItem>
                  )}
                  {lifecycleActions.showDelete && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setActionError(null);
                        setDeleteConfirmText('');
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('study_layout.delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null
        }
        description={study?.description || t('common.no_description')}
        eyebrow={
          study?.version ? t('study_layout.version_eyebrow', { version: study.version }) : t('study_layout.section')
        }
        title={study?.title || studyId}
      />

      {/* Lifecycle banner */}
      <LifecycleBanner isPending={isLifecycleFetching} status={status} />

      {actionError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError === PARTIAL_STUDY_CONFIGURATION_ERROR
            ? t('study_layout.partial_configuration_error')
            : actionError}
        </div>
      )}

      {/* Module badges */}
      {modules.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {modules.map((mod) => (
            <Badge className="normal-case tracking-normal" key={mod} variant="muted">
              {translateCatalog(t, 'feature', mod, moduleLabel(mod))}
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

      {/* Tab content */}
      <Outlet />

      {/* Archive confirmation dialog */}
      <Dialog
        onOpenChange={(open) => {
          setShowArchiveDialog(open && lifecycleActions.showArchive);
          if (!open) setActionError(null);
        }}
        open={showArchiveDialog && lifecycleActions.showArchive}
      >
        <DialogContent className="w-[min(92vw,28rem)]">
          <DialogTitle>{t('study_layout.archive')}</DialogTitle>
          <DialogDescription>{t('study_layout.archive_description', { title: study?.title ?? '' })}</DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setShowArchiveDialog(false)} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isArchiving || !lifecycleActions.showArchive}
              onClick={() => {
                handleArchive().catch((err) => {
                  setActionError(getErrorMessage(err, t('study_layout.archive_failed')));
                });
              }}
            >
              {isArchiving ? t('study_layout.archiving') : t('study_layout.archive')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore / Cancel Deletion confirmation dialog */}
      <Dialog
        onOpenChange={(open) => {
          setShowRestoreDialog(open && lifecycleActions.showRestore);
          if (!open) setActionError(null);
        }}
        open={showRestoreDialog && lifecycleActions.showRestore}
      >
        <DialogContent className="w-[min(92vw,28rem)]">
          <DialogTitle>
            {isScheduledForDeletion ? t('study_layout.cancel_deletion') : t('study_layout.restore')}
          </DialogTitle>
          <DialogDescription>
            {t(
              isScheduledForDeletion ? 'study_layout.cancel_deletion_description' : 'study_layout.restore_description',
              {
                title: study?.title ?? '',
              },
            )}
          </DialogDescription>
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setShowRestoreDialog(false)} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={
                (isScheduledForDeletion ? isCancellingDeletion : isUnarchiving) || !lifecycleActions.showRestore
              }
              onClick={() => {
                handleUnarchive().catch((err) => {
                  setActionError(
                    getErrorMessage(
                      err,
                      isScheduledForDeletion
                        ? t('study_layout.cancel_deletion_failed')
                        : t('study_layout.restore_failed'),
                    ),
                  );
                });
              }}
            >
              {isScheduledForDeletion
                ? isCancellingDeletion
                  ? t('study_layout.cancelling')
                  : t('study_layout.cancel_deletion')
                : isUnarchiving
                  ? t('study_layout.restoring')
                  : t('study_layout.restore')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Type-to-confirm delete dialog */}
      <Dialog
        onOpenChange={(open) => {
          setShowDeleteDialog(open && lifecycleActions.showDelete);
          if (!open) setActionError(null);
        }}
        open={showDeleteDialog && lifecycleActions.showDelete}
      >
        <DialogContent className="w-[min(92vw,28rem)]">
          <DialogTitle className="text-destructive">{t('study_layout.delete')}</DialogTitle>
          <DialogDescription>{t('study_layout.delete_description')}</DialogDescription>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {t('study_layout.type_to_confirm_before')} <strong className="text-foreground">{study?.title}</strong>{' '}
              {t('study_layout.type_to_confirm_after')}
            </p>
            <Input
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={study?.title}
              value={deleteConfirmText}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button onClick={() => setShowDeleteDialog(false)} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isDeleting || !deleteConfirmMatch || !lifecycleActions.showDelete}
              onClick={() => {
                handleDelete().catch((err) => {
                  setActionError(getErrorMessage(err, t('study_layout.schedule_deletion_failed')));
                });
              }}
              variant="destructive"
            >
              {isDeleting ? t('study_layout.scheduling') : t('study_layout.schedule_deletion')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
