import {
  type BaseQueryApi,
  createApi,
  type FetchArgs,
  type FetchBaseQueryError,
  fetchBaseQuery,
} from '@reduxjs/toolkit/query/react';
import {
  COLLECTION_MODULE_IDS,
  type CollectionModuleId,
  IDEMPOTENCY_KEY_HEADER,
  PARTICIPANT_FORM_DATE_HEADER,
  PARTICIPATION_STATUS,
  PARTICIPATION_STATUSES,
  type ParticipationStatus,
  RESEARCHER_CSRF_HEADER,
  STUDY_LIFECYCLE_STATUSES,
  type StudyLifecycleStatus,
  type StudySettingType,
  USER_ACTIVITY_HEADER,
} from '@/generated/chronicle-contracts';
import { createTranslator, getBaseLanguageCode, getCurrentLanguage } from '@/i18n';
import { AUTH_SESSION_ENDPOINT } from '@/lib/auth-endpoints';
import { getResearcherCsrfToken } from '@/lib/bootstrap-auth';
import { navigatePostDownload } from '@/lib/download';
import {
  getParticipantCsrfToken,
  PARTICIPANT_CSRF_HEADER,
  PARTICIPANT_PUBLIC_API_BASE,
  type ParticipantFormKind,
  participantAccessCodeIssueUrl,
  participantLiveEnrollmentCodeUrl,
} from '@/lib/participant-access';
import type { StudyParticipantPolicySetting } from '@/lib/participant-policy';
import { anySignal, REQUEST_TIMEOUT_MS, timeoutSignal } from '@/lib/request-timeout';
import type { WithdrawalMode } from '@/lib/study-constants';
import type { SyncExportSelection } from '@/lib/sync-export-selection';
import type { components } from '@/types/chronicle-api.generated';
import {
  consumeUserActivity,
  expireSession,
  requeueUserActivity,
  SESSION_STATUS,
  type UserActivitySignal,
  waitForReauthentication,
} from './session-slice';
import { forgetSettingsRevision, isSettingsConflict, rememberSettingsRevision } from './settings-revision';

// Canonical status/policy value sets come from the generated LinkML contract module —
// re-exported here so existing consumers keep importing them from this API surface.
export type { ParticipationStatus, StudyLifecycleStatus };

type StudyWriteResult<T> = { data: T; settingsRevision: string | undefined };
const ENROLLMENT_ACCESS_CODE_EXPIRY_MS = 29 * 24 * 60 * 60 * 1000;
const STUDY_DELETIONS_TAG = 'StudyDeletions';
const PENDING_ENROLLMENTS_TAG = 'PendingEnrollments';

export type QuestionnaireQuestion = Required<components['schemas']['Question']>;

export type QuestionnaireRecord = QuestionnaireDraft & {
  id: NonNullable<components['schemas']['Questionnaire']['id']>;
  dateCreated?: NonNullable<components['schemas']['Questionnaire']['dateCreated']>;
};

export type QuestionnaireDraft = Required<
  Pick<components['schemas']['Questionnaire'], 'active' | 'description' | 'title'>
> &
  Partial<Pick<components['schemas']['Questionnaire'], 'recurrenceRule'>> & { questions: QuestionnaireQuestion[] };

/**
 * One participant answer to a questionnaire question. The backend
 * (`QuestionnaireResponse`) keys responses by the question *title* (not an id)
 * and stores the answer as a set of strings — open-ended questions carry the
 * free-text as a single-element array; multiple-choice questions carry the
 * selected choices.
 */
type ParticipantQuestionnaireResponse = components['schemas']['QuestionnaireResponse'];

/**
 * The study's Time Use Diary variant settings, as returned by the participant-readable
 * `GET /time-use-diary/{studyId}/settings` (backend `TimeUseDiarySettingsResponse`). Lets the
 * web diary render the study's *configured* instrument (OSU/Sherbrooke question set, clock
 * format, locale) instead of relying on URL params.
 */
type TimeUseDiarySettingsResponse = components['schemas']['TimeUseDiarySettingsResponse'];

/**
 * One answered Time Use Diary field, mirroring the backend `TimeUseDiaryResponse`
 * (friendly-alias wire shape, pinned deserializable by chronicle-api's
 * `TimeUseDiaryResponseTest`). `response` is always an array of english canonical
 * values; the datetimes are present only on activity-section rows.
 */
type ParticipantTimeUseDiaryResponse = components['schemas']['TimeUseDiarySubmission'];

/** Every ended survey day of the participant with its answer state, in the study time zone. */
export type AppUsageSurveyDays = components['schemas']['AppUsageSurveyDays'];
/** One ended survey day: the apps used for at least the study threshold, split into answer blocks. */
export type AppUsageDaySurvey = components['schemas']['AppUsageDaySurvey'];
export type AppUsageDayApp = components['schemas']['AppUsageDayApp'];
/** Who used one app in one block of the submitted day. */
export type AppUsageAnswer = components['schemas']['AppUsageAnswer'];

/** Response of the participant-readable `GET /survey/{studyId}/app-usage-frequency`. */
type AppUsageFrequencyResponse = components['schemas']['AppUsageFrequencyResponse'];

/** The served study, its open settings map narrowed to the setting types the web reads, and the ETag revision. */
export type StudySummary = Omit<components['schemas']['Study'], 'settings'> & {
  settings?: StudySettings;
  settingsRevision?: string | undefined;
};

type StudyUpdatePayload = components['schemas']['StudyUpdate'];

export type StudySubmissionGroup = {
  date: string;
  ids: string[];
};

type Candidate = components['schemas']['Candidate'] & Record<string, unknown>;

type StudySettings = Record<string, unknown> & {
  DataCollection?: DataCollectionSettingSummary;
  AppUsageSurvey?: components['schemas']['AppUsageSurveySetting'];
  ParticipantPolicy?: StudyParticipantPolicySetting;
  Withdrawal?: { mode: WithdrawalMode };
  TimeUseDiary?: { timeZone?: string } & Record<string, unknown>;
};

type CollectionModuleSettingSummary = Partial<components['schemas']['CollectionModuleSetting']> &
  Record<string, unknown>;

// AndroidDataCollectionSetting from GET /settings/type/DataCollection.
// Stored settings remain sparse; omitted modules use the Android catalog defaults.
export type DataCollectionSettingSummary = Omit<components['schemas']['AndroidDataCollectionSetting'], 'modules'> & {
  modules?: Record<string, CollectionModuleSettingSummary>;
};

/** The server's reading of the participant's decisions; the dashboard shows it and never re-derives it. */
export type ParticipantConsentState = components['schemas']['ParticipantConsentState'];

export type Participant = Omit<
  components['schemas']['Participant'],
  'candidate' | 'participantTags' | 'participantNotes' | 'participationStatus' | 'consentState'
> & {
  candidate: Candidate;
  consentState?: ParticipantConsentState | null;
  participantNotes?: components['schemas']['Participant']['participantNotes'];
  participantTags: string[];
  participationStatus: ParticipationStatus;
  withdrawnAt?: string | null;
};

export type ParticipantStats = components['schemas']['ParticipantStats'] &
  Required<Pick<components['schemas']['ParticipantStats'], 'androidUniqueDates' | 'iosUniqueDates' | 'tudUniqueDates'>>;

export type ParticipantStatsMap = Record<string, ParticipantStats>;

export type IosUploadStatus = components['schemas']['IosUploadStatus'];

type IosUploadStatusMap = Record<string, IosUploadStatus>;

export type AndroidDiagnosticCodeSummary = components['schemas']['AndroidDiagnosticCodeSummary'];

export type AndroidDiagnosticsHistoryRow = components['schemas']['AndroidDiagnosticsHistoryRow'];

type AndroidDiagnosticsPage = components['schemas']['AndroidDiagnosticsPage'];

function androidDiagnosticsUrl(filters: {
  studyId: string;
  participantId?: string;
  randomDeviceId?: string;
  fromDay?: string;
  toDay?: string;
  moduleFamily?: string;
  issueCode?: string;
  cursor?: string;
  limit?: number;
}) {
  const { studyId, ...queryValues } = filters;
  const entries = Object.entries({
    participantId: queryValues.participantId,
    randomDeviceId: queryValues.randomDeviceId,
    from: queryValues.fromDay,
    to: queryValues.toDay,
    moduleFamily: queryValues.moduleFamily,
    issueCode: queryValues.issueCode,
    cursor: queryValues.cursor,
    limit: queryValues.limit,
  }).flatMap(([key, value]) => (value === undefined || value === '' ? [] : [[key, String(value)] as [string, string]]));
  const query = new URLSearchParams(entries).toString();
  return `/study/${encodeURIComponent(studyId)}/participants/android/diagnostics${query ? `?${query}` : ''}`;
}

export type StudyDeviceInstance = components['schemas']['StudyDeviceInstance'];

type StudyDeviceInstancesMap = Record<string, StudyDeviceInstance[]>;

function normalizeParticipantMap<T>(...pages: Record<string, T>[]): Record<string, T> {
  const result = Object.create(null) as Record<string, T>;
  for (const page of pages) {
    Object.assign(result, page);
  }
  return result;
}

export const EMPTY_PARTICIPANT_MAP = Object.freeze(normalizeParticipantMap<never>());
// RTK Query's default cache merge rebuilds plain objects with Object.prototype.
const PARTICIPANT_MAP_QUERY_OPTIONS = { structuralSharing: false };

export type ComplianceViolationsMap = components['schemas']['ComplianceViolationsMap'];

export type StudySettingsAuditEntry = components['schemas']['StudySettingsAuditEntry'] &
  Required<Pick<components['schemas']['StudySettingsAuditEntry'], 'id' | 'changedAt'>>;

// One append-only entry in a study's participant collection-acknowledgment trail
// (GET /settings/acknowledgments). `recordedAt` is the server-stamped authoritative
// time; `acknowledgedAt` is the advisory device-reported time.
export type CollectionAcknowledgmentEntry = components['schemas']['CollectionAcknowledgmentEntry'] &
  Required<
    Pick<
      components['schemas']['CollectionAcknowledgmentEntry'],
      | 'id'
      | 'studyId'
      | 'participantId'
      | 'sourceRandomDeviceId'
      | 'acknowledgedAt'
      | 'recordedAt'
      | 'acknowledgedModules'
    >
  >;

// Mirrors TimeUseDiaryDownloadDataType in chronicle-api. Not part of ParticipantDataType.
export const TIME_USE_DIARY_DATA_TYPE = {
  dayTime: 'DayTime',
  nightTime: 'NightTime',
  summarized: 'Summarized',
} as const;
export const TIME_USE_DIARY_DATA_TYPES = Object.values(TIME_USE_DIARY_DATA_TYPE);
export type TimeUseDiaryDataType = (typeof TIME_USE_DIARY_DATA_TYPE)[keyof typeof TIME_USE_DIARY_DATA_TYPE];

export type StudyExportAvailability = components['schemas']['StudyExportAvailability'];

export type ApiKeyScope = components['schemas']['ApiKeyScope'];
const API_KEY_SCOPE_PERMISSIONS: [ApiKeyScope, string[]][] = [
  ['READ_ONLY', ['READ']],
  ['WRITE', ['READ', 'WRITE']],
  ['ADMIN', ['READ', 'WRITE', 'OWNER']],
];

/** Researcher API key metadata (backend `ApiKeyInfo`); the raw key is never listed. */
export type ApiKeyInfo = components['schemas']['ApiKeyInfo'];

/** Backend `ApiKeyCreateResponse`: `rawKey` is returned this once and never again. */
type ApiKeyCreateResponse = components['schemas']['ApiKeyCreateResponse'];

/** The erasure of a whole study; every other mode names a participant. */
export const STUDY_ERASURE_MODE: DataDeletionOperation['mode'] = 'STUDY_ERASURE';

/** A requested erasure: nothing is erased until an owner runs it; `erasable` is the server's verdict. */
export type DataDeletionOperation = components['schemas']['DataDeletionOperation'];

export type AndroidDeviceSensorAvailability = components['schemas']['AndroidDeviceSensorAvailability'] &
  Required<
    Pick<
      components['schemas']['AndroidDeviceSensorAvailability'],
      'participantId' | 'randomDeviceId' | 'availableSensors'
    >
  >;

export type StudyLimits = components['schemas']['StudyLimits'];

/** @internal Exported for testing only. */
export function normalizeQuestionnaireQuestion(value: unknown): QuestionnaireQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { choices: [], title: '' };
  }

  const record = value as { choices?: unknown; title?: unknown };
  const choices = Array.isArray(record.choices)
    ? record.choices.filter((choice): choice is string => typeof choice === 'string')
    : [];

  return {
    choices,
    title: typeof record.title === 'string' ? record.title : '',
  };
}

/** @internal Exported for testing only. */
export function normalizeQuestionnaireRecord(value: unknown): QuestionnaireRecord {
  const record = !value || typeof value !== 'object' || Array.isArray(value) ? {} : (value as Record<string, unknown>);

  const normalized: QuestionnaireRecord = {
    active: Boolean(record.active),
    description: typeof record.description === 'string' ? record.description : '',
    id: typeof record.id === 'string' ? record.id : '',
    questions: Array.isArray(record.questions) ? record.questions.map(normalizeQuestionnaireQuestion) : [],
    recurrenceRule: typeof record.recurrenceRule === 'string' ? record.recurrenceRule : null,
    title: typeof record.title === 'string' ? record.title : '',
  };

  if (typeof record.dateCreated === 'string') {
    normalized.dateCreated = record.dateCreated;
  }

  return normalized;
}

/** @internal Exported for testing only. */
export function normalizeQuestionnaireList(payload: unknown): QuestionnaireRecord[] {
  if (!Array.isArray(payload)) {
    throw new Error(`[normalizeQuestionnaireList] Expected array, received ${typeof payload}`);
  }

  return payload.map(normalizeQuestionnaireRecord).filter((questionnaire) => questionnaire.id);
}

/** @internal Exported for testing only. */
export function normalizeStudySubmissionGroups(payload: unknown): StudySubmissionGroup[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`[normalizeStudySubmissionGroups] Expected object, received ${typeof payload}`);
  }

  return Object.entries(payload as Record<string, unknown>)
    .map(([date, idsValue]) => {
      const ids = Array.isArray(idsValue)
        ? idsValue
            .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
            .map(String)
        : [];

      return { date, ids };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isParticipationStatus(value: unknown): value is ParticipationStatus {
  return typeof value === 'string' && (PARTICIPATION_STATUSES as readonly string[]).includes(value);
}

function isStudyLifecycleStatus(value: unknown): value is StudyLifecycleStatus {
  return typeof value === 'string' && (STUDY_LIFECYCLE_STATUSES as readonly string[]).includes(value);
}

/** @internal Exported for focused wire-contract regression tests. */
export function normalizeStudyLifecycleStatus(payload: unknown): StudyLifecycleStatus | null {
  if (isStudyLifecycleStatus(payload)) return payload;
  return isRecord(payload) && isStudyLifecycleStatus(payload.status) ? payload.status : null;
}

function normalizeCandidateId(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function normalizeCandidate(value: unknown): Candidate {
  if (!isRecord(value)) {
    return { id: '' };
  }

  return {
    ...value,
    id: normalizeCandidateId(value.id),
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function normalizeParticipantTags(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((tag: unknown) => typeof tag !== 'string')) {
    throw new Error(createTranslator(getCurrentLanguage()).t('participants.response_contract_invalid_tags'));
  }
  return value as string[];
}

function normalizeConsentState(value: unknown): ParticipantConsentState | null {
  if (!isRecord(value)) return null;
  const modules = (list: unknown) =>
    Array.isArray(list)
      ? list.filter((id): id is CollectionModuleId => COLLECTION_MODULE_IDS.some((known) => known === id))
      : [];
  return {
    declinedRequiredModules: modules(value.declinedRequiredModules),
    modulesAwaitingDecision: modules(value.modulesAwaitingDecision),
  };
}

/** @internal Exported for testing only. */
export function normalizeParticipantList(payload: unknown): Participant[] {
  if (!Array.isArray(payload)) {
    throw new Error(createTranslator(getCurrentLanguage()).t('participants.response_contract_expected_array'));
  }
  let unknownStatuses = 0;
  const participants = payload.map((participant, index) => {
    if (!isRecord(participant) || typeof participant.participantId !== 'string' || !participant.participantId) {
      throw new Error(
        createTranslator(getCurrentLanguage()).t('participants.response_contract_missing_id', { index: String(index) }),
      );
    }
    if (!isParticipationStatus(participant.participationStatus)) unknownStatuses += 1;
    return {
      candidate: normalizeCandidate(participant.candidate),
      participantId: participant.participantId,
      withdrawnAt: nullableString(participant.withdrawnAt),
      processingBlockedAt: nullableString(participant.processingBlockedAt),
      processingBlockReason: nullableString(participant.processingBlockReason),
      processingBlockedBy: nullableString(participant.processingBlockedBy),
      participantNotes:
        typeof participant.participantNotes === 'string' || participant.participantNotes === null
          ? participant.participantNotes
          : undefined,
      participantTags: normalizeParticipantTags(participant.participantTags),
      participationStatus: isParticipationStatus(participant.participationStatus)
        ? participant.participationStatus
        : PARTICIPATION_STATUS.UNKNOWN,
      statusRevision: typeof participant.statusRevision === 'number' ? participant.statusRevision : 0,
      consentState: normalizeConsentState(participant.consentState),
    };
  });
  if (unknownStatuses) {
    console.warn(`[normalizeParticipantList] ${unknownStatuses} row(s) had an unknown participation status`);
  }
  return participants;
}

async function logoutExpiredSession(
  status: FetchBaseQueryError['status'] | undefined,
  api: BaseQueryApi,
): Promise<boolean> {
  const session = (api.getState() as { session?: { status?: string; user?: { id: string | null } | null } }).session;
  if (
    status !== 401 ||
    (session?.status !== SESSION_STATUS.authenticated && session?.status !== SESSION_STATUS.locked)
  ) {
    return false;
  }
  // Register before dispatching: reauthentication can complete synchronously in a listener.
  const resumed = waitForReauthentication(api.signal, session.user?.id ?? null);
  if (session.status === SESSION_STATUS.authenticated) api.dispatch(expireSession());
  return resumed;
}

export async function fetchWithCsrf(url: string, init?: RequestInit, api?: BaseQueryApi): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Accept-Language', getBaseLanguageCode(getCurrentLanguage()));
  const csrfToken = getResearcherCsrfToken();
  if (csrfToken) headers.set(RESEARCHER_CSRF_HEADER, csrfToken);
  const participantCsrfToken = getParticipantCsrfToken();
  if (participantCsrfToken) {
    headers.set(PARTICIPANT_CSRF_HEADER, participantCsrfToken);
    if (!headers.has(IDEMPOTENCY_KEY_HEADER)) headers.set(IDEMPOTENCY_KEY_HEADER, crypto.randomUUID());
  }
  const activityApi = api && url.startsWith('/chronicle/api/web/') ? api : undefined;
  const request = {
    credentials: 'include',
    ...init,
    headers,
    signal: init?.signal ?? timeoutSignal(),
  } satisfies RequestInit;
  const response = await fetchWithActivity(url, request, activityApi);
  if (api && (await logoutExpiredSession(response.status, api))) {
    const renewedCsrfToken = getResearcherCsrfToken();
    if (renewedCsrfToken) headers.set(RESEARCHER_CSRF_HEADER, renewedCsrfToken);
    else headers.delete(RESEARCHER_CSRF_HEADER);
    const retried = await fetchWithActivity(
      url,
      {
        ...request,
        signal: anySignal([api.signal, init?.signal ?? timeoutSignal()]),
      },
      activityApi,
    );
    if (retried.status === 401) api.dispatch(expireSession());
    return retried;
  }
  return response;
}

type ActivityApi = Pick<BaseQueryApi, 'getState' | 'dispatch'>;

function applyUserActivityHeader(headers: Headers, api: ActivityApi): UserActivitySignal | null {
  const session = (api.getState() as { session?: { status?: string; pendingUserActivityAt?: number | null } }).session;
  headers.delete(USER_ACTIVITY_HEADER);
  const activityAt = session?.pendingUserActivityAt;
  if (session?.status !== SESSION_STATUS.authenticated || activityAt == null) return null;
  const attemptStartedAt = performance.now();
  headers.set(USER_ACTIVITY_HEADER, String(Math.max(0, Math.floor(attemptStartedAt - activityAt))));
  api.dispatch(consumeUserActivity(activityAt));
  return { activityAt, attemptStartedAt };
}

function restoreFailedActivity(api: ActivityApi, signal: UserActivitySignal | null, status?: number | string): void {
  if (signal !== null && status !== 401) api.dispatch(requeueUserActivity(signal));
}

/** `init.signal` is required: every caller supplies the request deadline (timeoutSignal or anySignal with it). */
async function fetchWithActivity(
  url: string,
  init: RequestInit & { signal: AbortSignal },
  api?: ActivityApi,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const activitySignal = api ? applyUserActivityHeader(headers, api) : null;
  try {
    const response = await fetch(url, { ...init, headers, signal: init.signal });
    if (api && !response.ok) restoreFailedActivity(api, activitySignal, response.status);
    return response;
  } catch (error) {
    if (api) restoreFailedActivity(api, activitySignal);
    throw error;
  }
}

// A caller-held key makes a user retry of the same logical submission dedupe server-side;
// without one, prepareHeaders mints a fresh key per request (replay protection only).
function idempotencyHeaders(idempotencyKey: string | undefined): Record<string, string> | undefined {
  return idempotencyKey ? { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } : undefined;
}

function participantSubmissionHeaders(idempotencyKey: string | undefined, logicalDate: string): Record<string, string> {
  return { ...idempotencyHeaders(idempotencyKey), [PARTICIPANT_FORM_DATE_HEADER]: logicalDate };
}

const EXPORT_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDay(value: string): boolean {
  if (!EXPORT_DAY.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/**
 * Date inputs give `YYYY-MM-DD`; the export endpoints bind ISO date-times. Resolve each
 * local day boundary, including days when midnight is skipped by a clock change.
 */
export function toExportDateTime(value: string, exclusiveEnd: boolean, timeZone: string): string {
  if (!isCalendarDay(value)) return value;
  const wall = new Date(`${value}T00:00:00Z`);
  if (exclusiveEnd) wall.setUTCDate(wall.getUTCDate() + 1);
  const formatter = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' });
  const offsetAt = (instant: number) => {
    const offset = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value;
    const match = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);
    return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
  };
  const first = wall.getTime() - offsetAt(wall.getTime());
  const second = wall.getTime() - offsetAt(first);
  // A skipped midnight alternates between the two sides of the gap. The later
  // instant is the first valid time on that day, matching ZoneId.atStartOfDay.
  const boundary = wall.getTime() - offsetAt(second);
  const instant = boundary === first && first !== second ? Math.max(first, second) : boundary;
  // Preserve the exclusive calendar boundary as well as its instant when midnight is skipped.
  const offset = exclusiveEnd ? wall.getTime() - instant : offsetAt(instant);
  const local = new Date(instant + offset).toISOString().slice(0, -1);
  const minutes = Math.abs(offset) / 60_000;
  const suffix = `${offset < 0 ? '-' : '+'}${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return `${local}${offset === 0 ? 'Z' : suffix}`;
}

function httpError(response: Response, text: string) {
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // Plain text errors still pass through the shared display sanitizer.
  }
  return { error: { status: response.status, data } } as const;
}

function networkError(err: unknown) {
  const timedOut = typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError';
  return { error: { status: timedOut ? ('TIMEOUT_ERROR' as const) : ('FETCH_ERROR' as const), error: String(err) } };
}

// The server caps every list page (PaginationDefaults: default 100, max 500; the settings audit
// and acknowledgment lists max 200). Read pages until one comes back short, so a study larger
// than one page is never silently truncated to its first page.
const MAX_LIST_PAGES = 200; // Limit: 100k rows at 500 a page; past that a list needs server-side search
type PageResult = { data?: unknown; error?: FetchBaseQueryError; meta?: { response?: Response } };
type PageFetch = (url: string) => unknown; // the endpoint's bound baseQuery

function pageSize(page: unknown): number {
  if (Array.isArray(page)) return page.length;
  return isRecord(page) ? Object.keys(page).length : 0;
}

async function readAllPages(
  fetchPage: PageFetch,
  path: string,
  limit: number,
): Promise<{ data: unknown[] } | { error: FetchBaseQueryError }> {
  const pages: unknown[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const result = (await fetchPage(`${path}${path.includes('?') ? '&' : '?'}${params.toString()}`)) as PageResult;
    if (result.error) return { error: result.error };
    pages.push(result.data);
    // Sparse aggregates page source participants, so the server supplies the next source offset.
    const next = result.meta?.response?.headers.get('X-Next-Offset');
    if (next != null) {
      const parsed = Number(next);
      if (!Number.isSafeInteger(parsed) || parsed <= offset) {
        const error = createTranslator(getCurrentLanguage()).t('common.error_unreadable_response');
        return { error: { status: 'CUSTOM_ERROR', error } };
      }
      offset = parsed;
    } else {
      if (pageSize(result.data) < limit) return { data: pages };
      offset += limit;
    }
  }
  return {
    error: {
      status: 'CUSTOM_ERROR',
      error: `List exceeds ${MAX_LIST_PAGES} full pages; use a narrower query or export.`,
    },
  };
}

/** Array pages joined; a malformed page is passed through as-is for the caller's validation. */
function concatPages(pages: unknown[]): unknown {
  return pages.every(Array.isArray) ? pages.flat() : pages.find((page) => !Array.isArray(page));
}

async function readAllRows<T>(
  fetchPage: PageFetch,
  path: string,
  limit: number,
  normalize: (rows: unknown) => T = (rows) => rows as T,
): Promise<{ data: T } | { error: FetchBaseQueryError }> {
  const result = await readAllPages(fetchPage, path, limit);
  if ('error' in result) return result;
  try {
    return { data: normalize(concatPages(result.data)) };
  } catch (error) {
    return { error: { status: 'CUSTOM_ERROR', error: error instanceof Error ? error.message : String(error) } };
  }
}

async function readParticipantPages<T>(
  fetchPage: PageFetch,
  path: string,
): Promise<{ data: Record<string, T> } | { error: FetchBaseQueryError }> {
  const result = await readAllPages(fetchPage, path, 500);
  return 'error' in result ? result : { data: normalizeParticipantMap(...(result.data as Record<string, T>[])) };
}

function parsingError(response: Response, error: string) {
  return {
    error: {
      data: '',
      error,
      originalStatus: response.status,
      status: 'PARSING_ERROR' as const,
    },
  };
}

async function readJsonResponse<T>(response: Response, emptyResponse?: T) {
  try {
    const text = await response.text();
    return { data: !text && emptyResponse !== undefined ? emptyResponse : (JSON.parse(text) as T) };
  } catch {
    return parsingError(response, createTranslator(getCurrentLanguage()).t('common.error_unreadable_response'));
  }
}

async function readRevisionedResource<T>(
  baseQuery: (path: string) => ReturnType<ReturnType<typeof fetchBaseQuery>>,
  path: string,
  normalize: (data: unknown) => T,
): Promise<{ data: { data: T; revision: string } } | { error: FetchBaseQueryError }> {
  const result = await baseQuery(path);
  if (result.error) return { error: result.error };
  const revision = result.meta?.response?.headers.get('etag');
  if (!revision) return { error: { status: 'CUSTOM_ERROR', error: 'Missing resource revision' } };
  return { data: { data: normalize(result.data), revision } };
}

function downloadResource(url: string, filename: string | undefined) {
  try {
    navigatePostDownload(url, getResearcherCsrfToken() ?? '', filename);
    return { data: null };
  } catch {
    return {
      error: {
        status: 'CUSTOM_ERROR' as const,
        error: createTranslator(getCurrentLanguage()).t('common.error_download_browser'),
      },
    };
  }
}

function participantDataQuery({
  dataType,
  participantIds,
  startDate,
  endDate,
  timeZone,
}: {
  dataType: string;
  participantIds: string[];
  startDate?: string | undefined;
  endDate?: string | undefined;
  /** The loaded study's zone (useStudyTimeZone); day bounds are study-zone days. */
  timeZone: string;
}): string {
  const params = new URLSearchParams({ dataType });
  for (const pid of participantIds) params.append('participantId', pid);
  if (startDate) params.set('startDate', toExportDateTime(startDate, false, timeZone));
  if (endDate) params.set('endDate', toExportDateTime(endDate, true, timeZone));
  return params.toString();
}

type LifecycleTransition = { studyId: string; ifMatch: string | undefined };

/** Archive and restore apply to the study revision the page shows; lifecycleTags refetch it on 412 too. */
function ifMatchHeader(ifMatch: string | undefined) {
  return ifMatch ? { 'If-Match': ifMatch } : undefined;
}

function lifecycleTags(studyId: string) {
  return [
    { id: studyId, type: 'Study' as const },
    { id: 'LIST', type: 'Study' as const },
    { id: studyId, type: 'Lifecycle' as const },
  ];
}

const baseQueryOptions = {
  credentials: 'include',
  timeout: REQUEST_TIMEOUT_MS,
  prepareHeaders: (headers) => {
    // The backend resolves its MessageSource locale from Accept-Language, so server-sent
    // error text follows the dashboard language rather than the browser default.
    headers.set('Accept-Language', getBaseLanguageCode(getCurrentLanguage()));
    // ChronicleCookieOrBearerTokenResolver requires a matching X-CSRF-Token
    // header for cookie-based auth. Without this, requests with the
    // chronicle_auth cookie fail CSRF validation and return 401.
    const csrfToken = getResearcherCsrfToken();
    if (csrfToken) {
      headers.set(RESEARCHER_CSRF_HEADER, csrfToken);
    }
    const participantCsrfToken = getParticipantCsrfToken();
    if (participantCsrfToken) {
      headers.set(PARTICIPANT_CSRF_HEADER, participantCsrfToken);
      if (!headers.has(IDEMPOTENCY_KEY_HEADER)) headers.set(IDEMPOTENCY_KEY_HEADER, crypto.randomUUID());
    }
    return headers;
  },
} satisfies Parameters<typeof fetchBaseQuery>[0];
const researcherBaseQuery = fetchBaseQuery({ ...baseQueryOptions, baseUrl: '/chronicle/api/web' });

async function researcherRequest(
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: StudyOperationsExtraOptions,
) {
  const request = typeof args === 'string' ? { url: args } : args;
  const headers = new Headers(request.headers as HeadersInit);
  const passive = api.type === 'query' && api.forced;
  if (passive) headers.delete(USER_ACTIVITY_HEADER);
  const activitySignal = passive ? null : applyUserActivityHeader(headers, api);
  const result = await researcherBaseQuery({ ...request, headers }, api, extraOptions);
  if (result.error) restoreFailedActivity(api, activitySignal, result.error.status);
  if (result.error?.status === 'PARSING_ERROR') {
    return {
      error: {
        ...result.error,
        data: '',
        error: createTranslator(getCurrentLanguage()).t('common.error_unreadable_response'),
      },
      ...(result.meta ? { meta: result.meta } : {}),
    };
  }
  return result;
}
// Participant forms are reachable only under the public prefix: a self-host participant
// listener refuses /chronicle/api/web. Endpoints opt in with extraOptions.participantPublic.
const participantBaseQuery = fetchBaseQuery({ ...baseQueryOptions, baseUrl: PARTICIPANT_PUBLIC_API_BASE });
type StudyOperationsExtraOptions = { participantPublic?: boolean };

export const studyOperationsApi = createApi({
  refetchOnReconnect: true,
  baseQuery: async (args: string | FetchArgs, api: BaseQueryApi, extraOptions: StudyOperationsExtraOptions = {}) => {
    if (extraOptions.participantPublic) return participantBaseQuery(args, api, extraOptions);
    const result = await researcherRequest(args, api, extraOptions);
    if (await logoutExpiredSession(result.error?.status, api)) {
      const retried = await researcherRequest(args, api, extraOptions);
      if (retried.error?.status === 401) api.dispatch(expireSession());
      return retried;
    }
    return result;
  },
  endpoints: (builder) => ({
    refreshSessionActivity: builder.mutation<null, void>({
      queryFn: async (_arg, api) => {
        const headers = new Headers();
        const activitySignal = applyUserActivityHeader(headers, api);
        if (!headers.has(USER_ACTIVITY_HEADER)) return { data: null };
        try {
          const response = await fetchWithCsrf(AUTH_SESSION_ENDPOINT, { headers });
          if (response.status === 401) api.dispatch(expireSession());
          if (!response.ok) {
            restoreFailedActivity(api, activitySignal, response.status);
            return httpError(response, await response.text());
          }
          const result = await readJsonResponse<{ authenticated?: boolean }>(response);
          if ('error' in result) {
            restoreFailedActivity(api, activitySignal);
            return result;
          }
          if (result.data.authenticated !== true) api.dispatch(expireSession());
          return { data: null };
        } catch (error) {
          restoreFailedActivity(api, activitySignal);
          return networkError(error);
        }
      },
    }),
    // A mutation, not a cached query: the live code is a credential and is read only when the dialog opens.
    lookupLiveEnrollmentCode: builder.mutation<
      { accessCode?: unknown } | null,
      { studyId: string; participantId: string }
    >({
      queryFn: async ({ studyId, participantId }, api) => {
        try {
          const response = await fetchWithCsrf(participantLiveEnrollmentCodeUrl(studyId, participantId), {}, api);
          if (response.status === 404) return { data: null };
          if (!response.ok) return httpError(response, '');
          return await readJsonResponse<{ accessCode?: unknown }>(response);
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    issueParticipantAccessCode: builder.mutation<
      { accessCode?: unknown },
      { studyId: string; participantId: string; formKind: ParticipantFormKind; logicalDate?: string }
    >({
      invalidatesTags: (_result, error, { studyId, formKind }) =>
        !error && formKind === 'ENROLLMENT' ? [{ id: studyId, type: PENDING_ENROLLMENTS_TAG }] : [],
      queryFn: async ({ studyId, participantId, formKind, logicalDate }, api) => {
        try {
          const response = await fetchWithCsrf(
            participantAccessCodeIssueUrl(studyId, participantId),
            {
              body: JSON.stringify({
                formKind,
                ...(logicalDate ? { logicalDate } : {}),
                ...(formKind === 'ENROLLMENT'
                  ? { expiresAt: new Date(Date.now() + ENROLLMENT_ACCESS_CODE_EXPIRY_MS).toISOString() }
                  : {}),
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST',
            },
            api,
          );
          if (!response.ok) return httpError(response, '');
          return await readJsonResponse<{ accessCode?: unknown }>(response);
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    createStudy: builder.mutation<string, { study: components['schemas']['Study']; idempotencyKey: string }>({
      invalidatesTags: ['Study'],
      query: ({ study, idempotencyKey }) => ({
        body: study,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: '/study',
      }),
    }),
    updateStudySettings: builder.mutation<
      StudyWriteResult<unknown>,
      {
        studyId: string;
        settingType: string;
        setting: Record<string, unknown> | unknown[];
        // Settings revision from the last settings response (settings-revision.ts). Sent as
        // If-Match so a stale form gets 412 instead of overwriting another user's change.
        ifMatch?: string | undefined;
      }
    >({
      invalidatesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Study' }],
      query: ({ studyId, settingType, setting, ifMatch }) => ({
        body: setting,
        headers: ifMatch ? { 'If-Match': ifMatch } : undefined,
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}/settings/type/${settingType}`,
      }),
      transformErrorResponse: (error, _meta, { studyId }) => {
        if (isSettingsConflict(error)) forgetSettingsRevision(studyId);
        return error;
      },
      transformResponse: (body: unknown, meta, { studyId }) => {
        rememberSettingsRevision(studyId, meta?.response?.headers);
        return { data: body, settingsRevision: meta?.response?.headers.get('etag') ?? undefined };
      },
    }),
    setStudyLimits: builder.mutation<
      StudyWriteResult<unknown>,
      { studyId: string; limits: Record<string, unknown>; ifMatch?: string }
    >({
      invalidatesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Study' }],
      queryFn: async ({ studyId, limits, ifMatch }, api) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/api/web/limits/study/${encodeURIComponent(studyId)}`,
            {
              body: JSON.stringify(limits),
              headers: { 'Content-Type': 'application/json', ...(ifMatch ? { 'If-Match': ifMatch } : {}) },
              method: 'PUT',
            },
            api,
          );
          if (!response.ok) return httpError(response, await response.text());
          rememberSettingsRevision(studyId, response.headers);
          const data: unknown = await response.json().catch(() => null);
          return { data: { data, settingsRevision: response.headers.get('etag') ?? undefined } };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    createQuestionnaire: builder.mutation<
      string,
      { questionnaire: QuestionnaireDraft; studyId: string; idempotencyKey: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ questionnaire, studyId, idempotencyKey }) => ({
        body: questionnaire,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/survey/${encodeURIComponent(studyId)}/questionnaire`,
      }),
    }),
    deleteQuestionnaire: builder.mutation<unknown, { questionnaireId: string; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ questionnaireId, studyId }) => ({
        method: 'DELETE',
        url: `/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      }),
    }),
    deleteStudyParticipants: builder.mutation<string[], { participantIds: string[]; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [
        { id: studyId, type: 'Participants' },
        { id: studyId, type: STUDY_DELETIONS_TAG },
      ],
      query: ({ participantIds, studyId }) => ({
        body: participantIds,
        method: 'DELETE',
        url: `/study/${encodeURIComponent(studyId)}/participants`,
      }),
    }),
    listStudyApiKeys: builder.query<ApiKeyInfo[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ApiKeys' }],
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readAllRows<ApiKeyInfo[]>(baseQuery, `/study/${encodeURIComponent(studyId)}/api-keys`, 500),
    }),
    createStudyApiKey: builder.mutation<
      ApiKeyCreateResponse,
      { expiresInDays: number; name: string; scope: ApiKeyScope; studyId: string; idempotencyKey: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'ApiKeys' }],
      query: ({ studyId, idempotencyKey, ...body }) => ({
        body,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/api-keys`,
      }),
    }),
    revokeStudyApiKey: builder.mutation<unknown, { keyId: string; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'ApiKeys' }],
      query: ({ keyId, studyId }) => ({
        method: 'DELETE',
        url: `/study/${encodeURIComponent(studyId)}/api-keys/${encodeURIComponent(keyId)}`,
      }),
    }),
    // Whether the signed-in user may modify the study (WRITE on its ACL), from the server's access check.
    // The API key scopes the current user could hold on the study: a key never outranks its creator, so the
    // server caps each scope at the creator's own permissions (ApiKeyStudyAuthority.ceiling).
    getStudyApiKeyScopes: builder.query<ApiKeyScope[], string>({
      query: (studyId) => ({
        body: [{ aclKey: [studyId], permissions: ['READ', 'WRITE', 'OWNER'] }],
        method: 'POST',
        url: '/authorizations',
      }),
      transformResponse: (body: unknown) => {
        const held = (permission: string) =>
          Array.isArray(body) &&
          body.some(
            (entry) => isRecord(entry) && isRecord(entry.permissions) && entry.permissions[permission] === true,
          );
        return API_KEY_SCOPE_PERMISSIONS.filter(([, permissions]) => permissions.every(held)).map(([scope]) => scope);
      },
    }),
    getStudyExportAvailability: builder.query<StudyExportAvailability, string>({
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/export/availability`,
      providesTags: (_r, _e, studyId) => [{ type: 'Study', id: studyId }],
    }),
    getStudyDeletions: builder.query<DataDeletionOperation[], string>({
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readAllRows<DataDeletionOperation[]>(baseQuery, `/study/${encodeURIComponent(studyId)}/deletions`, 500),
      providesTags: (_r, _e, studyId) => [{ type: STUDY_DELETIONS_TAG, id: studyId }],
    }),
    getStudySettingLocks: builder.query<StudySettingType[], string>({
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/settings/locks`,
      providesTags: (_r, _e, studyId) => [{ type: 'Study', id: studyId }],
    }),
    eraseDeletion: builder.mutation<DataDeletionOperation, { studyId: string; operationId: string }>({
      query: ({ studyId, operationId }) => ({
        url: `/study/${encodeURIComponent(studyId)}/deletions/${encodeURIComponent(operationId)}/erase`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { studyId }) => [{ type: STUDY_DELETIONS_TAG, id: studyId }],
    }),
    getComplianceViolations: builder.query<ComplianceViolationsMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Compliance' }],
      queryFn: async (studyId, _api, _extra, baseQuery) => {
        const result = await readAllPages(baseQuery, `/compliance/study/${encodeURIComponent(studyId)}`, 500);
        if ('error' in result) return result;
        const merged = Object.create(null) as ComplianceViolationsMap;
        for (const page of result.data as ComplianceViolationsMap[]) {
          for (const [study, violations] of Object.entries(page)) {
            merged[study] = normalizeParticipantMap(merged[study] ?? {}, violations);
          }
        }
        return { data: merged };
      },
    }),
    getParticipantStats: builder.query<ParticipantStatsMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readParticipantPages<ParticipantStatsMap[string]>(
          baseQuery,
          `/study/${encodeURIComponent(studyId)}/participants/stats`,
        ),
    }),
    getIosUploadStatus: builder.query<IosUploadStatusMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readParticipantPages<IosUploadStatusMap[string]>(
          baseQuery,
          `/study/${encodeURIComponent(studyId)}/participants/ios/upload-status`,
        ),
    }),
    getAndroidDiagnostics: builder.query<
      AndroidDiagnosticsPage,
      {
        studyId: string;
        participantId?: string;
        randomDeviceId?: string;
        fromDay?: string;
        toDay?: string;
        moduleFamily?: string;
        issueCode?: string;
        cursor?: string;
        limit?: number;
      }
    >({
      providesTags: (_result, _error, { studyId, participantId }) => [
        { id: `${studyId}:${participantId ?? 'all'}`, type: 'ParticipantStats' },
      ],
      query: androidDiagnosticsUrl,
    }),
    getStudyDevices: builder.query<StudyDeviceInstancesMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Devices' }],
      queryFn: async (studyId, _api, _extra, baseQuery) => {
        const result = await readAllPages(baseQuery, `/study/${encodeURIComponent(studyId)}/devices`, 500);
        if ('error' in result) return result;
        const merged = normalizeParticipantMap<StudyDeviceInstancesMap[string]>();
        for (const page of result.data as StudyDeviceInstancesMap[]) {
          for (const [participant, devices] of Object.entries(page)) {
            merged[participant] = merged[participant] ? merged[participant].concat(devices) : devices;
          }
        }
        return { data: merged };
      },
    }),
    getPendingEnrollments: builder.query<string[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: PENDING_ENROLLMENTS_TAG }],
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readAllRows<string[]>(baseQuery, `/study/${encodeURIComponent(studyId)}/pending-enrollments`, 500),
    }),
    cancelPendingEnrollment: builder.mutation<void, { studyId: string; participantId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: PENDING_ENROLLMENTS_TAG }],
      query: ({ studyId, participantId }) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/pending-enrollment/cancel`,
      }),
    }),
    getStudyParticipants: builder.query<Participant[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Participants' }],
      queryFn: (studyId, _api, _extra, baseQuery) =>
        readAllRows(baseQuery, `/study/${encodeURIComponent(studyId)}/participants`, 500, normalizeParticipantList),
    }),
    getStudyQuestionnaires: builder.query<QuestionnaireRecord[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Questionnaires' }],
      query: (studyId) => `/survey/${encodeURIComponent(studyId)}/questionnaire`,
      transformResponse: normalizeQuestionnaireList,
    }),
    getStudySettingsAudit: builder.query<StudySettingsAuditEntry[], { studyId: string }>({
      providesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Audit' }],
      queryFn: ({ studyId }, _api, _extra, baseQuery) =>
        readAllRows<StudySettingsAuditEntry[]>(baseQuery, `/study/${encodeURIComponent(studyId)}/settings/audit`, 200),
    }),
    getStudyCollectionAcknowledgments: builder.query<CollectionAcknowledgmentEntry[], { studyId: string }>({
      providesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Audit' }],
      queryFn: ({ studyId }, _api, _extra, baseQuery) =>
        readAllRows<CollectionAcknowledgmentEntry[]>(
          baseQuery,
          `/study/${encodeURIComponent(studyId)}/settings/acknowledgments`,
          200,
        ),
    }),
    getStudySummary: builder.query<StudySummary, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}`,
      transformResponse: (body: StudySummary, meta) => ({
        ...body,
        settingsRevision: meta?.response?.headers.get('etag') ?? undefined,
      }),
    }),
    getAllStudies: builder.query<StudySummary[], void>({
      providesTags: (result) =>
        result
          ? [
              ...result
                .filter((s): s is StudySummary & { id: string } => typeof s.id === 'string')
                .map(({ id }) => ({ id, type: 'Study' as const })),
              { id: 'LIST', type: 'Study' as const },
            ]
          : [{ id: 'LIST', type: 'Study' as const }],
      queryFn: (_arg, _api, _extra, baseQuery) => readAllRows<StudySummary[]>(baseQuery, '/study', 500),
    }),
    getStudyTudSubmissionGroups: builder.query<
      StudySubmissionGroup[],
      { endDate: string; startDate: string; studyId: string; timeZone: string }
    >({
      query: ({ endDate, startDate, studyId, timeZone }) => {
        const params = new URLSearchParams({ endDate, startDate, timeZone });

        return `/time-use-diary/${encodeURIComponent(studyId)}/ids?${params.toString()}`;
      },
      transformResponse: normalizeStudySubmissionGroups,
    }),
    registerParticipant: builder.mutation<string, { participantId: string; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ participantId, studyId }) => ({
        body: {
          candidate: { id: '00000000-0000-0000-0000-000000000000' },
          participantId,
          participationStatus: PARTICIPATION_STATUS.ENROLLED,
        },
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/participant`,
      }),
    }),
    loadParticipantAnnotations: builder.mutation<
      { data: { participantNotes?: string; participantTags?: string[] }; revision: string },
      { participantId: string; studyId: string }
    >({
      queryFn: ({ participantId, studyId }, _api, _extra, baseQuery) =>
        readRevisionedResource(
          baseQuery,
          `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/annotations`,
          (data) => data as { participantNotes?: string; participantTags?: string[] },
        ),
    }),
    loadQuestionnaire: builder.mutation<
      { data: QuestionnaireRecord; revision: string },
      { questionnaireId: string; studyId: string }
    >({
      queryFn: ({ questionnaireId, studyId }, _api, _extra, baseQuery) =>
        readRevisionedResource(
          baseQuery,
          `/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
          normalizeQuestionnaireRecord,
        ),
    }),
    updateParticipantAnnotations: builder.mutation<
      unknown,
      {
        annotations: { participantNotes?: string; participantTags?: string[] };
        participantId: string;
        studyId: string;
        ifMatch: string;
      }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ annotations, participantId, studyId, ifMatch }) => ({
        body: annotations,
        headers: { 'If-Match': ifMatch },
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/annotations`,
      }),
    }),
    updateParticipationStatus: builder.mutation<
      unknown,
      { participantId: string; status: ParticipationStatus; statusRevision: number; studyId: string }
    >({
      // Also on 412: the refetch shows the status another window set.
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ participantId, status, statusRevision, studyId }) => ({
        headers: { 'If-Match': `"${statusRevision}"` },
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/status?participationStatus=${status}`,
      }),
    }),
    setParticipantProcessingBlock: builder.mutation<
      unknown,
      { studyId: string; participantId: string; blocked: boolean; reason?: string; statusRevision: number }
    >({
      // Participants refetch on 412 too, so the dialog's next try starts from the state another window set.
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ studyId, participantId, blocked, reason, statusRevision }) => ({
        headers: { 'If-Match': `"${statusRevision}"` },
        method: blocked ? 'POST' : 'DELETE',
        ...(blocked && { body: { reason } }),
        url: `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/processing-block`,
      }),
    }),
    updateQuestionnaire: builder.mutation<
      unknown,
      { questionnaire: QuestionnaireDraft; questionnaireId: string; studyId: string; ifMatch: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ questionnaire, questionnaireId, studyId, ifMatch }) => ({
        body: questionnaire,
        headers: { 'If-Match': ifMatch },
        method: 'PATCH',
        url: `/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      }),
    }),
    updateStudy: builder.mutation<
      StudyWriteResult<StudySummary | null>,
      { study: StudyUpdatePayload; studyId: string; ifMatch?: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
      ],
      query: ({ study, studyId, ifMatch }) => ({
        body: study,
        headers: ifMatch ? { 'If-Match': ifMatch } : undefined,
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}?retrieve=true`,
      }),
      transformResponse: (body: StudySummary | null, meta, { studyId }) => {
        rememberSettingsRevision(studyId, meta?.response?.headers);
        return { data: body, settingsRevision: meta?.response?.headers.get('etag') ?? undefined };
      },
    }),
    archiveStudy: builder.mutation<unknown, LifecycleTransition>({
      invalidatesTags: (_r, _e, { studyId }) => lifecycleTags(studyId),
      query: ({ studyId, ifMatch }) => ({
        headers: ifMatchHeader(ifMatch),
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/archive`,
      }),
    }),
    cancelScheduledDeletion: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => lifecycleTags(studyId),
      query: (studyId) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/schedule-delete`,
      }),
    }),
    unarchiveStudy: builder.mutation<unknown, LifecycleTransition>({
      invalidatesTags: (_r, _e, { studyId }) => lifecycleTags(studyId),
      query: ({ studyId, ifMatch }) => ({
        headers: ifMatchHeader(ifMatch),
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/unarchive`,
      }),
    }),
    scheduleStudyDeletion: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => lifecycleTags(studyId),
      query: (studyId) => ({
        method: 'DELETE',
        url: `/study/${encodeURIComponent(studyId)}/schedule-delete`,
      }),
    }),
    downloadParticipantData: builder.mutation<
      null,
      {
        dataType: string;
        participantIds: SyncExportSelection;
        studyId: string;
        startDate?: string;
        endDate?: string;
        timeZone: string;
        filename?: string;
      }
    >({
      queryFn: ({ dataType, participantIds, studyId, startDate, endDate, filename, timeZone }) => {
        return downloadResource(
          `/chronicle/api/web/study/${encodeURIComponent(studyId)}/participants/data?${participantDataQuery({ dataType, participantIds, startDate, endDate, timeZone })}`,
          filename,
        );
      },
    }),
    // Time Use Diary for a participant subset. Separate from downloadParticipantData
    // because TUD is served by TimeUseDiaryController, not StudyController: different
    // route, and dataType binds to TimeUseDiaryDownloadDataType (DayTime/NightTime/
    // Summarized), not ParticipantDataType.
    downloadParticipantTudData: builder.mutation<
      null,
      {
        dataType: TimeUseDiaryDataType;
        participantIds: SyncExportSelection;
        studyId: string;
        startDate?: string;
        endDate?: string;
        timeZone: string;
        filename?: string;
      }
    >({
      queryFn: ({ dataType, participantIds, studyId, startDate, endDate, filename, timeZone }) => {
        return downloadResource(
          `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/participants/data?${participantDataQuery({ dataType, participantIds, startDate, endDate, timeZone })}`,
          filename,
        );
      },
    }),
    // Whole-study Time Use Diary (every participant), the bulk counterpart of
    // downloadParticipantTudData; shared by the Time Use Diary and Bulk downloads tabs.
    downloadStudyTudData: builder.mutation<
      null,
      { dataType: TimeUseDiaryDataType; studyId: string; startDate: string; endDate: string; filename?: string }
    >({
      queryFn: ({ dataType, studyId, startDate, endDate, filename }) => {
        return downloadResource(
          `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/data?${new URLSearchParams({ dataType, endDate, startDate }).toString()}`,
          filename,
        );
      },
    }),
    downloadQuestionnaireResponses: builder.mutation<
      null,
      { questionnaireId: string; studyId: string; filename?: string }
    >({
      queryFn: ({ questionnaireId, studyId, filename }) => {
        return downloadResource(
          `/chronicle/v3/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}/data?type=csv`,
          filename,
        );
      },
    }),
    getStudyLifecycleStatus: builder.query<StudyLifecycleStatus, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Lifecycle' }],
      queryFn: async (studyId, api) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/api/web/study/${encodeURIComponent(studyId)}/lifecycle`,
            undefined,
            api,
          );
          if (!response.ok) return httpError(response, await response.text());
          let data: unknown;
          try {
            data = await response.json();
          } catch {
            return parsingError(response, 'The study lifecycle response was not valid JSON.');
          }
          const status = normalizeStudyLifecycleStatus(data);
          if (status === null) {
            return parsingError(response, 'The study lifecycle response contained an unrecognized status.');
          }
          return { data: status };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    getStudyLimits: builder.query<StudyLimits, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      queryFn: async (studyId, api) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/api/web/limits/study/${encodeURIComponent(studyId)}`,
            undefined,
            api,
          );
          if (!response.ok) return httpError(response, await response.text());
          return await readJsonResponse<StudyLimits>(response, {});
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    getStudySensorAvailability: builder.query<AndroidDeviceSensorAvailability[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Devices' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/android/sensors/availability`,
    }),
    getStudySettings: builder.query<StudySettings, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/settings`,
      transformResponse: (body: StudySettings, meta, studyId) => {
        rememberSettingsRevision(studyId, meta?.response?.headers);
        return body;
      },
    }),
    getStudyDataCollectionSetting: builder.query<DataCollectionSettingSummary, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/settings/type/DataCollection`,
      transformResponse: (body: DataCollectionSettingSummary, meta, studyId) => {
        rememberSettingsRevision(studyId, meta?.response?.headers);
        return body;
      },
    }),
    getAppUsageSurveyDays: builder.query<AppUsageSurveyDays, { studyId: string; participantId: string }>({
      extraOptions: { participantPublic: true },
      providesTags: (_result, _error, { studyId, participantId }) => [
        { id: `${studyId}/${participantId}`, type: 'AppUsageSurvey' },
      ],
      query: ({ studyId, participantId }) =>
        `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/app-usage/days`,
    }),
    getAppUsageDaySurvey: builder.query<AppUsageDaySurvey, { studyId: string; participantId: string; date: string }>({
      extraOptions: { participantPublic: true },
      providesTags: (_result, _error, { studyId, participantId }) => [
        { id: `${studyId}/${participantId}`, type: 'AppUsageSurvey' },
      ],
      query: ({ studyId, participantId, date }) =>
        `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/app-usage?${new URLSearchParams({ date }).toString()}`,
    }),
    submitAppUsageSurvey: builder.mutation<
      unknown,
      { studyId: string; participantId: string; date: string; answers: AppUsageAnswer[]; idempotencyKey?: string }
    >({
      extraOptions: { participantPublic: true },
      // A stored answer, or a day that changed under the page (409), refreshes the day and the calendar.
      invalidatesTags: (_result, error, { studyId, participantId }) =>
        !error || (error as { status?: unknown }).status === 409
          ? [{ id: `${studyId}/${participantId}`, type: 'AppUsageSurvey' }]
          : [],
      query: ({ studyId, participantId, date, answers, idempotencyKey }) => ({
        body: answers,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/app-usage?${new URLSearchParams({ date }).toString()}`,
      }),
    }),
    // Participant-facing app-usage-frequency fetch (DAILY vs HOURLY). The backend GET is
    // study-scoped and not ACL-gated, so the survey page can pick the daily/hourly variant.
    getAppUsageFrequency: builder.query<AppUsageFrequencyResponse, string>({
      extraOptions: { participantPublic: true },
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/survey/${encodeURIComponent(studyId)}/app-usage-frequency`,
    }),
    submitTimeUseDiary: builder.mutation<
      unknown,
      {
        studyId: string;
        participantId: string;
        data: ParticipantTimeUseDiaryResponse[];
        idempotencyKey?: string;
        logicalDate: string;
      }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, data, idempotencyKey, logicalDate }) => ({
        body: data,
        headers: participantSubmissionHeaders(idempotencyKey, logicalDate),
        method: 'POST',
        url: `/time-use-diary/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}`,
      }),
    }),
    // Participant-facing TUD settings fetch. The backend GET lives under the permitAll
    // `/time-use-diary/**` tree (study-scoped, RLS-enforced), so an enrolled participant can
    // read the study's configured diary variant from a deep link.
    getTimeUseDiarySettings: builder.query<TimeUseDiarySettingsResponse, string>({
      extraOptions: { participantPublic: true },
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/time-use-diary/${encodeURIComponent(studyId)}/settings`,
    }),
    // Participant-facing single-questionnaire fetch. The backend GET is study-scoped
    // and not ACL-gated, so an enrolled participant can render it from a deep link.
    getParticipantQuestionnaire: builder.query<QuestionnaireRecord, { studyId: string; questionnaireId: string }>({
      extraOptions: { participantPublic: true },
      providesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ studyId, questionnaireId }) =>
        `/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      transformResponse: normalizeQuestionnaireRecord,
    }),
    submitQuestionnaireResponses: builder.mutation<
      unknown,
      {
        studyId: string;
        participantId: string;
        questionnaireId: string;
        responses: ParticipantQuestionnaireResponse[];
        idempotencyKey?: string;
        logicalDate: string;
      }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, questionnaireId, responses, idempotencyKey, logicalDate }) => ({
        body: responses,
        headers: participantSubmissionHeaders(idempotencyKey, logicalDate),
        method: 'POST',
        url: `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      }),
    }),
  }),
  reducerPath: 'studyOperationsApi',
  tagTypes: [
    STUDY_DELETIONS_TAG,
    'Questionnaires',
    'Study',
    'Participants',
    PENDING_ENROLLMENTS_TAG,
    'ParticipantStats',
    'Devices',
    'Compliance',
    'Audit',
    'Stats',
    'Events',
    'Lifecycle',
    'Organizations',
    'ApiKeys',
    'AppUsageSurvey',
  ],
});

/** @public Hooks generated by RTK Query for the study API. */
export const {
  useGetStudyDeletionsQuery,
  useEraseDeletionMutation,
  useGetStudyExportAvailabilityQuery,
  useGetStudySettingLocksQuery,
  useGetPendingEnrollmentsQuery,
  useCancelPendingEnrollmentMutation,
  useIssueParticipantAccessCodeMutation,
  useLookupLiveEnrollmentCodeMutation,
  useArchiveStudyMutation,
  useCancelScheduledDeletionMutation,
  useUnarchiveStudyMutation,
  useScheduleStudyDeletionMutation,
  useCreateStudyMutation,
  useLoadParticipantAnnotationsMutation,
  useLoadQuestionnaireMutation,
  useSetStudyLimitsMutation,
  useUpdateStudySettingsMutation,
  useCreateQuestionnaireMutation,
  useCreateStudyApiKeyMutation,
  useGetStudyApiKeyScopesQuery,
  useListStudyApiKeysQuery,
  useRevokeStudyApiKeyMutation,
  useDeleteQuestionnaireMutation,
  useDeleteStudyParticipantsMutation,
  useDownloadParticipantDataMutation,
  useDownloadParticipantTudDataMutation,
  useDownloadStudyTudDataMutation,
  useDownloadQuestionnaireResponsesMutation,
  useGetAllStudiesQuery,
  useGetComplianceViolationsQuery,
  useGetAndroidDiagnosticsQuery,
  useGetIosUploadStatusQuery,
  useGetParticipantStatsQuery,
  useGetStudyDevicesQuery,
  useGetStudyLifecycleStatusQuery,
  useGetStudyLimitsQuery,
  useGetStudyParticipantsQuery,
  useGetStudyQuestionnairesQuery,
  useGetStudySensorAvailabilityQuery,
  useGetStudyDataCollectionSettingQuery,
  useGetStudySettingsAuditQuery,
  useGetStudyCollectionAcknowledgmentsQuery,
  useGetStudySettingsQuery,
  useGetStudySummaryQuery,
  useLazyGetStudySummaryQuery,
  useGetAppUsageSurveyDaysQuery,
  useGetAppUsageDaySurveyQuery,
  useGetAppUsageFrequencyQuery,
  useSubmitAppUsageSurveyMutation,
  useSubmitTimeUseDiaryMutation,
  useGetTimeUseDiarySettingsQuery,
  useGetParticipantQuestionnaireQuery,
  useSubmitQuestionnaireResponsesMutation,
  useLazyGetStudyTudSubmissionGroupsQuery,
  useRegisterParticipantMutation,
  useUpdateParticipantAnnotationsMutation,
  useUpdateParticipationStatusMutation,
  useSetParticipantProcessingBlockMutation,
  useUpdateQuestionnaireMutation,
  useUpdateStudyMutation,
} = studyOperationsApi;
