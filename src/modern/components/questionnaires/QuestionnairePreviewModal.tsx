import { CircleDot, ListChecks } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useTranslator } from '@/i18n';

type QuestionPreview = {
  choices: string[];
  title: string;
};

type QuestionnairePreviewModalProps = {
  description?: string;
  onClose: () => void;
  questions: QuestionPreview[];
  title: string;
};

function questionPreviewKey(question: QuestionPreview): string {
  return `${question.title || '(untitled)'}:${question.choices.join('|')}`;
}

export function QuestionnairePreviewModal({
  description = '',
  onClose,
  questions,
  title,
}: QuestionnairePreviewModalProps) {
  const { t } = useTranslator();
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,48rem)]">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-primary">
              <ListChecks className="h-5 w-5" />
              <Badge variant="outline">{t('questionnaire_builder.preview_badge')}</Badge>
            </div>
            <DialogTitle className="text-2xl">{title || t('questionnaire_builder.untitled')}</DialogTitle>
            <DialogDescription>{t('questionnaire_builder.preview_description')}</DialogDescription>
          </div>

          {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}

          <div className="space-y-3">
            {questions.map((question, idx) => {
              const questionKey = questionPreviewKey(question);
              return (
                <Card key={questionKey}>
                  <CardContent className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-foreground">
                        {`${idx + 1}. ${question.title || t('questionnaire_builder.no_question_text')}`}
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {t('questionnaire_builder.answer_choices', { count: String(question.choices.length || 0) })}
                      </p>
                    </div>
                    {question.choices.length > 0 && (
                      <div className="space-y-2">
                        {question.choices.map((choice) => (
                          <div
                            key={`${questionKey}:${choice}`}
                            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-3"
                          >
                            <CircleDot className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm text-foreground">{choice}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {questions.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">{t('questionnaire_builder.no_questions_yet')}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose} type="button" variant="outline">
              {t('common.close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
