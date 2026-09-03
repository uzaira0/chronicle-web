import { GripVertical, Trash2 } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';
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
};

export function QuestionEditor({
  index,
  question,
  onChange,
  onDragEnd,
  onDragOver,
  onDragStart,
  onRemove,
}: QuestionEditorProps) {
  const { t } = useTranslator();
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
      className="border-border/80"
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event, index)}
      onDragStart={() => onDragStart(index)}
    >
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground active:cursor-grabbing" />
            <p className="text-base font-semibold text-foreground">
              {t('questionnaire_builder.question_n', { number })}
            </p>
          </div>
          <Button
            aria-label={t('questionnaire_builder.remove_question')}
            onClick={() => onRemove(index)}
            size="icon"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('questionnaire_builder.question_text')}
          </p>
          <Input
            aria-label={t('questionnaire_builder.question_text_aria', { number })}
            id={`question-title-${index}`}
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
