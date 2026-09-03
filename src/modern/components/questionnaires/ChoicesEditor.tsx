import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { type DragEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslator } from '@/i18n';

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
  const dragIndexRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
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

  const handleChoiceChange = (index: number, value: string) => {
    const updated = [...items];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, value };
    }
    emitChange(updated);
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (event: DragEvent, index: number) => {
    event.preventDefault();
    const dragIndex = dragIndexRef.current;
    if (dragIndex === null || dragIndex === index) return;

    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const currentDragIndex = dragIndexRef.current;
      if (currentDragIndex === null || currentDragIndex === index) return;

      const updated = [...items];
      const moved = updated.splice(currentDragIndex, 1)[0];
      if (moved === undefined) return;
      updated.splice(index, 0, moved);
      emitChange(updated);
      dragIndexRef.current = index;
    });
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddChoice();
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
          <Input
            className="flex-1 bg-background"
            onChange={(event) => handleChoiceChange(index, event.currentTarget.value)}
            value={choice.value}
          />
          <Button
            aria-label={t('questionnaire_builder.remove_choice')}
            onClick={() => handleRemoveChoice(index)}
            size="icon"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Input
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
