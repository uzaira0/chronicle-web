import { Eye, Plus } from 'lucide-react';
import type { DragEvent } from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { QuestionEditor } from '@/components/questionnaires/QuestionEditor';
import { QuestionnairePreviewModal } from '@/components/questionnaires/QuestionnairePreviewModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import { REQUEST_STATES, type RequestState } from '@/lib/request-state';
import type { QuestionnaireDraft, QuestionnaireQuestion } from '@/state/study-operations-api';

type IdentifiedQuestion = QuestionnaireQuestion & { _id: number };

type QuestionnaireBuilderProps = {
  initialQuestionnaire?: Partial<QuestionnaireDraft> & {
    questions?: Array<QuestionnaireQuestion>;
  };
  onCancel: () => void;
  onSave: (questionnaire: QuestionnaireDraft) => Promise<void>;
  requestState?: RequestState;
};

export function QuestionnaireBuilder({
  initialQuestionnaire,
  onCancel,
  onSave,
  requestState = REQUEST_STATES.STANDBY,
}: QuestionnaireBuilderProps) {
  const { t } = useTranslator();
  const nextIdRef = useRef(0);
  const nextId = () => nextIdRef.current++;
  const makeQuestion = (q?: QuestionnaireQuestion): IdentifiedQuestion => ({
    choices: q?.choices ?? [],
    title: q?.title ?? '',
    _id: nextId(),
  });

  const [title, setTitle] = useState(initialQuestionnaire?.title ?? '');
  const [description, setDescription] = useState(initialQuestionnaire?.description ?? '');
  const [active, setActive] = useState(initialQuestionnaire?.active ?? true);

  const seededQuestions = Array.isArray(initialQuestionnaire?.questions)
    ? initialQuestionnaire.questions.map((q) => makeQuestion(q))
    : null;

  const [questions, setQuestions] = useState<IdentifiedQuestion[]>(seededQuestions ?? [makeQuestion()]);
  const [showPreview, setShowPreview] = useState(false);
  const dragIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);

  const isPending = requestState === REQUEST_STATES.PENDING;

  const preparedQuestionnaire = useMemo(
    () =>
      questions
        .filter((q) => q.title.trim())
        .map((q) => ({
          title: q.title.trim(),
          choices: q.choices.filter((c) => c.trim()),
        })),
    [questions],
  );

  const handleQuestionChange = useCallback((index: number, question: QuestionnaireQuestion) => {
    setQuestions((prev) => {
      const updated = [...prev];
      const existing = updated[index];
      if (existing) {
        updated[index] = { ...question, _id: existing._id };
      }
      return updated;
    });
  }, []);

  const handleRemoveQuestion = useCallback((index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, makeQuestion()]);
  };

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((event: DragEvent, index: number) => {
    event.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === index) return;

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const currentDragIndex = dragIndexRef.current;
      if (currentDragIndex === null || currentDragIndex === index) return;

      setQuestions((prev) => {
        const updated = [...prev];
        const moved = updated.splice(currentDragIndex, 1)[0];
        if (moved === undefined) return prev;
        updated.splice(index, 0, moved);
        return updated;
      });
      dragIndexRef.current = index;
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const handleSave = async () => {
    if (isPending || saveInFlightRef.current || !title.trim()) return;
    saveInFlightRef.current = true;
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        active,
        questions: preparedQuestionnaire,
      });
    } finally {
      saveInFlightRef.current = false;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {initialQuestionnaire ? t('questionnaire_builder.edit_title') : t('questionnaire_builder.create_title')}
          </CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">{t('questionnaire_builder.description')}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('questionnaire_builder.title')}
            </p>
            <Input
              aria-label={t('questionnaire_builder.title_aria')}
              id="questionnaire-title"
              onChange={(event) => setTitle(event.currentTarget.value)}
              value={title}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('questionnaire_builder.description_label')}
            </p>
            <Textarea
              aria-label={t('questionnaire_builder.description_aria')}
              id="questionnaire-description"
              onChange={(event) => setDescription(event.currentTarget.value)}
              value={description}
            />
          </div>
          <div
            className={
              'flex items-center gap-3 rounded-xl border border-border/70 ' +
              'bg-muted/30 px-4 py-3 text-sm text-foreground'
            }
          >
            <input
              aria-label={t('questionnaire_builder.active_aria')}
              checked={active}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              onChange={() => setActive(!active)}
              type="checkbox"
            />
            <span>{t('questionnaire_builder.active_label')}</span>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">{t('questionnaire_builder.questions')}</h3>
          <Button onClick={handleAddQuestion} variant="outline">
            <Plus className="h-4 w-4" />
            {t('questionnaire_builder.add_question')}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {questions.map((question, index) => (
            <QuestionEditor
              key={question._id}
              index={index}
              question={question}
              onChange={handleQuestionChange}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onRemove={handleRemoveQuestion}
            />
          ))}
        </div>
        {questions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t('questionnaire_builder.no_questions')}</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button onClick={() => setShowPreview(true)} type="button">
          <Eye className="h-4 w-4" />
          {t('common.preview')}
        </Button>
        <Button onClick={onCancel} type="button" variant="outline">
          {t('common.cancel')}
        </Button>
        <Button
          disabled={isPending || !title.trim()}
          onClick={() => {
            void handleSave();
          }}
          type="button"
        >
          {initialQuestionnaire ? t('questionnaire_builder.save_changes') : t('questionnaire_builder.create_title')}
        </Button>
      </div>

      {showPreview && (
        <QuestionnairePreviewModal
          description={description}
          onClose={() => setShowPreview(false)}
          questions={preparedQuestionnaire}
          title={title}
        />
      )}
    </>
  );
}
