import { Calendar, CircleAlert, Download, Mail, Phone } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { CollectionModulesPanel } from '@/components/collection-modules-panel';
import { StatCard } from '@/components/stat-card';
import { StatePanel } from '@/components/state-panel';
import { StudySensorsCard } from '@/components/study-sensors-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { translateCatalog, useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate, isSentinelDate } from '@/lib/format';
import { COLLECTION_MODULES, STUDY_FEATURES } from '@/lib/study-constants';
import {
  useGetStudyDataCollectionSettingQuery,
  useGetStudyParticipantsQuery,
  useGetStudySummaryQuery,
} from '@/state/study-operations-api';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const CAPABILITY_COPY_KEYS: Record<string, string> = {
  ANDROID_SENSOR: 'study_details.capability_android_sensor',
  CHRONICLE_DATA_COLLECTION: 'study_details.capability_data_collection',
  CHRONICLE_SURVEYS: 'study_details.capability_surveys',
  IOS_SENSOR: 'study_details.capability_ios_sensor',
  TIME_USE_DIARY: 'study_details.capability_tud',
};

/**
 * A stat only states a number once the number is known. An in-flight or failed request
 * previously rendered as 0, which reads as a measurement rather than a placeholder.
 */
function statValue(isLoading: boolean, isError: boolean, value: number): string | number {
  if (isLoading) return '…';
  if (isError) return '—';
  return value;
}

function DetailField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TimelineRow({ label, value, withBorder }: { label: string; value: string; withBorder?: boolean }) {
  return (
    <div className={`flex justify-between ${withBorder ? 'border-t border-border pt-3' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function StudyDetailsPage() {
  const { studyId = '' } = useParams<{ studyId: string }>();
  const { t } = useTranslator();
  const { data: study } = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const {
    data: dataCollectionSetting,
    isError: isDataCollectionError,
    isLoading: isDataCollectionLoading,
  } = useGetStudyDataCollectionSettingQuery(studyId, { skip: !studyId });
  const {
    data: participants = [],
    error: participantsError,
    isError: isParticipantsError,
    isLoading: isParticipantsLoading,
  } = useGetStudyParticipantsQuery(studyId, { skip: !studyId });

  const enrolledCount = useMemo(
    () => participants.filter((p) => p.participationStatus === 'ENROLLED').length,
    [participants],
  );
  const modules = useMemo(() => (study?.modules ? Object.keys(study.modules) : []), [study?.modules]);
  const androidSettings = study?.settings?.AndroidSensor;
  const iosSensors = toStringArray(study?.settings?.Sensor?.[1]);
  const androidSensors: string[] = Array.isArray(androidSettings?.sensors) ? androidSettings.sensors : [];
  const dataCollectionModules = dataCollectionSetting?.modules ?? {};
  const enabledCollectionModuleCount = COLLECTION_MODULES.filter(
    ({ value }) => dataCollectionModules[value]?.enabled ?? false,
  ).length;
  const showSensorCard = (modules.includes('ANDROID_SENSOR') || modules.includes('IOS_SENSOR')) && Boolean(study);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Getting data out is the reason most people open a study, and the Overview
            offered no route to it — only the Bulk Downloads tab did. */}
        <Button asChild size="sm" variant="outline">
          <Link to={`/studies/${encodeURIComponent(studyId)}/downloads`}>
            <Download className="mr-1.5 h-4 w-4" />
            {t('study_details.download_data')}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* A pending or failed fetch used to render as a confident 0, which for a study
            that has participants is not a placeholder but a wrong number. */}
        <StatCard
          label={t('study_details.total_participants')}
          tone="default"
          value={statValue(isParticipantsLoading, isParticipantsError, participants.length)}
        />
        <StatCard
          label={t('study_details.enrolled')}
          value={statValue(isParticipantsLoading, isParticipantsError, enrolledCount)}
        />
        <StatCard
          label={t('study_details.collection_modules')}
          value={statValue(isDataCollectionLoading, isDataCollectionError, enabledCollectionModuleCount)}
        />
        <StatCard
          label={t('study_details.notifications')}
          value={study?.notificationsEnabled ? t('common.enabled') : t('common.disabled')}
        />
      </div>

      {isParticipantsError && (
        <StatePanel
          className="max-w-none"
          description={getErrorMessage(participantsError, t('study_details.participants_error_fallback'))}
          eyebrow={t('common.error')}
          icon={<CircleAlert className="h-5 w-5" />}
          title={t('study_details.participants_error_title')}
          tone="destructive"
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('study_details.study_information')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <DetailField label={t('study_details.study_id')}>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{studyId}</code>
                <CopyButton
                  className="h-auto w-auto rounded border-0 p-1 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                  value={studyId}
                  variant="ghost"
                />
              </div>
            </DetailField>
            {study?.group && <DetailField label={t('study_details.group')}>{study.group}</DetailField>}
            <DetailField label={t('study_details.contact')}>
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{study?.contact || t('common.not_set')}</span>
              </div>
              {study?.phoneNumber && (
                <div className="mt-1 flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{study.phoneNumber}</span>
                </div>
              )}
            </DetailField>
            {/* Capabilities were a five-card matrix restating the header chips; the
                per-capability copy now rides along as hover text on each chip. */}
            <DetailField label={t('study_details.capabilities')}>
              <div className="flex flex-wrap gap-1.5">
                {STUDY_FEATURES.map(({ label, value }) => (
                  <Badge
                    key={value}
                    title={t(CAPABILITY_COPY_KEYS[value] ?? 'study_details.capability_default')}
                    variant={modules.includes(value) ? 'success' : 'muted'}
                  >
                    {translateCatalog(t, 'feature', value, label)}
                  </Badge>
                ))}
              </div>
            </DetailField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {t('study_details.timeline')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <TimelineRow
              label={t('study_details.started')}
              value={study?.startedAt ? formatDisplayDate(study.startedAt) : t('common.na')}
            />
            <TimelineRow
              label={t('study_details.ends')}
              value={
                study?.endedAt && !isSentinelDate(study.endedAt)
                  ? formatDisplayDate(study.endedAt)
                  : t('study_details.open_ended')
              }
            />
            <TimelineRow
              label={t('study_details.created')}
              value={study?.createdAt ? formatDisplayDate(study.createdAt) : t('common.na')}
              withBorder
            />
            {study?.updatedAt && (
              <TimelineRow label={t('study_details.updated')} value={formatDisplayDate(study.updatedAt)} />
            )}
          </CardContent>
        </Card>
      </div>

      <CollectionModulesPanel
        isError={isDataCollectionError}
        isLoading={isDataCollectionLoading}
        modules={COLLECTION_MODULES}
        settings={dataCollectionModules}
      />

      {showSensorCard && (
        <StudySensorsCard
          androidSensors={androidSensors}
          androidSettings={androidSettings}
          iosSensors={iosSensors}
          showAndroid={modules.includes('ANDROID_SENSOR')}
          showIos={modules.includes('IOS_SENSOR')}
        />
      )}
    </div>
  );
}
