import { LoaderCircle, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { type Participant, useUpdateParticipantAnnotationsMutation } from '@/state/study-operations-api';

type ParticipantNotesEditorProps = {
  onClose: () => void;
  participant: Participant;
  studyId: string;
};

export function ParticipantNotesEditor({ onClose, participant, studyId }: ParticipantNotesEditorProps) {
  const [updateAnnotations, { isLoading }] = useUpdateParticipantAnnotationsMutation();
  const [notes, setNotes] = useState(participant.participantNotes ?? '');
  const [tags, setTags] = useState<string[]>([...participant.participantTags]);
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslator();

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
    }
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setError(null);
    try {
      await updateAnnotations({
        annotations: { participantNotes: notes, participantTags: tags },
        participantId: participant.participantId,
        studyId,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, t('notes_editor.save_failed')));
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open
    >
      <DialogContent className="w-[min(92vw,32rem)]">
        <DialogTitle>{t('notes_editor.title')}</DialogTitle>
        <DialogDescription>{t('notes_editor.description', { id: participant.participantId })}</DialogDescription>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="participant-notes">{t('notes_editor.notes')}</Label>
            <Textarea
              id="participant-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notes_editor.notes_placeholder')}
              value={notes}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('notes_editor.tags')}</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="muted">
                    {tag}
                    <button
                      aria-label={t('notes_editor.remove_tag', { tag })}
                      className="ml-1.5 rounded-full hover:text-foreground"
                      onClick={() => removeTag(tag)}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={t('notes_editor.tag_placeholder')}
                value={newTag}
              />
              <Button
                aria-label={t('notes_editor.add_tag')}
                disabled={!newTag.trim()}
                onClick={addTag}
                size="icon"
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button onClick={onClose} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={isLoading}
              onClick={() => {
                handleSave().catch((err) => {
                  setError(getErrorMessage(err, t('notes_editor.save_failed')));
                });
              }}
            >
              {isLoading && <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
