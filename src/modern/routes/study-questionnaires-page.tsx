import { CircleAlert, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { MissingStudyIdPanel } from '@/components/missing-study-id-panel';
import {
  DeleteQuestionnaireModal,
  QuestionnaireBuilder,
  QuestionnaireListItem,
  QuestionnairePreviewModal,
} from '@/components/questionnaires';
import { SectionHeader } from '@/components/section-header';
import { StatePanel, TableSkeleton } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { getMutationRequestState } from '@/lib/request-state';
import { useResearcherCreateIntent } from '@/lib/use-researcher-create-intent';
import { isConditionalWriteFailure } from '@/state/settings-revision';
import {
  type QuestionnaireDraft,
  useCreateQuestionnaireMutation,
  useDeleteQuestionnaireMutation,
  useDownloadQuestionnaireResponsesMutation,
  useGetStudyQuestionnairesQuery,
  useGetStudySummaryQuery,
  useLoadQuestionnaireMutation,
  useUpdateQuestionnaireMutation,
} from '@/state/study-operations-api';

type ViewMode = 'create' | 'edit' | 'list';
type QuestionnaireEditDraft = { id: string; revision: string; draft: QuestionnaireDraft };

export function StudyQuestionnairesPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  return <QuestionnairesWorkspace key={studyId} studyId={studyId} />;
}

function QuestionnairesWorkspace({ studyId }: { studyId: string }) {
  const { t } = useTranslator();
  const {
    currentData: questionnaires = [],
    error: questionnairesError,
    isError,
    refetch: refetchQuestionnaires,
    isLoading,
  } = useGetStudyQuestionnairesQuery(studyId, {
    skip: !studyId,
  });
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });

  const [view, setView] = useState<ViewMode>('list');
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<QuestionnaireEditDraft | null>(null);
  const revision = editingQuestionnaire?.revision;
  const [conflict, setConflict] = useState(false);
  const [loadSnapshot] = useLoadQuestionnaireMutation();
  const [previewTargetId, setPreviewTargetId] = useState<string | null>(null);
  const previewTarget = questionnaires.find(({ id }) => id === previewTargetId);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const deleteTarget = questionnaires.find(({ id }) => id === deleteTargetId);
  const [actionError, setActionError] = useState<string | null>(null);

  const createIntent = useResearcherCreateIntent(`/survey/${studyId}/questionnaire`);
  const [createQuestionnaire, createState] = useCreateQuestionnaireMutation();
  const [updateQuestionnaire, updateState] = useUpdateQuestionnaireMutation();
  const [deleteQuestionnaire, deleteState] = useDeleteQuestionnaireMutation();
  const [downloadResponses] = useDownloadQuestionnaireResponsesMutation();

  const builderRequestState =
    view === 'create' ? getMutationRequestState(createState) : getMutationRequestState(updateState);
  const deleteRequestState = getMutationRequestState(deleteState);

  const sortedQuestionnaires = useMemo(
    () => [...questionnaires].sort((left, right) => right.title.localeCompare(left.title)),
    [questionnaires],
  );

  if (!studyId) {
    return <MissingStudyIdPanel section={t('questionnaires.section')} />;
  }

  const handleCreate = async (questionnaire: QuestionnaireDraft) => {
    setActionError(null);
    try {
      const intent = await createIntent.currentIntent({ questionnaire, studyId });
      await createQuestionnaire({
        questionnaire,
        studyId,
        idempotencyKey: intent.key,
      }).unwrap();
      await createIntent.acknowledge(intent);
      setView('list');
    } catch (error) {
      setActionError(getErrorMessage(error, t('questionnaires.create_failed')));
    }
  };

  const openEditor = async (questionnaireId: string) => {
    setActionError(null);
    try {
      const snapshot = await loadSnapshot({ studyId, questionnaireId }).unwrap();
      const { id, dateCreated: _dateCreated, ...draft } = snapshot.data;
      setEditingQuestionnaire({ id, revision: snapshot.revision, draft });
      setConflict(false);
      setView('edit');
    } catch (error) {
      setActionError(getErrorMessage(error, t('questionnaires.load_error_fallback')));
    }
  };

  const handleUpdate = async (questionnaire: QuestionnaireDraft) => {
    if (!editingQuestionnaire || !revision || conflict) {
      return;
    }

    setActionError(null);
    try {
      await updateQuestionnaire({
        questionnaire,
        questionnaireId: editingQuestionnaire.id,
        ifMatch: revision,
        studyId,
      }).unwrap();
      setEditingQuestionnaire(null);
      setView('list');
    } catch (error) {
      if (isConditionalWriteFailure(error)) {
        setConflict(true);
        setActionError(t('writes.conflict'));
      } else setActionError(getErrorMessage(error, t('questionnaires.update_failed')));
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) {
      return;
    }

    setActionError(null);

    deleteQuestionnaire({
      questionnaireId: deleteTarget.id,
      studyId,
    })
      .unwrap()
      .then(() => {
        setDeleteTargetId(null);
      })
      .catch((error) => {
        setActionError(getErrorMessage(error, t('questionnaires.delete_failed')));
      });
  };

  const headingTitle = study?.title
    ? t('questionnaires.title_for', { name: study.title })
    : t('questionnaires.title_for_study', { studyId });

  return (
    <div className="space-y-6">
      <SectionHeader
        size="compact"
        description={t('questionnaires.description')}
        eyebrow={t('questionnaires.section')}
        icon={<ScrollText className="h-3.5 w-3.5" />}
        title={headingTitle}
      />

      {actionError && (
        <StatePanel
          className="max-w-none"
          description={actionError}
          eyebrow={t('questionnaires.mutation_error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('questionnaires.action_failed')}
          tone="destructive"
        />
      )}

      {conflict && editingQuestionnaire && (
        <Button onClick={() => void openEditor(editingQuestionnaire.id)} variant="outline">
          {t('writes.reload_discard')}
        </Button>
      )}
      {isLoading && <TableSkeleton label={t('questionnaires.loading_title')} />}

      {!isLoading && isError && (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(questionnairesError, t('questionnaires.load_error_fallback'))}
          eyebrow={t('common.request_failed')}
          icon={<CircleAlert className="h-5 w-5" />}
          onRetry={refetchQuestionnaires}
          title={t('questionnaires.load_error_title')}
          tone="destructive"
        />
      )}

      {!isLoading && !isError && view === 'list' && (
        <div className="space-y-4">
          {sortedQuestionnaires.length === 0 && (
            <StatePanel
              className="max-w-none"
              description={t('questionnaires.empty_description')}
              eyebrow={t('common.empty_state')}
              icon={<ScrollText className="h-5 w-5" />}
              title={t('questionnaires.empty_title')}
            />
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => {
                setActionError(null);
                setEditingQuestionnaire(null);
                setView('create');
              }}
              type="button"
            >
              {t('questionnaires.create')}
            </Button>
          </div>

          {sortedQuestionnaires.map((questionnaire) => (
            <QuestionnaireListItem
              active={questionnaire.active}
              dateCreated={questionnaire.dateCreated ?? ''}
              description={questionnaire.description}
              key={questionnaire.id}
              onDelete={() => {
                setActionError(null);
                deleteState.reset();
                setDeleteTargetId(questionnaire.id);
              }}
              onDownloadResponses={() => {
                setActionError(null);
                void downloadResponses({ questionnaireId: questionnaire.id, studyId })
                  .unwrap()
                  .catch((err) => {
                    setActionError(getErrorMessage(err, t('questionnaires.download_responses_failed')));
                  });
              }}
              onEdit={() => {
                void openEditor(questionnaire.id);
              }}
              onPreview={() => setPreviewTargetId(questionnaire.id)}
              questionCount={questionnaire.questions.length}
              title={questionnaire.title}
            />
          ))}
        </div>
      )}

      {view === 'create' && (
        <QuestionnaireBuilder
          onCancel={() => {
            setActionError(null);
            setView('list');
          }}
          onSave={handleCreate}
          requestState={builderRequestState}
        />
      )}

      {view === 'edit' && editingQuestionnaire && (
        <QuestionnaireBuilder
          key={revision}
          initialQuestionnaire={editingQuestionnaire.draft}
          onCancel={() => {
            setActionError(null);
            setEditingQuestionnaire(null);
            setView('list');
          }}
          onSave={handleUpdate}
          requestState={builderRequestState}
        />
      )}

      {deleteTarget && (
        <DeleteQuestionnaireModal
          onClose={() => {
            setDeleteTargetId(null);
          }}
          onDelete={handleDelete}
          questionnaireTitle={deleteTarget.title}
          requestState={deleteRequestState}
        />
      )}

      {previewTarget && (
        <QuestionnairePreviewModal
          description={previewTarget.description}
          onClose={() => setPreviewTargetId(null)}
          questions={previewTarget.questions}
          title={previewTarget.title}
        />
      )}
    </div>
  );
}
