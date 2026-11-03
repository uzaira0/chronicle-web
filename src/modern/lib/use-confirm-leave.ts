import { useEffect } from 'react';
import { NavigationType, useBlocker } from 'react-router';
import { type Translator, useTranslator } from '@/i18n';

const unsavedEditors = new Set<symbol>();
const retainedEditors = new Set<symbol>();

function hasUnsavedEdits() {
  return unsavedEditors.size > 0 || retainedEditors.size > 0;
}

function protectUnload() {
  const confirmLeave = (event: BeforeUnloadEvent) => {
    if (hasUnsavedEdits()) event.preventDefault();
  };
  window.addEventListener('beforeunload', confirmLeave);
  return () => window.removeEventListener('beforeunload', confirmLeave);
}

/** The session boundary holds protection while Activity disconnects editor effects. */
export function retainUnsavedEdits() {
  const editors = [...unsavedEditors];
  for (const editor of editors) retainedEditors.add(editor);
  const releaseUnload = protectUnload();
  return () => {
    for (const editor of editors) retainedEditors.delete(editor);
    releaseUnload();
  };
}

/** Navigation state for the move a save makes to what it saved; that move does not ask about the saved edits. */
export const SAVED_EDITS_NAVIGATION = { savedEdits: true } as const;

/** While edits exist only in memory, ask before a reload, a tab close, leaving the app or another page. */
export function useConfirmLeave(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const editor = Symbol('unsaved-editor');
    unsavedEditors.add(editor);
    const releaseUnload = protectUnload();
    return () => {
      unsavedEditors.delete(editor);
      releaseUnload();
    };
  }, [unsaved]);
}

/** Before an in-page move that drops unsaved edits: ask once, and say whether to proceed. */
export function confirmDiscardUnsavedEdits(t: Translator['t']) {
  if (!hasUnsavedEdits()) return true;
  if (!window.confirm(t('common.leave_unsaved'))) return false;
  retainedEditors.clear();
  return true;
}

/**
 * Dismissing an editor dialog (its close button, Escape, an outside click, Cancel): refused while its write is in
 * flight, whose outcome only the open editor can show, and asked first while it holds unsaved edits.
 */
export function useEditorDismissal(saving: boolean, close: () => void) {
  const { t } = useTranslator();
  return () => {
    if (!saving && confirmDiscardUnsavedEdits(t)) close();
  };
}

/** Mounted once at the router root: an in-app move to another page asks first while edits are unsaved. */
export function UnsavedEditsGuard() {
  const { t } = useTranslator();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation, historyAction }) =>
      hasUnsavedEdits() &&
      currentLocation.pathname !== nextLocation.pathname &&
      (historyAction === NavigationType.Pop ||
        (nextLocation.state as Partial<typeof SAVED_EDITS_NAVIGATION> | null)?.savedEdits !== true),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirmDiscardUnsavedEdits(t)) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);
  return null;
}
