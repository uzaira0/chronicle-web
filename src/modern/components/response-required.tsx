import { useTranslator } from '@/i18n';

/** Focuses the answer control with this id, or the first input of a radio or checkbox group. */
export function focusAnswer(id: string) {
  const element = document.getElementById(id);
  (element instanceof HTMLFieldSetElement ? element.querySelector('input') : element)?.focus();
}

/** The inline missing-answer message; the answer control points aria-describedby at its id. */
export function ResponseRequired({ id }: { id: string }) {
  const { t } = useTranslator();
  return (
    <p className="text-xs text-destructive" id={id}>
      {t('common.response_required')}
    </p>
  );
}
