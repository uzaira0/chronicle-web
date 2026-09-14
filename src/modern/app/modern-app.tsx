import { AppProviders } from '@/app/providers';
import { ModernRouter } from '@/app/router';
import { LanguageProvider } from '@/i18n';
import { PublicEnrollmentPage } from '@/routes/public-enrollment-page';
import { ReviewerEnrollmentPage } from '@/routes/reviewer-enrollment-page';

function selectApp(path: string) {
  if (path === '/enroll') return <PublicEnrollmentPage />;
  if (path === '/reviewer') return <ReviewerEnrollmentPage />;
  return (
    <AppProviders>
      <ModernRouter />
    </AppProviders>
  );
}

export function ModernApp() {
  const path = window.location.pathname.replace(/^\/chronicle(?=\/|$)/, '') || '/';
  // Every surface — the standalone public pages included — renders inside the language provider.
  return <LanguageProvider>{selectApp(path)}</LanguageProvider>;
}
