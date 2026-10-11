import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslator } from '@/i18n';
import { moveItem, useDragReorder } from '@/lib/use-drag-reorder';
import { cn } from '@/lib/utils';

type IdentifiedChoice = { id: number; value: string };

type ChoicesEditorProps = {
  choices: string[];
  onChange: (nextChoices: string[]) => void;
};

export function ChoicesEditor({ choices, onChange }: ChoicesEditorProps) {
  const { t } = useTranslator();
  const nextIdRef = useRef(0);
  const nextId = () => nextIdRef.current++;
  const toIdentified = (values: string[]): IdentifiedChoice[] => values.map((value) => ({ id: nextId(), value }));

  const [newChoice, setNewChoice] = useState('');
  const lastExternalRef = useRef(choices);

  const [items, setItems] = useState<IdentifiedChoice[]>(() => toIdentified(choices));

  // Sync when parent provides a new choices array (e.g., initial seed on mount/edit switch)
  // biome-ignore lint/correctness/useExhaustiveDependencies: toIdentified depends only on a stable ref
  useEffect(() => {
    if (lastExternalRef.current !== choices) {
      lastExternalRef.current = choices;
      setItems(toIdentified(choices));
    }
  }, [choices]);

  const emitChange = useCallback(
    (next: IdentifiedChoice[]) => {
      const values = next.map((c) => c.value);
      lastExternalRef.current = values;
      setItems(next);
      onChange(values);
    },
    [onChange],
  );

  const handleAddChoice = () => {
    const trimmed = newChoice.trim();
    if (trimmed) {
      emitChange([...items, { id: nextId(), value: trimmed }]);
      setNewChoice('');
    }
  };

  const handleRemoveChoice = (index: number) => {
    emitChange(items.filter((_, i) => i !== index));
  };

  const moveChoiceTo = (source: number, target: number) => {
    const updated = moveItem(items, source, target);
    if (updated !== items) emitChange(updated);
  };
  const { handleDragStart, handleDragOver, handleDragEnd, isDragging } = useDragReorder(moveChoiceTo);

  const handleChoiceChange = (index: number, value: string) => {
    const updated = [...items];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, value };
    }
    emitChange(updated);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddChoice();
    }
  };

  return (
    <div className={cn('space-y-3', isDragging && 'select-none')}>
      <p className="text-sm font-semibold uppercase tracking-eyebrow text-muted-foreground">
        {t('questionnaire_builder.choices')}
      </p>
      {items.map((choice, index) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: draggable reorder handle
        <div
          key={choice.id}
          className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3"
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(event) => handleDragOver(event, index)}
          onDragEnd={handleDragEnd}
        >
          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
          <Label className="shrink-0 text-xs" htmlFor={`questionnaire-choice-${choice.id}`}>
            {t('questionnaire_builder.choice_n', { number: String(index + 1) })}
          </Label>
          <Input
            className="flex-1 bg-background"
            id={`questionnaire-choice-${choice.id}`}
            onChange={(event) => handleChoiceChange(index, event.currentTarget.value)}
            value={choice.value}
          />
          <Button
            aria-label={t('questionnaire_builder.move_up', { number: String(index + 1) })}
            disabled={index === 0}
            onClick={() => moveChoiceTo(index, index - 1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t('questionnaire_builder.move_down', { number: String(index + 1) })}
            disabled={index === items.length - 1}
            onClick={() => moveChoiceTo(index, index + 1)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t('questionnaire_builder.remove_choice')}
            onClick={() => handleRemoveChoice(index)}
            size="icon"
            type="button"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Input
          aria-label={t('questionnaire_builder.choice_placeholder')}
          className="flex-1"
          onChange={(event) => setNewChoice(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('questionnaire_builder.choice_placeholder')}
          value={newChoice}
        />
        <Button onClick={handleAddChoice} variant="outline">
          <Plus className="h-4 w-4" />
          {t('common.add')}
        </Button>
      </div>
    </div>
  );
}
