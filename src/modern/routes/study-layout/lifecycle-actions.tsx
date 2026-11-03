import { Archive, ArchiveRestore, MoreVertical, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { AsyncConfirmDialog } from '@/components/async-confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useTranslator } from '@/i18n';
import {
  type StudyLifecycleStatus,
  useArchiveStudyMutation,
  useCancelScheduledDeletionMutation,
  useScheduleStudyDeletionMutation,
  useUnarchiveStudyMutation,
} from '@/state/study-operations-api';

export type StudyLifecycleActionVisibility = Readonly<{
  showActions: boolean;
  showArchive: boolean;
  showDelete: boolean;
  showEdit: boolean;
  showRestore: boolean;
}>;

/** @internal Exported for focused action-visibility regression tests. */
export function getStudyLifecycleActionVisibility(
  status: StudyLifecycleStatus | null | undefined,
): StudyLifecycleActionVisibility {
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

const DIALOG_COPY = {
  archive: {
    title: 'study_layout.archive',
    description: 'study_layout.archive_description',
    confirm: 'study_layout.archive',
    pending: 'study_layout.archiving',
  },
  restore: {
    title: 'study_layout.restore',
    description: 'study_layout.restore_description',
    confirm: 'study_layout.restore',
    pending: 'study_layout.restoring',
  },
  cancel: {
    title: 'study_layout.cancel_deletion',
    description: 'study_layout.cancel_deletion_description',
    confirm: 'study_layout.cancel_deletion',
    pending: 'study_layout.cancelling',
  },
  delete: {
    title: 'study_layout.delete',
    description: 'study_layout.delete_request_description',
    confirm: 'study_layout.request_deletion',
    pending: 'study_layout.requesting',
  },
} as const;

type LifecycleActionKind = 'archive' | 'restore' | 'delete';
type LifecycleAction = {
  allowed: boolean;
  copy: (typeof DIALOG_COPY)[keyof typeof DIALOG_COPY];
  run: () => Promise<unknown>;
  failureKey:
    | 'study_layout.archive_failed'
    | 'study_layout.cancel_deletion_failed'
    | 'study_layout.restore_failed'
    | 'study_layout.request_deletion_failed';
};
type LifecycleActionTable = Record<LifecycleActionKind, LifecycleAction>;

function useLifecycleActionTable(
  studyId: string,
  status: StudyLifecycleStatus | undefined,
  settingsRevision: string | undefined,
): LifecycleActionTable {
  const [archive] = useArchiveStudyMutation();
  const [restore] = useUnarchiveStudyMutation();
  const [cancelDeletion] = useCancelScheduledDeletionMutation();
  const [deleteStudy] = useScheduleStudyDeletionMutation();
  const visibility = getStudyLifecycleActionVisibility(status);
  const scheduled = status === 'SCHEDULED_FOR_DELETION';
  // Archive and restore apply only to the revision the page read; until it is known they would be blind writes.
  const revisionKnown = settingsRevision !== undefined;
  return {
    archive: {
      allowed: visibility.showArchive && revisionKnown,
      copy: DIALOG_COPY.archive,
      run: () => archive({ studyId, ifMatch: settingsRevision }).unwrap(),
      failureKey: 'study_layout.archive_failed',
    },
    restore: {
      allowed: visibility.showRestore && (scheduled || revisionKnown),
      copy: DIALOG_COPY[scheduled ? 'cancel' : 'restore'],
      run: () =>
        scheduled ? cancelDeletion(studyId).unwrap() : restore({ studyId, ifMatch: settingsRevision }).unwrap(),
      failureKey: scheduled ? 'study_layout.cancel_deletion_failed' : 'study_layout.restore_failed',
    },
    delete: {
      allowed: visibility.showDelete,
      copy: DIALOG_COPY.delete,
      run: async () => {
        // Stay: the study page now offers Cancel deletion and Erase now, which the studies list cannot.
        await deleteStudy(studyId).unwrap();
      },
      failureKey: 'study_layout.request_deletion_failed',
    },
  };
}

function useGuardedLifecycleAction(table: LifecycleActionTable) {
  const [kind, setKind] = useState<LifecycleActionKind | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const latest = useRef(table);
  latest.current = table;
  const cancel = () => {
    setKind(null);
    setConfirmText('');
  };
  const open = (next: LifecycleActionKind) => {
    setConfirmText('');
    setKind(latest.current[next].allowed ? next : null);
  };
  const confirm = async () => {
    if (kind === null || !latest.current[kind].allowed) return;
    await latest.current[kind].run();
  };
  return { kind, confirmText, setConfirmText, open, cancel, confirm };
}

function StudyActionMenu({
  visibility,
  table,
  isScheduledForDeletion,
  onArchive,
  onRestore,
  onDelete,
}: {
  visibility: StudyLifecycleActionVisibility;
  table: LifecycleActionTable;
  isScheduledForDeletion: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslator();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t('study_layout.actions_aria')} size="icon" variant="outline">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visibility.showArchive && (
          <DropdownMenuItem disabled={!table.archive.allowed} onClick={onArchive}>
            <Archive className="mr-2 h-4 w-4" />
            {t('study_layout.archive')}
          </DropdownMenuItem>
        )}
        {visibility.showRestore && (
          <DropdownMenuItem disabled={!table.restore.allowed} onClick={onRestore}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            {isScheduledForDeletion ? t('study_layout.cancel_deletion') : t('study_layout.restore')}
          </DropdownMenuItem>
        )}
        {visibility.showDelete && (
          <DropdownMenuItem disabled={!table.delete.allowed} variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('study_layout.delete')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StudyLifecycleActions({
  studyId,
  title,
  status,
  settingsRevision,
}: {
  studyId: string;
  title: string;
  status: StudyLifecycleStatus | undefined;
  /** The study revision the page shows; archive and restore apply only to it. */
  settingsRevision?: string | undefined;
}) {
  const { t } = useTranslator();
  const visibility = getStudyLifecycleActionVisibility(status);
  const table = useLifecycleActionTable(studyId, status, settingsRevision);
  const action = useGuardedLifecycleAction(table);
  return (
    <>
      {visibility.showActions && (
        <StudyActionMenu
          visibility={visibility}
          table={table}
          isScheduledForDeletion={status === 'SCHEDULED_FOR_DELETION'}
          onArchive={() => action.open('archive')}
          onRestore={() => action.open('restore')}
          onDelete={() => action.open('delete')}
        />
      )}
      {action.kind && (
        <AsyncConfirmDialog
          allowed={table[action.kind].allowed}
          open
          onClose={action.cancel}
          onConfirm={action.confirm}
          title={t(table[action.kind].copy.title)}
          description={t(table[action.kind].copy.description, { title })}
          confirmLabel={t(table[action.kind].copy.confirm)}
          pendingLabel={t(table[action.kind].copy.pending)}
          destructive={action.kind === 'delete'}
          disabled={action.kind === 'delete' && action.confirmText.trim() !== title.trim()}
          failureMessage={t(table[action.kind].failureKey)}
        >
          {action.kind === 'delete' && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                {t('study_layout.type_to_confirm_before')} <strong>{title}</strong>{' '}
                {t('study_layout.type_to_confirm_after')}
              </p>
              <Input
                aria-label={t('study_layout.delete_confirmation')}
                name="delete-study-confirmation"
                spellCheck={false}
                onChange={(event) => action.setConfirmText(event.target.value)}
                placeholder={title}
                value={action.confirmText}
              />
            </div>
          )}
        </AsyncConfirmDialog>
      )}
    </>
  );
}
