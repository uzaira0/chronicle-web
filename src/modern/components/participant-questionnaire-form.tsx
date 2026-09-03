import { CheckCircle2, FileQuestion } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import {
  type QuestionnaireQuestion,
  useGetParticipantQuestionnaireQuery,
  useSubmitQuestionnaireResponsesMutation,
} from '@/state/study-operations-api';

type ParticipantQuestionnaireFormProps = {
  participantId: string;
  questionnaireId: string;
  studyId: string;
};

type AnswerMap = Record<number, string[]>;

/**
 * Renders a researcher-authored questionnaire for an enrolled participant and
 * submits their answers. A question with `choices` is multiple-choice (rendered
 * as a checkbox group, faithful to the backend `value: Set<String>` and a strict
 * superset of single-select); a question with no choices is open-ended (textarea).
 * Responses are keyed by question *title* to match `QuestionnaireResponse`.
 */
export function ParticipantQuestionnaireForm({
  participantId,
  questionnaireId,
  studyId,
}: ParticipantQuestionnaireFormProps) {
  const { data: questionnaire, isLoading, isError } = useGetParticipantQuestionnaireQuery({ questionnaireId, studyId });
  const { t } = useTranslator();

  const [submit, submitResult] = useSubmitQuestionnaireResponsesMutation();
  const submitState = getMutationRequestState(submitResult);

  const [answers, setAnswers] = useState<AnswerMap>({});

  const setOpenEndedAnswer = useCallback((index: number, text: string) => {
    setAnswers((prev) => ({ ...prev, [index]: text.trim() ? [text] : [] }));
  }, []);

  const toggleChoice = useCallback((index: number, choice: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = prev[index] ?? [];
      const next = checked ? [...new Set([...current, choice])] : current.filter((value) => value !== choice);
      return { ...prev, [index]: next };
    });
  }, []);

  const questions = questionnaire?.questions ?? [];

  const allAnswered = useMemo(
    () => questions.length > 0 && questions.every((_question, index) => (answers[index]?.length ?? 0) > 0),
    [questions, answers],
  );

  const handleSubmit = useCallback(() => {
    if (!allAnswered) return;
    submit({
      participantId,
      questionnaireId,
      responses: questions.map((question, index) => ({
        questionTitle: question.title,
        value: answers[index] ?? [],
      })),
      studyId,
    })
      .unwrap()
      .catch(() => {
        // RTK Query owns the failure state rendered by this form.
      });
  }, [allAnswered, answers, participantId, questionnaireId, questions, studyId, submit]);

  if (isLoading) {
    return <StatusCard title={t('questionnaire.loading_title')} description={t('questionnaire.loading_description')} />;
  }

  if (isError || !questionnaire) {
    return (
      <StatusCard
        title={t('questionnaire.unavailable_title')}
        description={t('questionnaire.unavailable_description')}
      />
    );
  }

  if (submitState === REQUEST_STATES.SUCCESS) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {t('common.thank_you')}
          </CardTitle>
          <CardDescription>{t('questionnaire.submitted', { title: questionnaire.title })}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-primary" />
          {questionnaire.title || t('questionnaire.title')}
        </CardTitle>
        {questionnaire.description && <CardDescription>{questionnaire.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {questions.map((question, index) => (
          <QuestionField
            answer={answers[index] ?? []}
            index={index}
            key={question.title}
            onOpenEndedChange={setOpenEndedAnswer}
            onToggleChoice={toggleChoice}
            question={question}
          />
        ))}

        {submitState === REQUEST_STATES.FAILURE && (
          <p className="text-sm text-destructive">{t('common.submission_failed')}</p>
        )}

        <div className="flex justify-end">
          <Button
            disabled={!allAnswered || submitState === REQUEST_STATES.PENDING}
            onClick={handleSubmit}
            type="button"
          >
            {submitState === REQUEST_STATES.PENDING ? t('common.submitting') : t('questionnaire.submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type QuestionFieldProps = {
  answer: string[];
  index: number;
  onOpenEndedChange: (index: number, text: string) => void;
  onToggleChoice: (index: number, choice: string, checked: boolean) => void;
  question: QuestionnaireQuestion;
};

export function QuestionField({ answer, index, onOpenEndedChange, onToggleChoice, question }: QuestionFieldProps) {
  const isMultipleChoice = question.choices.length > 0;
  const { t } = useTranslator();
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <Badge variant="outline">{index + 1}</Badge>
        <p className="text-base font-semibold text-foreground">{question.title}</p>
      </div>
      {isMultipleChoice ? (
        <fieldset className="space-y-2">
          <legend className="sr-only">{question.title}</legend>
          {question.choices.map((choice) => (
            <label
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
              key={choice}
            >
              <input
                checked={answer.includes(choice)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                onChange={(event) => onToggleChoice(index, choice, event.currentTarget.checked)}
                type="checkbox"
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <Textarea
          aria-label={t('questionnaire.answer_aria', { number: String(index + 1) })}
          onChange={(event) => onOpenEndedChange(index, event.currentTarget.value)}
          value={answer[0] ?? ''}
        />
      )}
    </div>
  );
}

function StatusCard({ description, title }: { description: string; title: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
