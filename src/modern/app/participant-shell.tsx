import { ExternalLink } from 'lucide-react';

import { RouteOutlet } from '@/components/error-boundary';
import { isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';
import { httpsLinkOrNull, readParticipantSessionContext } from '@/lib/participant-access';

export function ParticipantShell() {
  const { effectiveCode, t } = useTranslator();
  // ParticipantAccessBootstrap stores the session context before rendering this shell.
  const context = readParticipantSessionContext();
  const policyLinks = [
    { href: httpsLinkOrNull(context?.privacyPolicyUrl), label: t('enrollment.privacy_policy_link') },
    { href: httpsLinkOrNull(context?.withdrawalUrl), label: t('enrollment.withdrawal_link') },
  ].filter((link): link is { href: string; label: string } => link.href !== null);
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
            <p className="text-xs font-bold uppercase tracking-eyebrow text-primary">Chronicle</p>
            <p className="text-sm text-muted-foreground">{t('participant_shell.subtitle')}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6" id="participant-content" tabIndex={-1}>
        <RouteOutlet />
      </main>
      {policyLinks.length > 0 && (
        <footer className="border-t border-border px-4 py-4 sm:px-6">
          <nav className="mx-auto flex max-w-5xl flex-wrap gap-4 text-sm">
            {policyLinks.map((link) => (
              <a
                className="inline-flex items-center gap-1 text-primary underline"
                href={link.href}
                key={link.href}
                rel="noreferrer"
                target="_blank"
              >
                {link.label} <ExternalLink className="h-4 w-4" />
              </a>
            ))}
          </nav>
        </footer>
      )}
    </div>
  );
}
