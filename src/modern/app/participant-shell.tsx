import { Outlet } from 'react-router';

import { isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';

export function ParticipantShell() {
  const { effectiveCode, t } = useTranslator();
  return (
    <div
      className="eq-root min-h-screen bg-background text-foreground"
      dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}
    >
      <a className="eq-skip-link" href="#participant-content">
        {t('participant_shell.skip_to_form')}
      </a>
      <header className="border-b border-border bg-background px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Chronicle</p>
            <p className="text-sm text-muted-foreground">{t('participant_shell.subtitle')}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6" id="participant-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
