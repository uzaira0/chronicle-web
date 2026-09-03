import { Activity, ArrowRight, CircleAlert, Library, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { statusLabel, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate } from '@/lib/format';
import { useAppSelector } from '@/state/store';
import { type StudySummary, useGetAllStudiesQuery } from '@/state/study-operations-api';

function hasValidId(study: StudySummary): study is StudySummary & { id: string } {
  return typeof study.id === 'string' && study.id.length > 0;
}

function RecentStudiesList({
  error,
  isError,
  isLoading,
  studies,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  studies: Array<StudySummary & { id: string }>;
}) {
  const { t } = useTranslator();
  if (isError) {
    return (
      <StatePanel
        className="max-w-none"
        description={getErrorMessage(error, t('common.unable_to_load_studies'))}
        eyebrow={t('common.error')}
        icon={<CircleAlert className="h-5 w-5" />}
        title={t('common.failed_to_load_studies')}
        tone="destructive"
      />
    );
  }

  if (isLoading) {
    return (
      <>
        <div className="h-14 animate-pulse rounded-lg bg-muted" />
        <div className="h-14 animate-pulse rounded-lg bg-muted" />
      </>
    );
  }

  if (studies.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t('overview.no_studies')}</p>;
  }

  return studies.slice(0, 3).map((study) => (
    <div
      className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/30"
      key={study.id}
    >
      <div>
        <p className="font-medium">{study.title}</p>
        <p className="text-xs text-muted-foreground">
          {study.contact || t('overview.no_contact')} ·{' '}
          {t('overview.updated', { date: study.updatedAt ? formatDisplayDate(study.updatedAt) : t('common.na') })}
        </p>
      </div>
      <Button asChild size="sm" variant="ghost">
        <Link aria-label={t('common.open_named', { name: study.title ?? study.id })} to={`/studies/${study.id}`}>
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  ));
}

export function OverviewPage() {
  const session = useAppSelector((state) => state.session);
  const { t } = useTranslator();
  const {
    data: allStudies = [],
    error: studiesError,
    isError: isStudiesError,
    isLoading: isStudiesLoading,
  } = useGetAllStudiesQuery(undefined, {
    skip: session.status !== 'authenticated',
  });
  const studies = allStudies.filter(hasValidId);
  const notificationEnabledCount = studies.filter((study) => study.notificationsEnabled).length;
  const dataCollectionStudyCount = studies.filter((study) => Boolean(study.modules?.CHRONICLE_DATA_COLLECTION)).length;

  return (
    <div className="space-y-6">
      {/* The header was wrapped in a Card with no body — a large empty box. It stands on
          its own like every other page header. */}
      <SectionHeader
        actions={
          <Button asChild>
            <Link to="/studies">
              <Library className="mr-1.5 h-4 w-4" />
              {t('overview.view_studies')}
            </Link>
          </Button>
        }
        description={t('overview.description')}
        eyebrow={t('overview.eyebrow')}
        icon={<ShieldCheck className="h-3 w-3" />}
        title={t('overview.title')}
      />

      {/* items-start: otherwise the grid stretches the stat cards to the height of the
          taller Runtime Status card, leaving a large empty area inside each. */}
      <section className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Three integers previously occupied three full-height cards with headings,
              descriptions and 4xl numerals. Same StatCard the study pages use. */}
          <StatCard
            label={t('overview.stat_studies')}
            tone="default"
            value={isStudiesLoading ? '…' : isStudiesError ? '—' : studies.length}
          />
          <StatCard
            label={t('overview.stat_collecting')}
            value={isStudiesLoading ? '…' : isStudiesError ? '—' : dataCollectionStudyCount}
          />
          <StatCard
            label={t('overview.stat_notifications')}
            value={isStudiesLoading ? '…' : isStudiesError ? '—' : notificationEnabledCount}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {t('overview.runtime_status')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-muted-foreground">{t('overview.auth_mode')}</span>
              <span className="font-medium">{statusLabel(t, 'auth_mode', session.authMode)}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-muted-foreground">{t('overview.session')}</span>
              <Badge variant={session.status === 'authenticated' ? 'success' : 'warning'}>
                {statusLabel(t, 'session', session.status)}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-muted-foreground">{t('overview.backend')}</span>
              <Badge variant={session.backendCompatibility === 'operational' ? 'success' : 'warning'}>
                {statusLabel(t, 'backend', session.backendCompatibility)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>{t('overview.recent_title')}</CardTitle>
            <CardDescription>{t('overview.recent_description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <RecentStudiesList
                error={studiesError}
                isError={isStudiesError}
                isLoading={isStudiesLoading}
                studies={studies}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
