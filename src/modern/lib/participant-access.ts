import { PARTICIPANT_FORM_KINDS, type ParticipantFormKind } from '@/generated/chronicle-contracts';
import { createTranslator, getCurrentLanguage } from '@/i18n';
import { isParticipantProcessingBlocked } from '@/lib/errors';
import { timeoutSignal } from '@/lib/request-timeout';
import type { components } from '@/types/chronicle-api.generated';

export const PARTICIPANT_CSRF_STORAGE_KEY = 'chronicle.participant.csrf';
export { PARTICIPANT_FORM_CSRF_HEADER as PARTICIPANT_CSRF_HEADER } from '@/generated/chronicle-contracts';
export const PARTICIPANT_CONTEXT_STORAGE_KEY = 'chronicle.participant.context';
/** Public participant-form API. Self-host serves only this prefix on the participant listener. */
export const PARTICIPANT_PUBLIC_API_BASE = '/chronicle/v3';
const RESEARCHER_WEB_API_BASE = '/chronicle/api/web';

export type { ParticipantFormKind };

/** A participant-access failure; `messageKey` names its translated explanation, rendered in the language on screen. */
export class ParticipantAccessError extends Error {
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly newLinkRequired: boolean;
  constructor(messageKey: string, retryable = false, newLinkRequired = false) {
    super(messageKey);
    this.messageKey = messageKey;
    this.retryable = retryable;
    this.newLinkRequired = newLinkRequired;
  }
}

export async function requireParticipantProcessingAvailable(response: Response): Promise<void> {
  if (
    response.status === 403 &&
    isParticipantProcessingBlocked(
      await response
        .clone()
        .json()
        .catch(() => null),
    )
  )
    throw new ParticipantAccessError('participant_access.processing_blocked', true);
}

export type ParticipantSessionContext = components['schemas']['ParticipantFormSessionResponse'];

/** Returns the URL only when it is https, so a stored link can never become a script URL. */
export function httpsLinkOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

export function participantAccessCodeIssueUrl(studyId: string, participantId: string): string {
  return `${RESEARCHER_WEB_API_BASE}/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/form-access-codes`;
}

/** The participant's live enrollment link already sent; the server answers 404 when there is none. */
export function participantLiveEnrollmentCodeUrl(studyId: string, participantId: string): string {
  return `${RESEARCHER_WEB_API_BASE}/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/enrollment-code`;
}

export function participantAccessCodeFromFragment(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  return new URLSearchParams(hash.slice(1)).get('accessCode');
}

export function participantAccessExchangeUrl(): string {
  return `${PARTICIPANT_PUBLIC_API_BASE}/participant-access/exchange`;
}

export function participantAccessSessionUrl(): string {
  return `${PARTICIPANT_PUBLIC_API_BASE}/participant-access/session`;
}

export function getParticipantCsrfToken(): string | null {
  try {
    return window.sessionStorage.getItem(PARTICIPANT_CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseParticipantSessionContext(parsed: unknown): ParticipantSessionContext | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const context = parsed as Partial<ParticipantSessionContext>;
  if (
    typeof context.csrfToken !== 'string' ||
    typeof context.expiresAt !== 'string' ||
    !PARTICIPANT_FORM_KINDS.some((kind) => kind === context.formKind) ||
    typeof context.participantId !== 'string' ||
    typeof context.studyId !== 'string'
  ) {
    return null;
  }
  // The server decides whether its session is still valid; the browser clock is not compared with it.
  if (!Number.isFinite(Date.parse(context.expiresAt))) return null;
  return context as ParticipantSessionContext;
}

export function readParticipantSessionContext(): ParticipantSessionContext | null {
  try {
    const raw = window.sessionStorage.getItem(PARTICIPANT_CONTEXT_STORAGE_KEY);
    return raw ? parseParticipantSessionContext(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function recoverParticipantSessionContext(): Promise<ParticipantSessionContext | null> {
  const response = await fetch(participantAccessSessionUrl(), {
    credentials: 'include',
    signal: timeoutSignal(),
  });
  await requireParticipantProcessingAvailable(response);
  if (response.status === 401 || response.status === 403) return null;
  const context = response.ok ? parseParticipantSessionContext(await response.json()) : null;
  if (!context) throw new Error(createTranslator(getCurrentLanguage()).t('participant_access.recovery_failed'));
  return context;
}

export function storeParticipantSessionContext(context: ParticipantSessionContext): void {
  const stored = JSON.stringify(context);
  const changed = window.sessionStorage.getItem(PARTICIPANT_CONTEXT_STORAGE_KEY) !== stored;
  window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, context.csrfToken);
  window.sessionStorage.setItem(PARTICIPANT_CONTEXT_STORAGE_KEY, stored);
  if (changed) window.dispatchEvent(new Event(PARTICIPANT_CONTEXT_STORAGE_KEY));
}
