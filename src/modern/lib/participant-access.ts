export const PARTICIPANT_CSRF_STORAGE_KEY = 'chronicle.participant.csrf';
export const PARTICIPANT_CONTEXT_STORAGE_KEY = 'chronicle.participant.context';
const PARTICIPANT_PUBLIC_API_BASE = '/chronicle/v3';
const RESEARCHER_WEB_API_BASE = '/chronicle/api/web';

export type ParticipantFormKind = 'ENROLLMENT' | 'APP_USAGE' | 'QUESTIONNAIRE' | 'TIME_USE_DIARY' | 'PORTAL';

export type ParticipantSessionContext = {
  csrfToken: string;
  expiresAt: string;
  formKind: ParticipantFormKind;
  logicalDate?: string | null;
  participantId: string;
  resourceId?: string | null;
  studyId: string;
};

export function participantAccessCodeIssueUrl(studyId: string, participantId: string): string {
  return `${RESEARCHER_WEB_API_BASE}/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/form-access-codes`;
}

export function participantAccessCodeFromFragment(hash: string): string | null {
  if (!hash.startsWith('#')) return null;
  return new URLSearchParams(hash.slice(1)).get('accessCode');
}

export function participantAccessExchangeUrl(): string {
  return `${PARTICIPANT_PUBLIC_API_BASE}/participant-access/exchange`;
}

export function getParticipantCsrfToken(): string | null {
  try {
    return window.sessionStorage.getItem(PARTICIPANT_CSRF_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readParticipantSessionContext(): ParticipantSessionContext | null {
  try {
    const raw = window.sessionStorage.getItem(PARTICIPANT_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const context = parsed as Partial<ParticipantSessionContext>;
    if (
      typeof context.csrfToken !== 'string' ||
      typeof context.expiresAt !== 'string' ||
      typeof context.formKind !== 'string' ||
      typeof context.participantId !== 'string' ||
      typeof context.studyId !== 'string'
    ) {
      return null;
    }
    if (Date.parse(context.expiresAt) <= Date.now()) return null;
    return context as ParticipantSessionContext;
  } catch {
    return null;
  }
}

export function storeParticipantSessionContext(context: ParticipantSessionContext): void {
  window.sessionStorage.setItem(PARTICIPANT_CSRF_STORAGE_KEY, context.csrfToken);
  window.sessionStorage.setItem(PARTICIPANT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
}
