import type { ParticipantFormKind } from '@/lib/participant-access';

const BASE_CHRONICLE = /^\/chronicle(?:\/|$)/;

/** The route path of each participant form; the router and the access bootstrap read it from here. */
export const PARTICIPANT_ROUTE_PATHS = {
  APP_USAGE: 'survey',
  PORTAL: 'participant',
  QUESTIONNAIRE: 'questionnaire',
  TIME_USE_DIARY: 'time-use-diary',
} as const satisfies Partial<Record<ParticipantFormKind, string>>;

export function pickModernBase(pathname = window.location.pathname): string {
  if (BASE_CHRONICLE.test(pathname)) {
    return '/chronicle';
  }

  return '';
}

export function modernRoutePath(pathname: string, base = window.location.pathname): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${pickModernBase(base)}${normalizedPath}`;
}

export function modernSurveyPath(base?: string): string {
  return modernRoutePath(PARTICIPANT_ROUTE_PATHS.APP_USAGE, base);
}

export function modernTimeUseDiaryPath(base?: string): string {
  return modernRoutePath(PARTICIPANT_ROUTE_PATHS.TIME_USE_DIARY, base);
}
