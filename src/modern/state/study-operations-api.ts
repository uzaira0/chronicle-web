import {
  type BaseQueryApi,
  type BaseQueryFn,
  createApi,
  type FetchArgs,
  type FetchBaseQueryError,
  fetchBaseQuery,
  retry,
} from '@reduxjs/toolkit/query/react';
import {
  type ConsentTrigger,
  PARTICIPATION_STATUSES,
  type ParticipantDataType,
  type ParticipationStatus,
  STUDY_LIFECYCLE_STATUSES,
  type StudyLifecycleStatus,
} from '@/generated/chronicle-contracts';
import { createTranslator, getBaseLanguageCode, getCurrentLanguage } from '@/i18n';
import { browserSessionDeadline } from '@/lib/bootstrap-auth';
import { triggerBlobDownload } from '@/lib/download';
import {
  getParticipantCsrfToken,
  PARTICIPANT_CSRF_HEADER,
  PARTICIPANT_PUBLIC_API_BASE,
  type ParticipantFormKind,
  participantAccessCodeIssueUrl,
} from '@/lib/participant-access';
import type { StudyParticipantPolicySetting } from '@/lib/participant-policy';
import { DOWNLOAD_TIMEOUT_MS, REQUEST_TIMEOUT_MS, timeoutSignal } from '@/lib/request-timeout';
import type { WithdrawalMode } from '@/lib/study-constants';
import type { components } from '@/types/chronicle-api.generated';
import { expireSession, SESSION_STATUS, updateIdleDeadline, waitForReauthentication } from './session-slice';
import { forgetSettingsRevision, isSettingsConflict, rememberSettingsRevision } from './settings-revision';

// Canonical status/policy value sets come from the generated LinkML contract module —
// re-exported here so existing consumers keep importing them from this API surface.
export type { ParticipantDataType, ParticipationStatus, StudyLifecycleStatus };

type StudyWriteResult<T> = { data: T; settingsRevision: string | undefined };
const ENROLLMENT_ACCESS_CODE_EXPIRY_MS = 29 * 24 * 60 * 60 * 1000;
const DELETION_STATUS_RETRIES = 2;

export type QuestionnaireQuestion = {
  choices: string[];
  title: string;
};

export type QuestionnaireRecord = {
  active: boolean;
  dateCreated?: string;
  description: string;
  id: string;
  questions: QuestionnaireQuestion[];
  recurrenceRule?: string | null;
  title: string;
};

export type QuestionnaireDraft = {
  active: boolean;
  description: string;
  questions: QuestionnaireQuestion[];
  title: string;
};

/**
 * One participant answer to a questionnaire question. The backend
 * (`QuestionnaireResponse`) keys responses by the question *title* (not an id)
 * and stores the answer as a set of strings — open-ended questions carry the
 * free-text as a single-element array; multiple-choice questions carry the
 * selected choices.
 */
type ParticipantQuestionnaireResponse = {
  questionTitle: string;
  value: string[];
};

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
type ParticipantTimeUseDiaryResponse = {
  code: string;
  question: string;
  response: string[];
  startDateTime?: string;
  endDateTime?: string;
};

/**
 * One app the participant used during the survey window, mirroring the backend
 * `AppUsage`. The participant answers *who* used each app by filling `users`
 * (the app-usage survey); all other fields are echoed back unchanged on submit.
 */
export type AppUsageEntry = {
  appLabel?: string | null;
  appPackageName: string;
  eventType: number;
  timestamp: string;
  timezone: string;
  uploadedAt?: string | null;
  users: string[];
};

/** Response of the participant-readable `GET /survey/{studyId}/app-usage-frequency`. */
type AppUsageFrequencyResponse = components['schemas']['AppUsageFrequencyResponse'];

// OpenAPI Study still omits the module/settings projection returned by the server.
export type StudySummary = components['schemas']['Study'] & {
  modules?: Record<string, unknown>;
  settings?: StudySettings;
};

type StudyUpdatePayload = components['schemas']['StudyUpdate'];

export type StudySubmissionGroup = {
  date: string;
  ids: string[];
};

type Candidate = {
  id: string;
} & Record<string, unknown>;

type AndroidSensorSettingSummary = components['schemas']['AndroidSensorSetting'];

type StudySettings = Record<string, unknown> & {
  AndroidSensor?: AndroidSensorSettingSummary;
  ParticipantPolicy?: StudyParticipantPolicySetting;
  Sensor?: unknown[];
  Withdrawal?: { mode: WithdrawalMode };
  TimeUseDiary?: { timeZone?: string } & Record<string, unknown>;
};

type CollectionModuleSettingSummary = Partial<components['schemas']['CollectionModuleSetting']> &
  Record<string, unknown>;

// What produced a participant's per-module consent decision snapshot. The generated
// chronicle-models ConsentTrigger, under its OpenAPI CollectionConsentTrigger wire name.
type CollectionConsentTrigger = ConsentTrigger;

// AndroidDataCollectionSetting from GET /settings/type/DataCollection.
// Stored settings remain sparse; omitted modules use the Android catalog defaults.
export type DataCollectionSettingSummary = Omit<components['schemas']['AndroidDataCollectionSetting'], 'modules'> & {
  modules?: Record<string, CollectionModuleSettingSummary>;
};

export type Participant = Omit<
  components['schemas']['Participant'],
  'candidate' | 'participantTags' | 'participantNotes' | 'participationStatus'
> & {
  candidate: Candidate;
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
  deviceId?: string;
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
    deviceId: queryValues.deviceId,
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

type DeviceEnrollmentEvent = {
  enrolledAt?: string;
  enrollmentId?: string;
};

export type StudyDeviceInstance = {
  deviceId?: string;
  deviceType?: string;
  enrollments?: DeviceEnrollmentEvent[];
  sourceDevice?: unknown;
  sourceDeviceId?: string | null;
  [key: string]: unknown;
};

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

export type ComplianceViolation = {
  description: string;
  reason: string;
};

export type ComplianceViolationsMap = Record<string, Record<string, ComplianceViolation[]>>;

export type StudySettingsAuditEntry = {
  afterValue?: unknown;
  beforeValue?: unknown;
  changeSummary?: string;
  changedAt: string;
  changedBy: string;
  id: string;
  settingKey: string;
  studyId: string;
};

// One append-only entry in a study's participant collection-acknowledgment trail
// (GET /settings/acknowledgments). `recordedAt` is the server-stamped authoritative
// time; `acknowledgedAt` is the advisory device-reported time.
export type CollectionAcknowledgmentEntry = {
  acknowledgedAt: string;
  acknowledgedModules: string[];
  appVersion?: string | null;
  // The modules the participant DECLINED in this decision delta (per-module consent design §3.3).
  // Empty for legacy accept-only rows.
  declinedModules?: string[];
  id: string;
  participantId: string;
  recordedAt: string;
  settingsVersion?: number | null;
  sourceDeviceId: string;
  studyId: string;
  unavailableModules?: string[];
  // What produced this decision (enrollment / toggle / settings-change / withdrawal).
  // Defaults ENROLLMENT for legacy rows.
  trigger?: CollectionConsentTrigger;
};

// Mirrors TimeUseDiaryDownloadDataType in chronicle-api. Not part of ParticipantDataType.
export const TIME_USE_DIARY_DATA_TYPES = ['DayTime', 'NightTime', 'Summarized'] as const;
export type TimeUseDiaryDataType = (typeof TIME_USE_DIARY_DATA_TYPES)[number];

export type StudyExportFormat = 'CSV' | 'JSON' | 'EXCEL';

export type StudyExportJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type StudyExportJobInfo = {
  completedAt?: string | null;
  createdAt: string;
  downloadToken?: string | null;
  errorMessage?: string | null;
  exportId: string;
  format: StudyExportFormat;
  rowCount: number;
  status: StudyExportJobStatus;
  studyId: string;
};

export type CreateStudyExportRequest = {
  dataTypes: ParticipantDataType[];
  endDate?: string;
  format: StudyExportFormat;
  participantIds?: string[];
  startDate?: string;
};

export type ApiKeyScope = 'READ_ONLY' | 'WRITE' | 'ADMIN';
const API_KEY_SCOPE_PERMISSIONS: [ApiKeyScope, string[]][] = [
  ['READ_ONLY', ['READ']],
  ['WRITE', ['READ', 'WRITE']],
  ['ADMIN', ['READ', 'WRITE', 'OWNER']],
];

/** Researcher API key metadata (backend `ApiKeyInfo`); the raw key is never listed. */
export type ApiKeyInfo = {
  createdAt: string;
  deviceId?: string | null;
  expiresAt: string;
  keyId: string;
  lastUsedAt?: string | null;
  name: string;
  participantId?: string | null;
  prefix: string;
  scope: ApiKeyScope;
  studyId: string;
  usageCount?: number;
};

/** Backend `ApiKeyCreateResponse`: `rawKey` is returned this once and never again. */
type ApiKeyCreateResponse = {
  info: ApiKeyInfo;
  keyId: string;
  rawKey: string;
};

export type DataDeletionOperation = {
  mode: string;
  operationId: string;
  participantId?: string | null;
  quarantineUntil?: string | null;
  status: string;
  studyId: string;
};

export type AndroidDeviceSensorAvailability = {
  availableSensors: string[];
  deviceId: string;
  displayRotation?: number | null;
  interactionPointerCaptureCapability?: 'PLATFORM_API_UNAVAILABLE' | 'REQUIRES_INPUT_INTERCEPTION' | null;
  participantId: string;
  reportedAt?: string | null;
  screenDensityDpi?: number | null;
  screenHeightPixels?: number | null;
  screenWidthPixels?: number | null;
  unavailableSensors: string[];
};

export type StudyLimits = {
  dataRetentionDuration?: { days: number; months: number; years: number };
  participantLimit?: number;
  studyDuration?: { days: number; months: number; years: number };
  studyDataExpires?: string;
};

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
      withdrawnAt: typeof participant.withdrawnAt === 'string' ? participant.withdrawnAt : null,
      participantNotes:
        typeof participant.participantNotes === 'string' || participant.participantNotes === null
          ? participant.participantNotes
          : undefined,
      participantTags: Array.isArray(participant.participantTags)
        ? participant.participantTags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      participationStatus: isParticipationStatus(participant.participationStatus)
        ? participant.participationStatus
        : 'UNKNOWN',
    };
  });
  if (unknownStatuses) {
    console.warn(`[normalizeParticipantList] ${unknownStatuses} row(s) had an unknown participation status`);
  }
  return participants;
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )ol_csrf_token=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
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
  const csrfToken = getCsrfToken();
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const participantCsrfToken = getParticipantCsrfToken();
  if (participantCsrfToken) {
    headers.set(PARTICIPANT_CSRF_HEADER, participantCsrfToken);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  }
  const request = {
    credentials: 'include',
    ...init,
    headers,
    signal: init?.signal ?? timeoutSignal(),
  } satisfies RequestInit;
  const response = await fetch(url, request);
  if (api) applyResponseIdleDeadline(response, api);
  if (api && (await logoutExpiredSession(response.status, api))) {
    const renewedCsrfToken = getCsrfToken();
    if (renewedCsrfToken) headers.set('X-CSRF-Token', renewedCsrfToken);
    else headers.delete('X-CSRF-Token');
    const retried = await fetch(url, {
      ...request,
      signal: AbortSignal.any([api.signal, init?.signal ?? timeoutSignal()]),
    });
    applyResponseIdleDeadline(retried, api);
    if (retried.status === 401) api.dispatch(expireSession());
    return retried;
  }
  return response;
}

export const SESSION_IDLE_DEADLINE_HEADER = 'X-Session-Idle-Expires-At';

function applyResponseIdleDeadline(response: Response | undefined, api: BaseQueryApi): void {
  const value = response?.headers.get(SESSION_IDLE_DEADLINE_HEADER);
  if (!value || !response) return;
  const deadline = browserSessionDeadline(Number(value), response.headers);
  if (deadline !== null) api.dispatch(updateIdleDeadline(deadline));
}

// A caller-held key makes a user retry of the same logical submission dedupe server-side;
// without one, prepareHeaders mints a fresh key per request (replay protection only).
function idempotencyHeaders(idempotencyKey: string | undefined): Record<string, string> | undefined {
  return idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
}

const EXPORT_DAY = /^\d{4}-\d{2}-\d{2}$/;

function exportDayBoundary(value: string, exclusiveEnd: boolean): Date {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const boundary = new Date(0);
  boundary.setFullYear(year, month - 1, day + (exclusiveEnd ? 1 : 0));
  boundary.setHours(0, 0, 0, 0);
  return boundary;
}

/**
 * Date inputs give `YYYY-MM-DD`; the export endpoints bind ISO date-times. Resolve each
 * local day boundary, including days when midnight is skipped by a clock change.
 */
export function toExportDateTime(value: string, exclusiveEnd = false, timeZone?: string): string {
  if (!EXPORT_DAY.test(value)) return value;
  if (timeZone) {
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
    return new Date(boundary === first && first !== second ? Math.max(first, second) : boundary).toISOString();
  }
  const date = exportDayBoundary(value, exclusiveEnd);
  const skippedMidnight = exclusiveEnd && (date.getHours() !== 0 || date.getMinutes() !== 0);
  // Keep the instant, expressing a skipped-midnight end with the offset just before the boundary.
  const offsetMinutes = -(skippedMidnight ? new Date(date.getTime() - 1) : date).getTimezoneOffset();
  const wallTime = new Date(date.getTime() + offsetMinutes * 60_000);
  const pad = (number: number) => String(number).padStart(2, '0');
  const offset = `${offsetMinutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  return `${wallTime.getUTCFullYear()}-${pad(wallTime.getUTCMonth() + 1)}-${pad(wallTime.getUTCDate())}T${pad(wallTime.getUTCHours())}:${pad(wallTime.getUTCMinutes())}:${pad(wallTime.getUTCSeconds())}${offset}`;
}

/** The synchronous server cap is 31 elapsed days between local day boundaries. */
export function exportRangeExceedsLimit(startDay: string, endDay: string): boolean {
  if (!EXPORT_DAY.test(startDay) || !EXPORT_DAY.test(endDay)) return false;
  const start = exportDayBoundary(startDay, false);
  const end = exportDayBoundary(endDay, true);
  return end.getTime() - start.getTime() > 31 * 86_400_000;
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
type PageResult = { data?: unknown; error?: FetchBaseQueryError };
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
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    const result = (await fetchPage(`${path}${path.includes('?') ? '&' : '?'}${params.toString()}`)) as PageResult;
    if (result.error) return { error: result.error };
    pages.push(result.data);
    if (pageSize(result.data) < limit) return { data: pages };
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

async function downloadResource(url: string, filename: string, api: BaseQueryApi) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new DOMException('Download headers timed out.', 'TimeoutError')),
      DOWNLOAD_TIMEOUT_MS,
    );
    const response = await fetchWithCsrf(
      url,
      { signal: AbortSignal.any([api.signal, controller.signal]) },
      api,
    ).finally(() => clearTimeout(timer));
    if (!response.ok) return httpError(response, await response.text());
    triggerBlobDownload(await response.blob(), filename);
    return { data: null };
  } catch (err) {
    return networkError(err);
  }
}

function participantDataQuery({
  dataType,
  participantIds,
  startDate,
  endDate,
}: {
  dataType: string;
  participantIds: string[];
  startDate?: string | undefined;
  endDate?: string | undefined;
}): string {
  const params = new URLSearchParams({ dataType });
  for (const pid of participantIds) params.append('participantId', pid);
  if (startDate) params.set('startDate', toExportDateTime(startDate));
  if (endDate) params.set('endDate', toExportDateTime(endDate, true));
  return params.toString();
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
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRF-Token', csrfToken);
    }
    const participantCsrfToken = getParticipantCsrfToken();
    if (participantCsrfToken) {
      headers.set(PARTICIPANT_CSRF_HEADER, participantCsrfToken);
      if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
    }
    return headers;
  },
} satisfies Parameters<typeof fetchBaseQuery>[0];
const researcherBaseQuery = fetchBaseQuery({ ...baseQueryOptions, baseUrl: '/chronicle/api/web' });
// Participant forms are reachable only under the public prefix: a self-host participant
// listener refuses /chronicle/api/web. Endpoints opt in with extraOptions.participantPublic.
const participantBaseQuery = fetchBaseQuery({ ...baseQueryOptions, baseUrl: PARTICIPANT_PUBLIC_API_BASE });
type StudyOperationsExtraOptions = { participantPublic?: boolean };

export const studyOperationsApi = createApi({
  baseQuery: async (args: string | FetchArgs, api: BaseQueryApi, extraOptions: StudyOperationsExtraOptions = {}) => {
    if (extraOptions.participantPublic) return participantBaseQuery(args, api, extraOptions);
    const result = await researcherBaseQuery(args, api, extraOptions);
    applyResponseIdleDeadline(result.meta?.response, api);
    if (await logoutExpiredSession(result.error?.status, api)) {
      const retried = await researcherBaseQuery(args, api, extraOptions);
      applyResponseIdleDeadline(retried.meta?.response, api);
      if (retried.error?.status === 401) api.dispatch(expireSession());
      return retried;
    }
    return result;
  },
  endpoints: (builder) => ({
    issueParticipantAccessCode: builder.mutation<
      { accessCode?: unknown },
      { studyId: string; participantId: string; formKind: ParticipantFormKind; logicalDate?: string }
    >({
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
          return { data: (await response.json()) as { accessCode?: unknown } };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    createStudy: builder.mutation<string, { study: Record<string, unknown>; idempotencyKey: string }>({
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
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ participantIds, studyId }) => ({
        body: participantIds,
        method: 'DELETE',
        url: `/study/${encodeURIComponent(studyId)}/participants`,
      }),
    }),
    listStudyApiKeys: builder.query<ApiKeyInfo[], string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ApiKeys' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/api-keys`,
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
    getDeletionOperation: builder.query<DataDeletionOperation, { operationId: string; studyId: string }>({
      queryFn: async ({ operationId, studyId }, api, _options, baseQuery) => {
        const statusQuery: BaseQueryFn<string, unknown, FetchBaseQueryError> = (url) => baseQuery(url);
        const result = await retry(statusQuery, {
          maxRetries: DELETION_STATUS_RETRIES,
        })(`/study/${encodeURIComponent(studyId)}/deletions/${encodeURIComponent(operationId)}`, api, {});
        return result.error ? { error: result.error } : { data: result.data as DataDeletionOperation };
      },
    }),
    getComplianceViolations: builder.query<ComplianceViolationsMap, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Compliance' }],
      queryFn: async (studyId, api) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/api/web/compliance/study/${encodeURIComponent(studyId)}`,
            undefined,
            api,
          );
          if (!response.ok) return httpError(response, await response.text());
          return { data: (await response.json()) as ComplianceViolationsMap };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    getParticipantStats: builder.query<ParticipantStatsMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      queryFn: async (studyId, _api, _extra, baseQuery) => {
        const result = await readAllPages(baseQuery, `/study/${encodeURIComponent(studyId)}/participants/stats`, 500);
        return 'error' in result
          ? result
          : { data: normalizeParticipantMap(...(result.data as ParticipantStatsMap[])) };
      },
    }),
    getIosUploadStatus: builder.query<IosUploadStatusMap, string>({
      ...PARTICIPANT_MAP_QUERY_OPTIONS,
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/participants/ios/upload-status`,
      transformResponse: (body: IosUploadStatusMap) => normalizeParticipantMap(body),
    }),
    getAndroidDiagnostics: builder.query<
      AndroidDiagnosticsPage,
      {
        studyId: string;
        participantId?: string;
        deviceId?: string;
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
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/devices`,
      transformResponse: (body: StudyDeviceInstancesMap) => normalizeParticipantMap(body),
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
      { endDate: string; startDate: string; studyId: string; timeZone?: string }
    >({
      query: ({ endDate, startDate, studyId, timeZone }) => {
        const params = new URLSearchParams({
          endDate,
          startDate,
          ...(timeZone ? { timeZone } : {}),
        });

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
          participationStatus: 'ENROLLED',
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
      { participantId: string; status: ParticipationStatus; studyId: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ participantId, status, studyId }) => ({
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/status?participationStatus=${status}`,
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
    archiveStudy: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => lifecycleTags(studyId),
      query: (studyId) => ({
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
    unarchiveStudy: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => lifecycleTags(studyId),
      query: (studyId) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/unarchive`,
      }),
    }),
    scheduleStudyDeletion: builder.mutation<unknown, { deleteAfter: string; studyId: string }>({
      invalidatesTags: (_r, _e, { studyId }) => lifecycleTags(studyId),
      query: ({ deleteAfter, studyId }) => ({
        method: 'DELETE',
        url: `/study/${encodeURIComponent(studyId)}/schedule-delete?deleteAfter=${encodeURIComponent(deleteAfter)}`,
      }),
    }),
    downloadParticipantData: builder.mutation<
      null,
      {
        dataType: string;
        participantIds: string[];
        studyId: string;
        startDate?: string;
        endDate?: string;
        filename?: string;
      }
    >({
      queryFn: ({ dataType, participantIds, studyId, startDate, endDate, filename }, api) => {
        return downloadResource(
          `/chronicle/api/web/study/${encodeURIComponent(studyId)}/participants/data?${participantDataQuery({ dataType, participantIds, startDate, endDate })}`,
          filename || `${studyId}-${dataType}.csv`,
          api,
        );
      },
    }),
    createStudyExport: builder.mutation<
      StudyExportJobInfo,
      { request: CreateStudyExportRequest; studyId: string; idempotencyKey: string }
    >({
      invalidatesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Exports' }],
      query: ({ request, studyId, idempotencyKey }) => ({
        body: request,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/export/async`,
      }),
    }),
    listStudyExports: builder.query<StudyExportJobInfo[], { studyId: string }>({
      providesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Exports' }],
      queryFn: ({ studyId }, _api, _extra, baseQuery) =>
        readAllRows<StudyExportJobInfo[]>(baseQuery, `/study/${encodeURIComponent(studyId)}/export`, 500),
    }),
    downloadStudyExport: builder.mutation<
      null,
      { exportId: string; filename?: string; format: StudyExportFormat; studyId: string }
    >({
      queryFn: ({ exportId, filename, format, studyId }, api) => {
        const extension = format === 'EXCEL' ? 'xlsx' : format.toLowerCase();
        return downloadResource(
          `/chronicle/api/web/study/${encodeURIComponent(studyId)}/export/${encodeURIComponent(exportId)}/download`,
          filename || `chronicle-${studyId}-export-${exportId}.${extension}`,
          api,
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
        participantIds: string[];
        studyId: string;
        startDate?: string;
        endDate?: string;
        filename?: string;
      }
    >({
      queryFn: ({ dataType, participantIds, studyId, startDate, endDate, filename }, api) => {
        return downloadResource(
          `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/participants/data?${participantDataQuery({ dataType, participantIds, startDate, endDate })}`,
          filename || `${studyId}-time-use-diary-${dataType}.csv`,
          api,
        );
      },
    }),
    // Whole-study Time Use Diary (every participant). The bulk counterpart of
    // downloadParticipantTudData; previously this lived as a bare fetch() inside
    // StudyTimeUseDiaryPage, which is why the Bulk Downloads tab had no TUD option.
    downloadStudyTudData: builder.mutation<
      null,
      { dataType: TimeUseDiaryDataType; studyId: string; startDate: string; endDate: string; filename?: string }
    >({
      queryFn: ({ dataType, studyId, startDate, endDate, filename }, api) => {
        return downloadResource(
          `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/data?${new URLSearchParams({ dataType, endDate, startDate }).toString()}`,
          filename || `tud-${studyId}-${dataType}.csv`,
          api,
        );
      },
    }),
    downloadQuestionnaireResponses: builder.mutation<
      null,
      { questionnaireId: string; studyId: string; filename?: string }
    >({
      queryFn: ({ questionnaireId, studyId, filename }, api) => {
        return downloadResource(
          `/chronicle/v3/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}/data?type=csv`,
          filename || `${studyId}-questionnaire-${questionnaireId}.csv`,
          api,
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
          const text = await response.text();
          const data = text ? (JSON.parse(text) as StudyLimits) : {};
          return { data };
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
    getAppUsageSurveyData: builder.query<
      AppUsageEntry[],
      { studyId: string; participantId: string; startDate: string; endDate: string }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, startDate, endDate }) => {
        const params = new URLSearchParams({ startDate, endDate });
        return `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/app-usage?${params.toString()}`;
      },
      transformResponse: (payload: unknown): AppUsageEntry[] =>
        Array.isArray(payload) ? (payload as AppUsageEntry[]) : [],
    }),
    submitAppUsageSurvey: builder.mutation<
      unknown,
      { studyId: string; participantId: string; data: AppUsageEntry[]; idempotencyKey?: string }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, data, idempotencyKey }) => ({
        body: data,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/app-usage`,
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
      { studyId: string; participantId: string; data: ParticipantTimeUseDiaryResponse[]; idempotencyKey?: string }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, data, idempotencyKey }) => ({
        body: data,
        headers: idempotencyHeaders(idempotencyKey),
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
      }
    >({
      extraOptions: { participantPublic: true },
      query: ({ studyId, participantId, questionnaireId, responses, idempotencyKey }) => ({
        body: responses,
        headers: idempotencyHeaders(idempotencyKey),
        method: 'POST',
        url: `/survey/${encodeURIComponent(studyId)}/participant/${encodeURIComponent(participantId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      }),
    }),
  }),
  reducerPath: 'studyOperationsApi',
  tagTypes: [
    'Questionnaires',
    'Study',
    'Participants',
    'ParticipantStats',
    'Devices',
    'Compliance',
    'Audit',
    'Stats',
    'Events',
    'Lifecycle',
    'Organizations',
    'Exports',
    'ApiKeys',
  ],
});

/** @public Hooks generated by RTK Query for the study API. */
export const {
  useIssueParticipantAccessCodeMutation,
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
  useLazyGetDeletionOperationQuery,
  useDownloadParticipantDataMutation,
  useCreateStudyExportMutation,
  useDownloadStudyExportMutation,
  useDownloadParticipantTudDataMutation,
  useDownloadStudyTudDataMutation,
  useDownloadQuestionnaireResponsesMutation,
  useListStudyExportsQuery,
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
  useGetAppUsageSurveyDataQuery,
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
  useUpdateQuestionnaireMutation,
  useUpdateStudyMutation,
} = studyOperationsApi;
