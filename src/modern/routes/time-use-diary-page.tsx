import { Layers } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { ParticipantInstrumentState } from '@/components/participant-instrument-state';
import { ParticipantLandingCard } from '@/components/participant-landing-card';
import type { ActivityDay } from '@/components/tud/tud-flow';
import { TimeUseDiaryForm } from '@/components/tud/tud-form';
import { resolveBaseLang, resolveTudSettings, supportsTodayDiary } from '@/components/tud/tud-page-settings';
import { resolveLanguageCode, useTranslator } from '@/i18n';
import { useGetTimeUseDiarySettingsQuery } from '@/state/study-operations-api';

export function TimeUseDiaryPage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  const activityDate = searchParams.get('date') || '';

  // The study's configured TUD instrument (OSU/Sherbrooke question set, clock format, locale)
  // is authoritative; see resolveTudSettings for the URL-override precedence. RTK retains
  // verified settings during refresh failures and blocks first-load failures.
  const {
    currentData: studySettings,
    isError,
    refetch,
  } = useGetTimeUseDiarySettingsQuery(studyId, {
    skip: !studyId,
  });

  const resolved = studySettings !== undefined;

  const ready = Boolean(studyId && participantId && activityDate);
  const language = useTranslator();
  const { t } = language;
  const baseLang = resolveBaseLang(searchParams, studySettings);
  const effectiveCode = resolveLanguageCode(baseLang, searchParams.get('gender'));

  // The diary's language may come from the study's TUD settings rather than the link; keep
  // the shared shell (widgets, landing card, switcher) on the same table.
  useEffect(() => {
    if (language.effectiveCode !== effectiveCode) language.setLanguage(baseLang, searchParams.get('gender'));
  }, [baseLang, effectiveCode, language, searchParams]);

  // Hard-gate the wizard on settings resolving so it never mounts with the wrong variant and
  // then flips when the fetch lands.
  if (ready && !resolved) {
    return (
      <ParticipantInstrumentState isError={isError} loadingLabel={t('tud_route.loading')} onRetry={() => refetch()} />
    );
  }

  const requestedDay = searchParams.get('day');
  const activityDay: ActivityDay = requestedDay === 'today' && supportsTodayDiary(baseLang) ? 'today' : 'yesterday';

  const settings = resolveTudSettings(searchParams, studySettings);

  if (ready) {
    return (
      <TimeUseDiaryForm
        activityDate={activityDate}
        activityDay={activityDay}
        effectiveCode={effectiveCode}
        familyId={searchParams.get('familyId') || undefined}
        participantId={participantId}
        settings={settings}
        studyId={studyId}
        waveId={searchParams.get('waveId') || undefined}
      />
    );
  }

  return (
    <ParticipantLandingCard
      description={t('tud_route.landing_description')}
      extraParams={[
        { key: 'familyId', label: t('tud_route.family') },
        { key: 'day', label: t('tud_route.day') },
      ]}
      icon={<Layers className="h-5 w-5 text-primary" />}
      title={t('tud_route.title')}
    />
  );
}
