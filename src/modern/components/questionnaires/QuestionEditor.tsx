import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { type ChangeEvent, type DragEvent, useId } from 'react';
import { ChoicesEditor } from '@/components/questionnaires/ChoicesEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTranslator } from '@/i18n';
import type { QuestionnaireQuestion } from '@/state/study-operations-api';

type QuestionEditorProps = {
  index: number;
  question: QuestionnaireQuestion;
  onChange: (index: number, question: QuestionnaireQuestion) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent, index: number) => void;
  onDragStart: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (source: number, target: number) => void;
  questionCount: number;
};

function QuestionHeader({
  index,
  onRemove,
  onMove,
  questionCount,
}: Pick<QuestionEditorProps, 'index' | 'onRemove' | 'onMove' | 'questionCount'>) {
  const { t } = useTranslator();
  const number = String(index + 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />
        <p className="text-base font-semibold text-foreground">{t('questionnaire_builder.question_n', { number })}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label={t('questionnaire_builder.move_question_up', { number })}
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
          size="icon"
          variant="outline"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t('questionnaire_builder.move_question_down', { number })}
          disabled={index === questionCount - 1}
          onClick={() => onMove(index, index + 1)}
          size="icon"
          variant="outline"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t('questionnaire_builder.remove_question')}
          onClick={() => onRemove(index)}
          size="icon"
          variant="outline"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function QuestionEditor({
  index,
  question,
  onChange,
  onDragEnd,
  onDragOver,
  onDragStart,
  onRemove,
  onMove,
  questionCount,
}: QuestionEditorProps) {
  const { t } = useTranslator();
  const titleId = useId();
  const number = String(index + 1);
  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(index, {
      ...question,
      title: event.currentTarget.value,
    });
  };

  const handleChoicesChange = (choices: string[]) => {
    onChange(index, {
      ...question,
      choices,
    });
  };

  return (
    <Card
      variant="subtle"
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, index)}
      onDragStart={() => onDragStart(index)}
    >
      <CardContent spacing={5}>
        <QuestionHeader index={index} onMove={onMove} onRemove={onRemove} questionCount={questionCount} />
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-eyebrow text-muted-foreground">
            {t('questionnaire_builder.question_text')}
          </p>
          <Input
            aria-label={t('questionnaire_builder.question_text_aria', { number })}
            id={titleId}
            name={titleId}
            onChange={handleTitleChange}
            value={question.title}
          />
        </div>
        <div>
          <ChoicesEditor choices={question.choices} onChange={handleChoicesChange} />
        </div>
      </CardContent>
    </Card>
  );
}
