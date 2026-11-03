import { CheckCircle2, FileQuestion } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { ParticipantInstrumentState } from '@/components/participant-instrument-state';
import { ParticipantSessionBanner } from '@/components/participant-session-banner';
import { focusAnswer, ResponseRequired } from '@/components/response-required';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import { getParticipantSubmissionErrorMessage } from '@/lib/errors';
import { localDay } from '@/lib/format';
import { readParticipantSessionContext } from '@/lib/participant-access';
import { useUnsavedParticipantAnswers } from '@/lib/participant-access-guard';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import { useSubmissionKey } from '@/lib/use-submission-key';
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

/** Keyed by question title (its identity in the submitted response), so a reordered refresh keeps each answer. */
type AnswerMap = Map<string, string[]>;

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
  const {
    data: questionnaire,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetParticipantQuestionnaireQuery({ questionnaireId, studyId });
  const { t } = useTranslator();

  const [submit, submitResult] = useSubmitQuestionnaireResponsesMutation();
  const [logicalDate] = useState(() => readParticipantSessionContext()?.logicalDate ?? localDay(new Date()));
  const { currentKey, rotateKey } = useSubmissionKey([
    studyId,
    participantId,
    'QUESTIONNAIRE',
    questionnaireId,
    logicalDate,
  ]);
  const submitState = getMutationRequestState(submitResult);

  const [answers, setAnswers] = useState<AnswerMap>(() => new Map());
  const [showMissing, setShowMissing] = useState(false);
  const questionId = useId();
  const keepAlive = useUnsavedParticipantAnswers(
    submitState !== REQUEST_STATES.SUCCESS && [...answers.values()].some((answer) => answer.length > 0),
  );

  const setOpenEndedAnswer = useCallback((title: string, text: string) => {
    setAnswers((prev) => new Map(prev).set(title, text.trim() ? [text] : []));
  }, []);

  const toggleChoice = useCallback((title: string, choice: string, checked: boolean) => {
    setAnswers((prev) => {
      const current = prev.get(title) ?? [];
      const next = checked ? [...new Set([...current, choice])] : current.filter((value) => value !== choice);
      return new Map(prev).set(title, next);
    });
  }, []);

  const questions = questionnaire?.questions ?? [];

  const firstUnanswered = questions.findIndex((question) => (answers.get(question.title)?.length ?? 0) === 0);

  const handleSubmit = useCallback(() => {
    if (firstUnanswered >= 0) {
      setShowMissing(true);
      focusAnswer(`${questionId}-${firstUnanswered}`);
      return;
    }
    const responses = questions.map((question) => ({
      questionTitle: question.title,
      value: answers.get(question.title) ?? [],
    }));
    submit({ idempotencyKey: currentKey(), logicalDate, participantId, questionnaireId, responses, studyId })
      .unwrap()
      .then(rotateKey)
      .catch(() => {
        // RTK Query owns the failure state rendered by this form.
      });
  }, [
    firstUnanswered,
    questionId,
    answers,
    logicalDate,
    participantId,
    questionnaireId,
    questions,
    studyId,
    submit,
    currentKey,
    rotateKey,
  ]);

  if (isLoading || isError || !questionnaire)
    return (
      <ParticipantInstrumentState
        isError={!isLoading}
        error={error}
        loadingLabel={t('questionnaire.loading_description')}
        onRetry={refetch}
      />
    );

  if (submitState === REQUEST_STATES.SUCCESS) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle as="h2" layout="icon">
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
        <CardTitle as="h2" layout="icon">
          <FileQuestion className="h-5 w-5 text-primary" />
          {questionnaire.title || t('questionnaire.title')}
        </CardTitle>
        {questionnaire.description && <CardDescription>{questionnaire.description}</CardDescription>}
      </CardHeader>
      <CardContent spacing={6}>
        <ParticipantSessionBanner onRetry={keepAlive.retry} status={keepAlive.status} translate={t} />
        {questions.map((question, index) => (
          <QuestionField
            answer={answers.get(question.title) ?? []}
            id={`${questionId}-${index}`}
            index={index}
            invalid={showMissing && (answers.get(question.title)?.length ?? 0) === 0}
            key={question.title}
            onOpenEndedChange={setOpenEndedAnswer}
            onToggleChoice={toggleChoice}
            question={question}
          />
        ))}

        {submitState === REQUEST_STATES.FAILURE && (
          <p className="text-sm text-destructive" role="alert">
            {getParticipantSubmissionErrorMessage(submitResult.error, t)}
          </p>
        )}

        <div className="flex justify-end">
          <Button disabled={submitState === REQUEST_STATES.PENDING} onClick={handleSubmit} type="button">
            {submitState === REQUEST_STATES.PENDING ? t('common.submitting') : t('questionnaire.submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type QuestionFieldProps = {
  answer: string[];
  id?: string;
  index: number;
  invalid?: boolean;
  onOpenEndedChange: (title: string, text: string) => void;
  onToggleChoice: (title: string, choice: string, checked: boolean) => void;
  question: QuestionnaireQuestion;
};

export function QuestionField({
  answer,
  id,
  index,
  invalid,
  onOpenEndedChange,
  onToggleChoice,
  question,
}: QuestionFieldProps) {
  const isMultipleChoice = question.choices.length > 0;
  const { t } = useTranslator();
  const errorId = `${id}-error`;
  const describedBy = invalid ? errorId : undefined;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <Badge variant="outline">{index + 1}</Badge>
        <p className="text-base font-semibold text-foreground">{question.title}</p>
      </div>
      {isMultipleChoice ? (
        <fieldset aria-describedby={describedBy} aria-invalid={invalid} className="space-y-2" id={id}>
          <legend className="sr-only">{question.title}</legend>
          {question.choices.map((choice) => (
            <label
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
              key={choice}
            >
              <input
                checked={answer.includes(choice)}
                className="h-4 w-4 rounded border-border text-primary"
                onChange={(event) => onToggleChoice(question.title, choice, event.currentTarget.checked)}
                type="checkbox"
              />
              <span>{choice}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <Textarea
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-label={t('questionnaire.answer_aria', { number: String(index + 1) })}
          id={id}
          name={id}
          onChange={(event) => onOpenEndedChange(question.title, event.currentTarget.value)}
          value={answer[0] ?? ''}
        />
      )}
      {invalid && <ResponseRequired id={errorId} />}
    </div>
  );
}
