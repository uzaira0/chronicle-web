import { Database, ExternalLink, ShieldCheck } from 'lucide-react';

import { isRtlLanguage, LanguageSwitcher, useTranslator } from '@/i18n';

type PolicySection = 'privacy' | 'withdrawal';

interface PublicResearchPolicyPageProps {
  initialSection: PolicySection;
}

const PUBLISHER_NAME = 'Baylor College of Medicine';
const PRIVACY_EMAIL = 'uzairalam998@gmail.com';
const PUBLISHER_ADDRESS = 'One Baylor Plaza, Houston, Texas 77030, United States';
const EFFECTIVE_DATE = '2026-08-26';
const PACKAGE_NAME = 'com.bcm.chronicle';

type SectionSpec = { id: string; keys: readonly string[]; title: string };

const SECTIONS: readonly SectionSpec[] = [
  { id: 'use-and-sharing', keys: ['use_p1', 'use_p2'], title: 'use_title' },
  { id: 'research-consent', keys: ['consent_p1', 'consent_p2'], title: 'consent_title' },
  { id: 'background-access', keys: ['background_p1'], title: 'background_title' },
  { id: 'storage-security-retention', keys: ['storage_p1', 'storage_p2'], title: 'storage_title' },
];

function formatEffectiveDate(isoDate: string, languageCode: string): string {
  const locale = languageCode.split('-')[0];
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: 'long', timeZone: 'UTC' });
}

export function PublicResearchPolicyPage({ initialSection }: PublicResearchPolicyPageProps) {
  const { effectiveCode, t } = useTranslator();
  const p = (key: string, options?: Record<string, string>) => t(`research_policy.${key}`, options);
  const publisher = { publisher: PUBLISHER_NAME };

  return (
    <main
      className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8"
      dir={isRtlLanguage(effectiveCode) ? 'rtl' : 'ltr'}
    >
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="border-b border-border pb-8">
          <div className="mb-4 flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
            <span className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {p('eyebrow')}
            </span>
            <LanguageSwitcher />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">
            {p(initialSection === 'withdrawal' ? 'title_withdrawal' : 'title_privacy')}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {p('intro_p1', { ...publisher, package: PACKAGE_NAME })}
          </p>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{p('intro_p2', publisher)}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            {p('effective', { date: formatEffectiveDate(EFFECTIVE_DATE, effectiveCode) })}
          </p>
        </header>

        <section className="space-y-4" id="privacy">
          <h2 className="flex items-center gap-3 text-xl font-semibold">
            <Database className="h-5 w-5 text-primary" />
            {p('data_handling_title')}
          </h2>
          {['data_handling_p1', 'data_handling_p2', 'data_handling_p3', 'data_handling_p4'].map((key) => (
            <p className="leading-7 text-muted-foreground" key={key}>
              {p(key)}
            </p>
          ))}
        </section>

        {SECTIONS.map((section) => (
          <section className="space-y-4" id={section.id} key={section.id}>
            <h2 className="text-xl font-semibold">{p(section.title)}</h2>
            {section.keys.map((key) => (
              <p className="leading-7 text-muted-foreground" key={key}>
                {p(key, publisher)}
              </p>
            ))}
          </section>
        ))}

        <section className="space-y-4" id="withdrawal">
          <h2 className="text-xl font-semibold">{p('withdrawal_title')}</h2>
          <p className="leading-7 text-muted-foreground">{p('withdrawal_p1')}</p>
          <p className="leading-7 text-muted-foreground">{p('withdrawal_p2')}</p>
          <p className="leading-7 text-muted-foreground">
            {p('withdrawal_p3_before_link')}{' '}
            <a className="text-primary underline" href="/withdrawal">
              /withdrawal
            </a>
            {p('withdrawal_p3_after_link')}
          </p>
        </section>

        <section className="space-y-4" id="children-and-changes">
          <h2 className="text-xl font-semibold">{p('children_title')}</h2>
          <p className="leading-7 text-muted-foreground">{p('children_p1')}</p>
          <p className="leading-7 text-muted-foreground">{p('children_p2')}</p>
        </section>

        <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
          <p>{p('footer_contact')}</p>
          <a className="mt-3 inline-flex items-center gap-2 text-primary underline" href={`mailto:${PRIVACY_EMAIL}`}>
            {PRIVACY_EMAIL}
            <ExternalLink className="h-4 w-4" />
          </a>
          <p className="mt-3">
            {PUBLISHER_NAME}, {PUBLISHER_ADDRESS}
          </p>
          <p className="mt-3">
            {p('footer_institutional_before_link')}{' '}
            <a className="text-primary underline" href="https://www.bcm.edu/privacy">
              bcm.edu/privacy
            </a>
            {p('footer_institutional_after_link')}
          </p>
        </footer>
      </div>
    </main>
  );
}
