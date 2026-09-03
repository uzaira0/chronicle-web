// Pure submit-payload builder, ported from upstream `utils/createSubmitRequestBody`.
// It turns the page-keyed answers into the list of TimeUseDiaryResponse wire objects
// the backend expects (friendly aliases code/question/response/startDateTime/endDateTime,
// pinned deserializable by chronicle-api's TimeUseDiaryResponseTest).
//
// Two design choices keep this correct-by-construction:
//   * Option answers are stored as their ENGLISH canonical values (the renderer shows
//     localized labels), so submit needs no back-translation lookup.
//   * Times are stored as canonical 24h "HH:MM"; datetimes are formed by projecting
//     them onto the diary date with an injectable formatter (deterministic in tests).
import { FIELD, INTRO_PAGE, type TudAnswers } from './tud-flow';

export interface TimeUseDiaryResponse {
  code: string;
  question: string;
  response: string[];
  startDateTime?: string;
  endDateTime?: string;
}

// code -> human title (ol.title). Verbatim from upstream GeneralConstants.QUESTION_TITLE_LOOKUP.
const QUESTION_TITLE_LOOKUP: Record<string, string> = {
  activityEndTime: 'Activity end time',
  activityStartTime: 'Activity start time',
  adultMedia: 'Adult media use',
  bgAudioDay: 'Background audio',
  bgTvDay: 'Background TV',
  careGiver: 'Caregiver',
  dayOfWeek: 'Day of week',
  nonTypicalDayReason: 'Non typical day reason',
  nonTypicalSleepReason: 'Non typical sleep reason',
  otherActivity: 'Other activity',
  primaryActivity: 'Primary activity',
  primaryBookTitle: 'Primary book title',
  primaryBookType: 'Primary book type',
  primaryMediaActivity: 'Primary media activity',
  primaryMediaAge: 'Primary media age',
  primaryMediaName: 'Primary media name',
  secondaryActivity: 'Secondary activity',
  secondaryMediaActivity: 'Secondary media activity',
  secondaryMediaAge: 'Secondary media age',
  secondaryMediaName: 'Secondary media name',
  sleepArrangement: 'Sleep arrangement',
  typicalDay: 'Typical day',
  typicalSleepPattern: 'Sleep pattern',
  wakeUpCount: 'Wake up at night',
};

// Keys never emitted (carriers / internal flags). Verbatim from upstream entriesToOmit.
const ENTRIES_TO_OMIT: ReadonlySet<string> = new Set([
  FIELD.ACTIVITY_END_TIME,
  FIELD.ACTIVITY_START_TIME,
  FIELD.CLOCK_FORMAT,
  FIELD.FOLLOWUP_COMPLETED,
  'activitySelectPage',
  'otherActivity',
]);

export interface BuildSubmissionInput {
  answers: TudAnswers;
  activityDay: string;
  activityDate: string; // ISO date, e.g. "2026-06-01"
  waveId?: string | null;
  familyId?: string | null;
  /** date + "HH:MM" -> ISO offset datetime. Injectable for deterministic tests. */
  formatDateTime?: (date: string, time: string) => string;
}

/** Local-zone ISO offset datetime for a wall-clock time on a date (default formatter). */
export function localOffsetDateTime(date: string, time: string): string {
  const local = new Date(`${date}T${time}:00`);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, '0');
  const om = String(abs % 60).padStart(2, '0');
  return `${date}T${time.length === 5 ? `${time}:00` : time}${sign}${oh}:${om}`;
}

function stringifyValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

function sectionTimes(
  data: Record<string, unknown>,
  input: BuildSubmissionInput,
): { startDateTime?: string; endDateTime?: string } {
  const start = data[FIELD.ACTIVITY_START_TIME];
  const end = data[FIELD.ACTIVITY_END_TIME];
  if (typeof start !== 'string' || typeof end !== 'string') return {};
  const fmt = input.formatDateTime ?? localOffsetDateTime;
  return { endDateTime: fmt(input.activityDate, end), startDateTime: fmt(input.activityDate, start) };
}

// Should this answer key be dropped from the payload?
function isOmitted(key: string, hasFollowUp: boolean): boolean {
  if (key === FIELD.PRIMARY_ACTIVITY && !hasFollowUp) return true; // label kept only on contextual pages
  return ENTRIES_TO_OMIT.has(key);
}

// All emitted rows for one page-section, with its (optional) datetimes attached.
function sectionEntries(data: Record<string, unknown>, input: BuildSubmissionInput): TimeUseDiaryResponse[] {
  const hasFollowUp = Boolean(data[FIELD.FOLLOWUP_COMPLETED]);
  const times = sectionTimes(data, input);
  const rows: TimeUseDiaryResponse[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (isOmitted(key, hasFollowUp)) continue;
    if (value === undefined || value === null || value === '') continue;
    rows.push({ code: key, question: QUESTION_TITLE_LOOKUP[key] ?? key, response: stringifyValue(value), ...times });
  }
  return rows;
}

/**
 * Build the ordered TimeUseDiaryResponse list. Page 0 (intro) is skipped wholesale;
 * activityDate/activityDay lead, waveId/familyId trail (only when present).
 */
export function buildSubmission(input: BuildSubmissionInput): TimeUseDiaryResponse[] {
  const out: TimeUseDiaryResponse[] = [];
  out.push({ code: FIELD.ACTIVITY_DATE, question: FIELD.ACTIVITY_DATE, response: [input.activityDate] });
  out.push({ code: FIELD.ACTIVITY_DAY, question: FIELD.ACTIVITY_DAY, response: [input.activityDay] });

  const pages = Object.keys(input.answers)
    .map(Number)
    .filter((p) => p !== INTRO_PAGE)
    .sort((a, b) => a - b);
  for (const page of pages) {
    out.push(...sectionEntries(input.answers[page] ?? {}, input));
  }

  if (input.waveId) out.push({ code: 'waveId', question: 'Wave Id', response: [input.waveId] });
  if (input.familyId) out.push({ code: 'familyId', question: 'Family Id', response: [input.familyId] });
  return out;
}
