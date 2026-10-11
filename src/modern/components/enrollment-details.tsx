import { Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslator } from '@/i18n';
import { ANDROID_PLAY_STORE_URL, type EnrollmentPreview, formatEnrollmentExpiry } from '@/lib/enrollment-preview';

export function EnrollmentDetails({
  preview,
  contactLabel,
  contactValue,
  expiryLabel,
}: {
  preview: EnrollmentPreview;
  contactLabel: string;
  contactValue: string;
  expiryLabel: string;
}) {
  const { t } = useTranslator();
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {[
        [t('enrollment.responsible_institution'), preview.participantPolicy.responsibleInstitution],
        [t('enrollment.server_operator'), preview.participantPolicy.serverOperator],
        [contactLabel, contactValue],
      ].map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1">{value}</dd>
        </div>
      ))}
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{expiryLabel}</dt>
        <dd className="mt-1">
          <time dateTime={preview.expiresAt}>{formatEnrollmentExpiry(preview.expiresAt)}</time>
        </dd>
      </div>
    </dl>
  );
}

export function EnrollmentHandoff({
  handoffUrl,
  continueBody,
  playFallbackNote,
}: {
  handoffUrl: string;
  continueBody: string;
  playFallbackNote: string;
}) {
  const { t } = useTranslator();
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <Smartphone className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">{t('enrollment.continue_title')}</h2>
      </div>
      <p className="leading-7 text-muted-foreground">{continueBody}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild size="lg">
          <a href={handoffUrl}>{t('enrollment.open_android')}</a>
        </Button>
        <a className="text-sm text-primary underline" href={ANDROID_PLAY_STORE_URL} rel="noreferrer" target="_blank">
          {t('enrollment.get_on_play')}
        </a>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{playFallbackNote}</p>
    </section>
  );
}
