import { CheckCircle2, Clock } from 'lucide-react';
import { type Dispatch, useMemo, useReducer } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isRtlLanguage, LanguageSwitcher, type Translator, useTranslator } from '@/i18n';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import {
  type AppUsageEntry,
  useGetAppUsageSurveyDataQuery,
  useSubmitAppUsageSurveyMutation,
} from '@/state/study-operations-api';
import {
  buildHourlySubmission,
  groupByHourly,
  type HourlyApp,
  type HourlyGrouped,
  type HourlyStep,
  hourlyNextStep,
  hourlyPrevStep,
  isHourlyFinalStep,
  mergeSelections,
  remainingRanges,
  sortedBucketRanges,
} from './hourly-survey-core';

type ParticipantHourlySurveyFormProps = {
  date: string;
  /** Resolved translation-table code (see tud/i18n); defaults to English. */
  participantId: string;
  studyId: string;
};

// Step instructions are upstream's verbatim wording, keyed into the shared translation tables.
const INSTRUCTION_KEYS: Record<HourlyStep, string> = {
  intro: 'app_usage_survey.instructions_intro',
  selectChildApps: 'app_usage_survey.instructions.select_child_apps',
  selectSharedApps: 'app_usage_survey.instructions.select_shared_apps',
  resolveSharedApps: 'app_usage_survey.instructions.resolve_shared_apps',
  resolveOtherApps: 'app_usage_survey.instructions.resolve_other_apps',
};

const startOfDayIso = (date: string): string => `${date}T00:00:00.000Z`;
const endOfDayIso = (date: string): string => `${date}T23:59:59.999Z`;

type State = {
  childOnlyApps: Set<string>;
  initialSelections: Record<string, Set<string>>;
  otherSelections: Record<string, Set<string>>;
  sharedApps: Set<string>;
  step: HourlyStep;
};

type Action =
  | { type: 'next' }
  | { type: 'back' }
  | { pkg: string; type: 'toggleChildApp' }
  | { pkg: string; type: 'toggleSharedApp' }
  | { pass: 'initial' | 'other'; pkg: string; range: string; type: 'toggleBucket' };

const INITIAL_STATE: State = {
  childOnlyApps: new Set(),
  initialSelections: {},
  otherSelections: {},
  sharedApps: new Set(),
  step: 'intro',
};

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'next': {
      const next = hourlyNextStep(state.step, state.sharedApps.size > 0);
      return next ? { ...state, step: next } : state;
    }
    case 'back': {
      const prev = hourlyPrevStep(state.step);
      return prev ? { ...state, step: prev } : state;
    }
    case 'toggleChildApp': {
      const childOnlyApps = toggle(state.childOnlyApps, action.pkg);
      // An app is either child-only or shared, never both: if it just became child-only, drop it
      // from sharedApps (covers marking an app child-only after it was marked shared).
      const sharedApps =
        childOnlyApps.has(action.pkg) && state.sharedApps.has(action.pkg)
          ? toggle(state.sharedApps, action.pkg)
          : state.sharedApps;
      return { ...state, childOnlyApps, sharedApps };
    }
    case 'toggleSharedApp':
      return { ...state, sharedApps: toggle(state.sharedApps, action.pkg) };
    case 'toggleBucket': {
      const field = action.pass === 'initial' ? 'initialSelections' : 'otherSelections';
      const map = { ...state[field] };
      map[action.pkg] = toggle(map[action.pkg] ?? new Set<string>(), action.range);
      return { ...state, [field]: map };
    }
  }
}

/** Child-only apps (all buckets) + each shared app's merged (primary ∪ remaining) selected buckets. */
function buildPayload(state: State, grouped: HourlyGrouped): AppUsageEntry[] {
  const merged = mergeSelections(state.initialSelections, state.otherSelections);
  const sharedSelections: Record<string, Set<string>> = {};
  for (const pkg of state.sharedApps) {
    const ranges = merged[pkg];
    if (ranges) {
      sharedSelections[pkg] = ranges;
    }
  }
  return buildHourlySubmission(grouped, state.childOnlyApps, sharedSelections);
}

export function ParticipantHourlySurveyForm(props: ParticipantHourlySurveyFormProps) {
  const { date, participantId, studyId } = props;
  const t = useTranslator();
  const dir = isRtlLanguage(t.effectiveCode) ? 'rtl' : 'ltr';
  const {
    data: apps,
    isLoading,
    isError,
  } = useGetAppUsageSurveyDataQuery({
    endDate: endOfDayIso(date),
    participantId,
    startDate: startOfDayIso(date),
    studyId,
  });

  const [submit, submitResult] = useSubmitAppUsageSurveyMutation();
  const submitState = getMutationRequestState(submitResult);
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const grouped: HourlyGrouped = useMemo(() => groupByHourly(apps ?? []), [apps]);
  const allApps = useMemo(() => Object.keys(grouped).sort(), [grouped]);
  const sharedCandidates = useMemo(
    () => allApps.filter((pkg) => !state.childOnlyApps.has(pkg)),
    [allApps, state.childOnlyApps],
  );
  const sharedAppEntries = useMemo<Array<[string, HourlyApp]>>(
    () =>
      Object.entries(grouped)
        .filter(([pkg]) => state.sharedApps.has(pkg))
        .sort(([a], [b]) => a.localeCompare(b)),
    [grouped, state.sharedApps],
  );

  const hasApps = allApps.length > 0;
  const isFinal = isHourlyFinalStep(state.step, state.sharedApps.size > 0);
  const isPending = submitState === REQUEST_STATES.PENDING;
  const handleSubmit = () => {
    submit({ data: buildPayload(state, grouped), participantId, studyId })
      .unwrap()
      .catch(() => {
        // RTK Query owns the failure state rendered below.
      });
  };

  if (isLoading) {
    return (
      <StatusCard
        description={t.t('app_usage_survey.loading_description')}
        dir={dir}
        title={t.t('app_usage_survey.loading_title')}
      />
    );
  }
  if (isError) {
    return (
      <StatusCard
        description={t.t('app_usage_survey.unavailable_description')}
        dir={dir}
        title={t.t('app_usage_survey.unavailable_title')}
      />
    );
  }
  if (submitState === REQUEST_STATES.SUCCESS) {
    return (
      <Card className="max-w-2xl" dir={dir}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {t.t('app_usage_survey.thank_you_title')}
          </CardTitle>
          <CardDescription>{t.t('app_usage_survey.thank_you_for_participating')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t.t('app_usage_survey.title')}
          </CardTitle>
          <LanguageSwitcher />
        </div>
        <CardDescription>{t.t(INSTRUCTION_KEYS[state.step])}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasApps ? (
          <HourlyStepBody
            allApps={allApps}
            dispatch={dispatch}
            grouped={grouped}
            sharedAppEntries={sharedAppEntries}
            sharedCandidates={sharedCandidates}
            state={state}
            translator={t}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t.t('app_usage_survey.no_apps_today')}</p>
        )}

        {submitState === REQUEST_STATES.FAILURE && (
          <p className="text-sm text-destructive">{t.t('app_usage_survey.error_submit')}</p>
        )}

        <div className="flex justify-between">
          <Button
            disabled={state.step === 'intro' || isPending}
            onClick={() => dispatch({ type: 'back' })}
            type="button"
            variant="outline"
          >
            {t.t('button_back')}
          </Button>
          {isFinal ? (
            <Button disabled={!hasApps || isPending} onClick={handleSubmit} type="button">
              {isPending ? t.t('app_usage_survey.submitting') : t.t('app_usage_survey.submit_survey')}
            </Button>
          ) : (
            <Button disabled={!hasApps} onClick={() => dispatch({ type: 'next' })} type="button">
              {state.step === 'intro' ? t.t('app_usage_survey.begin_survey') : t.t('button_next')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type StepBodyProps = {
  allApps: string[];
  dispatch: Dispatch<Action>;
  grouped: HourlyGrouped;
  sharedAppEntries: Array<[string, HourlyApp]>;
  sharedCandidates: string[];
  state: State;
  translator: Translator;
};

function HourlyStepBody(props: StepBodyProps) {
  const { allApps, dispatch, grouped, sharedAppEntries, sharedCandidates, state, translator } = props;
  switch (state.step) {
    case 'selectChildApps':
      return (
        <AppChecklist
          apps={allApps}
          grouped={grouped}
          onToggle={(pkg) => dispatch({ pkg, type: 'toggleChildApp' })}
          selected={state.childOnlyApps}
          translator={translator}
        />
      );
    case 'selectSharedApps':
      return (
        <AppChecklist
          apps={sharedCandidates}
          grouped={grouped}
          onToggle={(pkg) => dispatch({ pkg, type: 'toggleSharedApp' })}
          selected={state.sharedApps}
          translator={translator}
        />
      );
    case 'resolveSharedApps':
      return (
        <BucketChecklists
          entries={sharedAppEntries}
          onToggle={(pkg, range) => dispatch({ pass: 'initial', pkg, range, type: 'toggleBucket' })}
          rangesFor={(_pkg, app) => sortedBucketRanges(app)}
          selections={state.initialSelections}
          translator={translator}
        />
      );
    case 'resolveOtherApps':
      return (
        <BucketChecklists
          entries={sharedAppEntries}
          onToggle={(pkg, range) => dispatch({ pass: 'other', pkg, range, type: 'toggleBucket' })}
          rangesFor={(pkg, app) => remainingRanges(app, state.initialSelections[pkg] ?? new Set())}
          selections={state.otherSelections}
          translator={translator}
        />
      );
    default:
      return null;
  }
}

type AppChecklistProps = {
  apps: string[];
  grouped: HourlyGrouped;
  onToggle: (pkg: string) => void;
  selected: Set<string>;
  translator: Translator;
};

function AppChecklist({ apps, grouped, onToggle, selected, translator }: AppChecklistProps) {
  if (apps.length === 0) {
    return <p className="text-sm text-muted-foreground">{translator.t('app_usage_survey.no_apps_to_choose')}</p>;
  }
  return (
    <div className="space-y-2">
      {apps.map((pkg) => (
        <label
          className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-foreground"
          key={pkg}
        >
          <input
            checked={selected.has(pkg)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            onChange={() => onToggle(pkg)}
            type="checkbox"
          />
          <span>{grouped[pkg]?.appLabel || pkg}</span>
        </label>
      ))}
    </div>
  );
}

type BucketChecklistsProps = {
  entries: Array<[string, HourlyApp]>;
  onToggle: (pkg: string, range: string) => void;
  rangesFor: (pkg: string, app: HourlyApp) => string[];
  selections: Record<string, Set<string>>;
  translator: Translator;
};

function BucketChecklists({ entries, onToggle, rangesFor, selections, translator }: BucketChecklistsProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{translator.t('app_usage_survey.no_shared_apps')}</p>;
  }
  return (
    <div className="space-y-5">
      {entries.map(([pkg, app]) => {
        const ranges = rangesFor(pkg, app);
        return (
          <fieldset className="space-y-2" key={pkg}>
            <legend className="flex items-baseline gap-2">
              <Badge variant="outline">{app.appLabel || pkg}</Badge>
            </legend>
            {ranges.length === 0 ? (
              <p className="text-sm text-muted-foreground">{translator.t('app_usage_survey.no_remaining_times')}</p>
            ) : (
              <div className="space-y-2">
                {ranges.map((range) => (
                  <label
                    className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-2 text-sm text-foreground"
                    key={range}
                  >
                    <input
                      checked={selections[pkg]?.has(range) ?? false}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      onChange={() => onToggle(pkg, range)}
                      type="checkbox"
                    />
                    <span>{range}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function StatusCard({ description, dir, title }: { description: string; dir: 'ltr' | 'rtl'; title: string }) {
  return (
    <Card className="max-w-2xl" dir={dir}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
