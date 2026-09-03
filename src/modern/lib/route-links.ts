const BASE_CHRONICLE_MODERN = /^\/chronicle\/modern(?:\/|$)/;
const BASE_MODERN = /^\/modern(?:\/|$)/;
const BASE_CHRONICLE = /^\/chronicle(?:\/|$)/;

export function pickModernBase(pathname = window.location.pathname): string {
  if (BASE_CHRONICLE_MODERN.test(pathname)) {
    return '/chronicle/modern';
  }

  if (BASE_MODERN.test(pathname)) {
    return '/modern';
  }

  if (BASE_CHRONICLE.test(pathname)) {
    return '/chronicle';
  }

  return '';
}

export function modernRoutePath(pathname: string, base = window.location.pathname): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${pickModernBase(base)}${normalizedPath}`;
}

export function modernParticipantDashboardPath(base?: string): string {
  return modernRoutePath('/participant', base);
}

export function modernStudyPath(studyId: string, base?: string): string {
  const encoded = encodeURIComponent(studyId);
  return modernRoutePath(`/studies/${encoded}`, base);
}

export type StudySection = 'audit' | 'compliance' | 'participants' | 'questionnaires' | 'time-use-diary';

export function legacyModernPath(studyId: string, section: StudySection, base?: string): string {
  const encoded = encodeURIComponent(studyId);
  return modernRoutePath(`/studies/${encoded}/${section}`, base);
}

export function modernSurveyPath(base?: string): string {
  return modernRoutePath('/survey', base);
}

export function modernTimeUseDiaryPath(base?: string): string {
  return modernRoutePath('/time-use-diary', base);
}

export function modernQuestionnairePath(base?: string): string {
  return modernRoutePath('/questionnaire', base);
}
