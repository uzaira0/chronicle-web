import { DEFAULT_STUDY_TIME_ZONE } from '@/lib/study-constants';
import { useGetStudySummaryQuery } from '@/state/study-operations-api';

/**
 * The zone that export day bounds use. Only the loaded study owns it: `timeZone` stays undefined until the
 * current study's summary arrives (and while it is failing), so no export can start on a guessed zone. A loaded
 * study without a Time Use Diary zone is in UTC, as on the server (chronicle-models StudySettings.timeZone()).
 */
export function useStudyTimeZone(studyId: string) {
  const query = useGetStudySummaryQuery(studyId, { skip: !studyId });
  const study = query.isError ? undefined : query.currentData;
  return { query, timeZone: study ? (study.settings?.TimeUseDiary?.timeZone ?? DEFAULT_STUDY_TIME_ZONE) : undefined };
}
