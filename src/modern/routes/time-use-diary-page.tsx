import { Layers, LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

import { ParticipantLandingCard } from '@/components/participant-landing-card';
import type { ActivityDay } from '@/components/tud/tud-flow';
import { TimeUseDiaryForm } from '@/components/tud/tud-form';
import { resolveBaseLang, resolveTudSettings } from '@/components/tud/tud-page-settings';
import { resolveLanguageCode, useTranslator } from '@/i18n';
import { useGetTimeUseDiarySettingsQuery } from '@/state/study-operations-api';

// Languages that support the "today" diary variant; others fall back to "yesterday"
// (matches upstream TimeUseDiaryContainer).
const TODAY_CAPABLE_LANGS = new Set(['en', 'de', 'he']);

export function TimeUseDiaryPage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId') || '';
  const participantId = searchParams.get('participantId') || '';
  const activityDate = searchParams.get('date') || '';

  // The study's configured TUD instrument (OSU/Sherbrooke question set, clock format, locale)
  // is authoritative; see resolveTudSettings for the URL-override precedence. On error we fall
  // back to URL/defaults so a settings hiccup never locks a participant out of the diary.
  const { data: studySettings, isLoading: settingsLoading } = useGetTimeUseDiarySettingsQuery(studyId, {
    skip: !studyId,
  });

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
  // then flips when the fetch lands. (An error is NOT a gate — the query falls through to
  // undefined settings and resolveTudSettings degrades to URL/defaults.)
  if (ready && settingsLoading) {
    return (
      <div className="mx-auto flex max-w-2xl items-center gap-2 p-6 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {t('tud_route.loading')}
      </div>
    );
  }

  const requestedDay = searchParams.get('day');
  const activityDay: ActivityDay =
    requestedDay === 'today' && TODAY_CAPABLE_LANGS.has(baseLang) ? 'today' : 'yesterday';

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
