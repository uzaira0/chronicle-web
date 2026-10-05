import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslator } from '@/i18n';
import { readParticipantSessionContext } from '@/lib/participant-access';

type ParamField = {
  key: string;
  label: string;
};

type ParticipantLandingCardProps = {
  description: string;
  extraParams?: ParamField[];
  icon: ReactNode;
  title: string;
};

export function ParticipantLandingCard({ description, extraParams = [], icon, title }: ParticipantLandingCardProps) {
  const [searchParams] = useSearchParams();
  const { t } = useTranslator();

  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  const session = readParticipantSessionContext();
  const canOpenPortal = session?.formKind === 'PORTAL' && session.studyId === studyId && session.participantId === participantId;

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {studyId && participantId ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{t('participant_landing.study')}</strong> {studyId}
            </p>
            <p>
              <strong>{t('participant_landing.participant')}</strong> {participantId}
            </p>
            {extraParams.map(({ key, label }) => {
              const value = searchParams.get(key) || '';
              return (
                <p key={key}>
                  <strong>{label}:</strong> {value || t('common.not_specified')}
                </p>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('participant_landing.missing_params_before')}
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">studyId</code>
            {t('participant_landing.missing_params_and')}
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">participantId</code>
            {t('participant_landing.missing_params_after')}
          </p>
        )}

        {canOpenPortal && <Button asChild variant="outline">
          {/* Router-relative: the router's basename already supplies /chronicle. */}
          <Link to={{ pathname: '/participant', search: new URLSearchParams({ participantId, studyId }).toString() }}>
            {t('participant_landing.dashboard_link')}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>}
      </CardContent>
    </Card>
  );
}
