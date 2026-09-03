import { CalendarClock, ExternalLink, FileClock, NotebookPen, TriangleAlert, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { SectionHeader } from '@/components/section-header';
import { StatCard } from '@/components/stat-card';
import { StatePanel } from '@/components/state-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslator } from '@/i18n';
import { formatDisplayDate } from '@/lib/format';
import { modernSurveyPath, modernTimeUseDiaryPath } from '@/lib/route-links';
import { fetchWithCsrf } from '@/state/study-operations-api';

type ParticipantSubmission = {
  date: string;
  id: string;
};

const DAYS_BACK = 90;

function getParticipantParams(search: string) {
  const params = new URLSearchParams(search);
  const studyId = params.get('studyId')?.trim() ?? '';
  const participantId = params.get('participantId')?.trim() ?? '';

  return {
    participantId,
    studyId,
  };
}

function normalizeSubmissionData(payload: unknown): ParticipantSubmission[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  return Object.entries(payload)
    .reduce<ParticipantSubmission[]>((entries, [date, value]) => {
      const ids = Array.isArray(value) ? value : [value];
      ids.forEach((id) => {
        if (typeof id === 'string' || typeof id === 'number') {
          entries.push({ date, id: String(id) });
        }
      });
      return entries;
    }, [])
    .sort((left, right) => right.date.localeCompare(left.date));
}

async function fetchSubmissionHistory(studyId: string, participantId: string): Promise<ParticipantSubmission[]> {
  const now = new Date();
  const startDate = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    endDate: now.toISOString(),
    startDate: startDate.toISOString(),
  });

  const response = await fetchWithCsrf(
    `/chronicle/api/web/time-use-diary/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(`${HISTORY_FAILED_PREFIX}${response.status}`);
  }

  const data: unknown = await response.json();
  return normalizeSubmissionData(data);
}

// The transport failure carries only an HTTP status, so it is matched by prefix and
// re-rendered as translated copy. Anything else (a browser network string, a parse error)
// is not participant-facing English worth showing, so it collapses to the generic sentence.
const HISTORY_FAILED_PREFIX = 'submission history request failed with status ';

function historyErrorText(err: unknown, t: (key: string, options?: Record<string, string>) => string): string {
  const message = err instanceof Error ? err.message : '';
  return message.startsWith(HISTORY_FAILED_PREFIX)
    ? t('participant_dashboard.history_error_status', { status: message.slice(HISTORY_FAILED_PREFIX.length) })
    : t('participant_dashboard.history_error');
}

export function ParticipantDashboardPage() {
  const { search } = useLocation();
  const { participantId, studyId } = useMemo(() => getParticipantParams(search), [search]);
  const { t } = useTranslator();
  const days = String(DAYS_BACK);

  const [submissions, setSubmissions] = useState<ParticipantSubmission[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmissionLoading, setSubmissionLoading] = useState(false);

  useEffect(() => {
    if (!studyId || !participantId) {
      setSubmissions([]);
      setSubmissionError(null);
      return undefined;
    }

    let isCancelled = false;
    setSubmissionLoading(true);
    setSubmissionError(null);

    fetchSubmissionHistory(studyId, participantId)
      .then((result) => {
        if (!isCancelled) {
          setSubmissions(result);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          setSubmissions([]);
          setSubmissionError(historyErrorText(err, t));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setSubmissionLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [studyId, participantId, t]);

  const { surveyUrl, tudUrl } = useMemo(() => {
    if (!studyId || !participantId) return { surveyUrl: '', tudUrl: '' };
    const queryDate = encodeURIComponent(new Date().toISOString().slice(0, 10));
    const encodedStudyId = encodeURIComponent(studyId);
    const encodedParticipantId = encodeURIComponent(participantId);
    return {
      surveyUrl: `${modernSurveyPath()}?studyId=${encodedStudyId}&participantId=${encodedParticipantId}&date=${queryDate}`,
      tudUrl: `${modernTimeUseDiaryPath()}?studyId=${encodedStudyId}&participantId=${encodedParticipantId}&date=${queryDate}`,
    };
  }, [studyId, participantId]);

  if (!studyId || !participantId) {
    return (
      <StatePanel
        description={t('participant_dashboard.incomplete_description')}
        eyebrow={t('participant_dashboard.incomplete_eyebrow')}
        icon={<TriangleAlert className="h-5 w-5" />}
        title={t('participant_dashboard.incomplete_title')}
        tone="destructive"
      />
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        description={t('participant_dashboard.description')}
        eyebrow={t('participant_dashboard.eyebrow')}
        icon={<UserRound className="h-3.5 w-3.5" />}
        title={t('participant_dashboard.title')}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard label={t('participant_dashboard.study_id')} value={studyId} />
        <StatCard label={t('participant_dashboard.participant_id')} value={participantId} />
        <StatCard
          label={t('participant_dashboard.recent_window')}
          value={t('participant_dashboard.last_days', { days })}
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>{t('participant_dashboard.quick_actions')}</CardTitle>
            <CardDescription>{t('participant_dashboard.quick_actions_description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full justify-between" size="lg">
              <a href={tudUrl}>
                {t('participant_dashboard.submit_tud')}
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild className="w-full justify-between" size="lg" variant="outline">
              <a href={surveyUrl}>
                {t('participant_dashboard.take_survey')}
                <NotebookPen className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('participant_dashboard.history_title')}</CardTitle>
          <CardDescription>{t('participant_dashboard.history_description', { days })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isSubmissionLoading && (
            <p className="text-sm text-muted-foreground">{t('participant_dashboard.history_loading')}</p>
          )}
          {submissionError && <p className="text-sm font-medium text-destructive">{submissionError}</p>}
          {!isSubmissionLoading && !submissionError && submissions.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/70 bg-muted/40 p-6 text-sm text-muted-foreground">
              {t('participant_dashboard.history_empty', { days })}
            </div>
          )}
          {!isSubmissionLoading && !submissionError && submissions.length > 0 && (
            <div className="space-y-3">
              {submissions.map((submission) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={submission.id}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      {formatDisplayDate(submission.date)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileClock className="h-3.5 w-3.5" />
                      {t('participant_dashboard.submission_id', { id: submission.id })}
                    </div>
                  </div>
                  <Badge variant="muted">{t('participant_dashboard.submission_type_tud')}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
