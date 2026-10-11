import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useTranslator } from '@/i18n';
import { allStudyTabs } from '@/lib/study-tabs';

function routeDocumentTitleKey(pathname: string): string {
  const [first, second, third] = pathname.split('/').filter(Boolean);

  if (!first || first === 'dashboard') return 'overview.title';
  if (first === 'studies') {
    if (!second) return 'studies.title';
    const tabPath = third === 'settings-audit' ? 'audit' : (third ?? '');
    return allStudyTabs.find((tab) => tab.to === tabPath)?.labelKey ?? 'not_found.title';
  }

  switch (first) {
    case 'login':
      return 'login.title';
    case 'questionnaire':
      return 'questionnaire.title';
    case 'survey':
      return 'app_usage_survey.title';
    case 'time-use-diary':
      return 'tud_route.title';
    case 'participant':
      return 'participant_dashboard.title';
    default:
      return 'not_found.title';
  }
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
