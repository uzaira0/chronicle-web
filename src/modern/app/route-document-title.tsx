import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useTranslator } from '@/i18n';
import { PARTICIPANT_ROUTE_PATHS } from '@/lib/route-links';
import { allStudyTabs } from '@/lib/study-tabs';

const PARTICIPANT_TITLE_KEYS: Record<keyof typeof PARTICIPANT_ROUTE_PATHS, string> = {
  APP_USAGE: 'app_usage_survey.title',
  PORTAL: 'participant_dashboard.title',
  QUESTIONNAIRE: 'questionnaire.title',
  TIME_USE_DIARY: 'tud_route.title',
};

function routeDocumentTitleKey(pathname: string): string {
  const [first, second, third] = pathname.split('/').filter(Boolean);

  if (!first || first === 'dashboard') return 'overview.title';
  if (first === 'studies') {
    if (!second) return 'studies.title';
    const tabPath = third ?? '';
    return allStudyTabs.find((tab) => tab.to === tabPath)?.labelKey ?? 'not_found.title';
  }

  if (first === 'login') return 'login.title';
  const form = (Object.keys(PARTICIPANT_ROUTE_PATHS) as (keyof typeof PARTICIPANT_ROUTE_PATHS)[]).find(
    (kind) => PARTICIPANT_ROUTE_PATHS[kind] === first,
  );
  return form ? PARTICIPANT_TITLE_KEYS[form] : 'not_found.title';
}

export function RouteDocumentTitle() {
  const { pathname } = useLocation();
  const { t } = useTranslator();
  const title = t(routeDocumentTitleKey(pathname));

  useEffect(() => {
    document.title = `${title} | Chronicle`;
  }, [title]);

  return null;
}
