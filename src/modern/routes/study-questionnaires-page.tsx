import { CircleAlert, LoaderCircle, ScrollText } from 'lucide-react';
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
import { StatePanel } from '@/components/state-panel';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { getMutationRequestState } from '@/lib/request-state';
import {
  type QuestionnaireDraft,
  type QuestionnaireRecord,
  useCreateQuestionnaireMutation,
  useDeleteQuestionnaireMutation,
  useDownloadQuestionnaireResponsesMutation,
  useGetStudyQuestionnairesQuery,
  useGetStudySummaryQuery,
  useUpdateQuestionnaireMutation,
} from '@/state/study-operations-api';

type ViewMode = 'create' | 'edit' | 'list';

export function StudyQuestionnairesPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const {
    data: questionnaires = [],
    error: questionnairesError,
    isError,
    isLoading,
  } = useGetStudyQuestionnairesQuery(studyId, {
    skip: !studyId,
  });
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });

  const [view, setView] = useState<ViewMode>('list');
  const [editingQuestionnaire, setEditingQuestionnaire] = useState<QuestionnaireRecord | null>(null);
  const [previewTarget, setPreviewTarget] = useState<QuestionnaireRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      await createQuestionnaire({ questionnaire, studyId }).unwrap();
      setView('list');
    } catch (error) {
      setActionError(getErrorMessage(error, t('questionnaires.create_failed')));
    }
  };

  const handleUpdate = async (questionnaire: QuestionnaireDraft) => {
    if (!editingQuestionnaire) {
      return;
    }

    setActionError(null);
    try {
      await updateQuestionnaire({
        questionnaire,
        questionnaireId: editingQuestionnaire.id,
        studyId,
      }).unwrap();
      setEditingQuestionnaire(null);
      setView('list');
    } catch (error) {
      setActionError(getErrorMessage(error, t('questionnaires.update_failed')));
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
        setDeleteTarget(null);
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

      {isLoading && (
        <StatePanel
          className="max-w-none"
          description={t('questionnaires.loading_description')}
          eyebrow={t('common.loading')}
          icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
          title={t('questionnaires.loading_title')}
        />
      )}

      {!isLoading && isError && (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(questionnairesError, t('questionnaires.load_error_fallback'))}
          eyebrow={t('common.request_failed')}
          icon={<CircleAlert className="h-5 w-5" />}
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
                setDeleteTarget(questionnaire);
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
                setActionError(null);
                setEditingQuestionnaire(questionnaire);
                setView('edit');
              }}
              onPreview={() => setPreviewTarget(questionnaire)}
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
          initialQuestionnaire={{
            active: editingQuestionnaire.active,
            description: editingQuestionnaire.description,
            questions: editingQuestionnaire.questions,
            title: editingQuestionnaire.title,
          }}
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
            setDeleteTarget(null);
          }}
          onDelete={handleDelete}
          questionnaireTitle={deleteTarget.title}
          requestState={deleteRequestState}
        />
      )}

      {previewTarget && (
        <QuestionnairePreviewModal
          description={previewTarget.description}
          onClose={() => setPreviewTarget(null)}
          questions={previewTarget.questions}
          title={previewTarget.title}
        />
      )}
    </div>
  );
}
