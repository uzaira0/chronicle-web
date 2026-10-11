import { Activity, ArrowRight, CircleAlert, Library } from 'lucide-react';
import { Link } from 'react-router';
import { SectionHeader } from '@/components/section-header';
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
  onRetry,
  studies,
}: {
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => unknown;
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
        onRetry={onRetry}
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
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center text-sm text-muted-foreground">
        <p>{t('overview.no_studies')}</p>
        <Button asChild size="sm" variant="outline">
          <Link to="/studies">{t('overview.view_studies')}</Link>
        </Button>
      </div>
    );
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
    refetch: refetchStudies,
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
        title={t('overview.title')}
      />

      <section className="grid items-start gap-6 lg:grid-cols-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-3 tabular-nums lg:col-span-2">
          {(
            [
              ['overview.stat_studies', studies.length],
              ['overview.stat_collecting', dataCollectionStudyCount],
              ['overview.stat_notifications', notificationEnabledCount],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{t(label)}</dt>
              <dd className="text-xl font-semibold">{isStudiesLoading ? '…' : isStudiesError ? '—' : value}</dd>
            </div>
          ))}
        </dl>

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
                onRetry={refetchStudies}
                studies={studies}
              />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
