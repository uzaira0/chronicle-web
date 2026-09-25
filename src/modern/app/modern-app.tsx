import { lazy, Suspense } from 'react';

import { LanguageProvider } from '@/i18n';

// Each surface is its own chunk: the participant-facing /enroll page never downloads the
// researcher dashboard (store, RTK Query, router), and dashboard visits never download the
// public enrollment pages.
const PublicEnrollmentPage = lazy(() =>
  import('@/routes/public-enrollment-page').then((m) => ({ default: m.PublicEnrollmentPage })),
);
const ReviewerEnrollmentPage = lazy(() =>
  import('@/routes/reviewer-enrollment-page').then((m) => ({ default: m.ReviewerEnrollmentPage })),
);
const DashboardApp = lazy(() =>
  Promise.all([import('@/app/providers'), import('@/app/router')]).then(([{ AppProviders }, { ModernRouter }]) => ({
    default: () => (
      <AppProviders>
        <ModernRouter />
      </AppProviders>
    ),
  })),
);

function selectApp(path: string) {
  if (path === '/enroll') return <PublicEnrollmentPage />;
  if (path === '/reviewer') return <ReviewerEnrollmentPage />;
  return <DashboardApp />;
}

export function ModernApp() {
  const path = window.location.pathname.replace(/^\/chronicle(?=\/|$)/, '') || '/';
  // Every surface — the standalone public pages included — renders inside the language provider.
  return (
    <LanguageProvider>
      <Suspense fallback={null}>{selectApp(path)}</Suspense>
    </LanguageProvider>
  );
}
