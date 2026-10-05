import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { useTranslator } from '@/i18n';

const studyTabTitleKeys: Record<string, string> = {
  compliance: 'study_layout.tab_compliance',
  downloads: 'study_layout.tab_downloads',
  participants: 'study_layout.tab_participants',
  preprocessing: 'study_layout.tab_preprocessing',
  questionnaires: 'study_layout.tab_questionnaires',
  'settings-audit': 'study_layout.tab_audit',
  audit: 'study_layout.tab_audit',
  'time-use-diary': 'study_layout.tab_tud',
};

export function routeDocumentTitleKey(pathname: string): string {
  const [first, second, third] = pathname.split('/').filter(Boolean);

  if (!first || first === 'dashboard') return 'overview.title';
  if (first === 'studies') {
    if (!second) return 'studies.title';
    if (!third) return 'study_layout.tab_overview';
    return studyTabTitleKeys[third] ?? 'not_found.title';
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
