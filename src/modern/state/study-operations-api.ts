import { createApi, type FetchBaseQueryError, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  type ConsentTrigger,
  PARTICIPATION_STATUSES,
  type ParticipantDataType,
  type ParticipationStatus,
  STUDY_LIFECYCLE_STATUSES,
  type StudyLifecycleStatus,
} from '@/generated/chronicle-contracts';
import { getBaseLanguageCode, getCurrentLanguage } from '@/i18n';
import { triggerBlobDownload } from '@/lib/download';
import { getParticipantCsrfToken } from '@/lib/participant-access';
import type { StudyParticipantPolicySetting } from '@/lib/participant-policy';
import { DOWNLOAD_TIMEOUT_MS, REQUEST_TIMEOUT_MS, timeoutSignal } from '@/lib/request-timeout';
import { forgetSettingsRevision, isSettingsConflict, rememberSettingsRevision } from './settings-revision';

// Canonical status/policy value sets come from the generated LinkML contract module —
// re-exported here so existing consumers keep importing them from this API surface.
export type { ParticipantDataType, ParticipationStatus, StudyLifecycleStatus };

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
export type ParticipantQuestionnaireResponse = {
  questionTitle: string;
  value: string[];
};

/**
 * The study's Time Use Diary variant settings, as returned by the participant-readable
 * `GET /time-use-diary/{studyId}/settings` (backend `TimeUseDiarySettingsResponse`). Lets the
 * web diary render the study's *configured* instrument (OSU/Sherbrooke question set, clock
 * format, locale) instead of relying on URL params.
 */
export type TimeUseDiarySettingsResponse = {
  clockFormat: number;
  clockFormatLocked: boolean;
  enableChangesForOhioStateUniversity: boolean;
  enableChangesForSherbrookeUniversity: boolean;
  language: string;
};

/**
 * One answered Time Use Diary field, mirroring the backend `TimeUseDiaryResponse`
 * (friendly-alias wire shape, pinned deserializable by chronicle-api's
 * `TimeUseDiaryResponseTest`). `response` is always an array of english canonical
 * values; the datetimes are present only on activity-section rows.
 */
export type ParticipantTimeUseDiaryResponse = {
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

/** The study's configured app-usage survey frequency (backend `AppUsageFrequency`). */
export type AppUsageFrequency = 'DAILY' | 'HOURLY';

/** Response of the participant-readable `GET /survey/{studyId}/app-usage-frequency`. */
export type AppUsageFrequencyResponse = {
  appUsageFrequency: AppUsageFrequency;
};

export type StudySummary = {
  contact?: string;
  createdAt?: string;
  description?: string;
  endedAt?: string;
  group?: string;
  id?: string;
  modules?: Record<string, unknown>;
  notificationsEnabled?: boolean;
  phoneNumber?: string;
  settings?: StudySettings;
  startedAt?: string;
  title?: string;
  updatedAt?: string;
  version?: string;
};

export type StudyUpdatePayload = {
  contact?: string;
  description?: string;
  group?: string;
  modules?: Record<string, unknown>;
  notificationsEnabled?: boolean;
  title?: string;
  version?: string;
};

export type StudySubmissionGroup = {
  date: string;
  ids: string[];
};

export type Candidate = {
  id: string;
} & Record<string, unknown>;

export type AndroidSensorSettingSummary = {
  dutyCycleActiveSeconds?: number;
  dutyCyclePeriodSeconds?: number;
  samplingRateHz?: number;
  sensors?: string[];
};

export type StudySettings = Record<string, unknown> & {
  AndroidSensor?: AndroidSensorSettingSummary;
  ParticipantPolicy?: StudyParticipantPolicySetting;
  Sensor?: unknown[];
};

export type CollectionModuleSettingSummary = {
  enabled?: boolean;
  healthConnectRecordTypes?: string[];
  // Whether the module is mandatory for participation (per-module consent design §3.1).
  // Meaningful only when enabled; optional (false) is the default.
  required?: boolean;
} & Record<string, unknown>;

// What produced a participant's per-module consent decision snapshot. The generated
// chronicle-models ConsentTrigger, under its OpenAPI CollectionConsentTrigger wire name.
export type CollectionConsentTrigger = ConsentTrigger;

// Resolved AndroidDataCollectionSetting from GET /settings/type/DataCollection.
// The backend always resolves a value (stored setting -> legacy bridge -> safe
// defaults), so `modules` reflects the study's current per-module enablement.
export type DataCollectionSettingSummary = {
  '@class'?: string;
  modules?: Record<string, CollectionModuleSettingSummary>;
  version?: number;
};

export type Participant = {
  candidate: Candidate;
  participantId: string;
  participantNotes?: string | null | undefined;
  participantTags: string[];
  participationStatus: ParticipationStatus;
};

export type ParticipantStats = {
  androidFirstDate?: string | null;
  androidLastDate?: string | null;
  androidLastPing?: string | null;
  androidUniqueDates: string[];
  iosFirstDate?: string | null;
  iosLastDate?: string | null;
  iosLastPing?: string | null;
  iosUniqueDates: string[];
  participantId: string;
  studyId: string;
  tudFirstDate?: string | null;
  tudLastDate?: string | null;
  tudUniqueDates: string[];
};

export type ParticipantStatsMap = Record<string, ParticipantStats>;

export type IosUploadStatus = {
  participantId: string;
  committedRows: number;
  lastCommittedAt?: string | null;
  lastObservationEndAt?: string | null;
  bufferedBatches: number;
  bufferedRecords: number;
  lastBufferedUploadAt?: string | null;
};

export type IosUploadStatusMap = Record<string, IosUploadStatus>;

export type DeviceEnrollmentEvent = {
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

export type StudyDeviceInstancesMap = Record<string, StudyDeviceInstance[]>;

export type ComplianceViolation = {
  description: string;
  participantId: string;
  reason: string;
};

export type ComplianceViolationsMap = Record<string, ComplianceViolation[]>;

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
  // The modules the participant DECLINED in this snapshot (per-module consent design §3.3).
  // Empty for legacy accept-only rows.
  declinedModules?: string[];
  id: string;
  participantId: string;
  recordedAt: string;
  sourceDeviceId: string;
  studyId: string;
  // What produced this decision (enrollment / toggle / settings-change / withdrawal).
  // Defaults ENROLLMENT for legacy rows.
  trigger?: CollectionConsentTrigger;
};

export type StudyRealtimeStats = {
  activeParticipants24h: number;
  dataSubmissions24h: number;
  lastDataReceived?: string | null;
  studyId: string;
  submissionsByType: Record<string, number>;
  timestamp: string;
  totalParticipants: number;
};

export type StudyEvent = {
  createdAt: string;
  eventId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  participantId?: string | null;
  studyId: string;
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
    throw new Error(`[normalizeParticipantList] Expected array, received ${typeof payload}`);
  }
  return payload
    .filter(
      (participant): participant is Record<string, unknown> =>
        isRecord(participant) && Boolean(participant.participantId),
    )
    .map((participant) => ({
      candidate: normalizeCandidate(participant.candidate),
      participantId: String(participant.participantId),
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
    }));
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|; )ol_csrf_token=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function fetchWithCsrf(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Accept-Language', getBaseLanguageCode(getCurrentLanguage()));
  const csrfToken = getCsrfToken();
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
  const participantCsrfToken = getParticipantCsrfToken();
  if (participantCsrfToken) {
    headers.set('X-Chronicle-Form-CSRF', participantCsrfToken);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
  }
  return fetch(url, { credentials: 'include', ...init, headers, signal: init?.signal ?? timeoutSignal() });
}

// A caller-held key makes a user retry of the same logical submission dedupe server-side;
// without one, prepareHeaders mints a fresh key per request (replay protection only).
function idempotencyHeaders(idempotencyKey: string | undefined): Record<string, string> | undefined {
  return idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
}

function httpError(response: Response, text: string) {
  return { error: { status: response.status, data: text } } as const;
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
    if (pageSize(result.data) < limit) break;
  }
  return { data: pages };
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
  return 'error' in result ? result : { data: normalize(concatPages(result.data)) };
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

export const studyOperationsApi = createApi({
  baseQuery: fetchBaseQuery({
    baseUrl: '/chronicle/api/web',
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
        headers.set('X-Chronicle-Form-CSRF', participantCsrfToken);
        if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', crypto.randomUUID());
      }
      return headers;
    },
  }),
  endpoints: (builder) => ({
    createStudy: builder.mutation<string, Record<string, unknown>>({
      invalidatesTags: ['Study'],
      query: (body) => ({
        body,
        method: 'POST',
        url: '/study',
      }),
    }),
    updateStudySettings: builder.mutation<
      unknown,
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
        return body;
      },
    }),
    setStudyLimits: builder.mutation<unknown, { studyId: string; limits: Record<string, unknown> }>({
      invalidatesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Study' }],
      queryFn: async ({ studyId, limits }) => {
        try {
          const response = await fetchWithCsrf(`/chronicle/api/web/limits/study/${encodeURIComponent(studyId)}`, {
            body: JSON.stringify(limits),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT',
          });
          if (!response.ok) return httpError(response, await response.text());
          const data: unknown = await response.json().catch(() => null);
          return { data };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    createQuestionnaire: builder.mutation<string, { questionnaire: QuestionnaireDraft; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ questionnaire, studyId }) => ({
        body: questionnaire,
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
    getDeletionOperation: builder.query<DataDeletionOperation, { operationId: string; studyId: string }>({
      query: ({ operationId, studyId }) =>
        `/study/${encodeURIComponent(studyId)}/deletions/${encodeURIComponent(operationId)}`,
    }),
    getComplianceViolations: builder.query<ComplianceViolationsMap, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Compliance' }],
      queryFn: async (studyId) => {
        try {
          const response = await fetchWithCsrf(`/chronicle/api/web/compliance/study/${encodeURIComponent(studyId)}`);
          if (!response.ok) return httpError(response, await response.text());
          return { data: (await response.json()) as ComplianceViolationsMap };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    getParticipantStats: builder.query<ParticipantStatsMap, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      queryFn: async (studyId, _api, _extra, baseQuery) => {
        const result = await readAllPages(baseQuery, `/study/${encodeURIComponent(studyId)}/participants/stats`, 500);
        return 'error' in result ? result : { data: Object.assign({}, ...result.data) as ParticipantStatsMap };
      },
    }),
    getIosUploadStatus: builder.query<IosUploadStatusMap, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'ParticipantStats' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/participants/ios/upload-status`,
    }),
    getStudyDevices: builder.query<StudyDeviceInstancesMap, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Devices' }],
      query: (studyId) => `/study/${encodeURIComponent(studyId)}/devices`,
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
      { endDate: string; startDate: string; studyId: string }
    >({
      query: ({ endDate, startDate, studyId }) => {
        const params = new URLSearchParams({
          endDate,
          startDate,
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
    updateParticipantAnnotations: builder.mutation<
      unknown,
      { annotations: { participantNotes?: string; participantTags?: string[] }; participantId: string; studyId: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Participants' }],
      query: ({ annotations, participantId, studyId }) => ({
        body: annotations,
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
      { questionnaire: QuestionnaireDraft; questionnaireId: string; studyId: string }
    >({
      invalidatesTags: (_result, _error, { studyId }) => [{ id: studyId, type: 'Questionnaires' }],
      query: ({ questionnaire, questionnaireId, studyId }) => ({
        body: questionnaire,
        method: 'PATCH',
        url: `/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}`,
      }),
    }),
    updateStudy: builder.mutation<StudySummary | null, { study: StudyUpdatePayload; studyId: string }>({
      invalidatesTags: (_result, _error, { studyId }) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
      ],
      query: ({ study, studyId }) => ({
        body: study,
        method: 'PATCH',
        url: `/study/${encodeURIComponent(studyId)}?retrieve=true`,
      }),
    }),
    archiveStudy: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
        { id: studyId, type: 'Lifecycle' },
      ],
      query: (studyId) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/archive`,
      }),
    }),
    cancelScheduledDeletion: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
        { id: studyId, type: 'Lifecycle' },
      ],
      query: (studyId) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/schedule-delete`,
      }),
    }),
    unarchiveStudy: builder.mutation<unknown, string>({
      invalidatesTags: (_r, _e, studyId) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
        { id: studyId, type: 'Lifecycle' },
      ],
      query: (studyId) => ({
        method: 'POST',
        url: `/study/${encodeURIComponent(studyId)}/unarchive`,
      }),
    }),
    scheduleStudyDeletion: builder.mutation<unknown, { deleteAfter: string; studyId: string }>({
      invalidatesTags: (_r, _e, { studyId }) => [
        { id: studyId, type: 'Study' },
        { id: 'LIST', type: 'Study' },
        { id: studyId, type: 'Lifecycle' },
      ],
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
      queryFn: async ({ dataType, participantIds, studyId, startDate, endDate, filename }) => {
        try {
          const params = new URLSearchParams({ dataType });
          for (const pid of participantIds) params.append('participantId', pid);
          if (startDate) params.set('startDate', startDate);
          if (endDate) params.set('endDate', endDate);
          const response = await fetchWithCsrf(
            `/chronicle/api/web/study/${encodeURIComponent(studyId)}/participants/data?${params.toString()}`,
            { signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS) },
          );
          if (!response.ok) return httpError(response, await response.text());
          triggerBlobDownload(await response.blob(), filename || `${studyId}-${dataType}.csv`);
          return { data: null };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    createStudyExport: builder.mutation<StudyExportJobInfo, { request: CreateStudyExportRequest; studyId: string }>({
      invalidatesTags: (_r, _e, { studyId }) => [{ id: studyId, type: 'Exports' }],
      query: ({ request, studyId }) => ({
        body: request,
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
      queryFn: async ({ exportId, filename, format, studyId }) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/api/web/study/${encodeURIComponent(studyId)}/export/${encodeURIComponent(exportId)}/download`,
            { signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS) },
          );
          if (!response.ok) return httpError(response, await response.text());
          const extension = format === 'EXCEL' ? 'xlsx' : format.toLowerCase();
          triggerBlobDownload(
            await response.blob(),
            filename || `chronicle-${studyId}-export-${exportId}.${extension}`,
          );
          return { data: null };
        } catch (err) {
          return networkError(err);
        }
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
      queryFn: async ({ dataType, participantIds, studyId, startDate, endDate, filename }) => {
        try {
          const params = new URLSearchParams({ dataType });
          for (const pid of participantIds) params.append('participantId', pid);
          if (startDate) params.set('startDate', startDate);
          if (endDate) params.set('endDate', endDate);
          const response = await fetchWithCsrf(
            `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/participants/data?${params.toString()}`,
            { signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS) },
          );
          if (!response.ok) return httpError(response, await response.text());
          triggerBlobDownload(await response.blob(), filename || `${studyId}-time-use-diary-${dataType}.csv`);
          return { data: null };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    // Whole-study Time Use Diary (every participant). The bulk counterpart of
    // downloadParticipantTudData; previously this lived as a bare fetch() inside
    // StudyTimeUseDiaryPage, which is why the Bulk Downloads tab had no TUD option.
    downloadStudyTudData: builder.mutation<
      null,
      { dataType: TimeUseDiaryDataType; studyId: string; startDate: string; endDate: string; filename?: string }
    >({
      queryFn: async ({ dataType, studyId, startDate, endDate, filename }) => {
        try {
          const params = new URLSearchParams({ dataType, endDate, startDate });
          const response = await fetchWithCsrf(
            `/chronicle/v3/time-use-diary/${encodeURIComponent(studyId)}/data?${params.toString()}`,
            { signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS) },
          );
          if (!response.ok) return httpError(response, await response.text());
          triggerBlobDownload(await response.blob(), filename || `tud-${studyId}-${dataType}.csv`);
          return { data: null };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    downloadQuestionnaireResponses: builder.mutation<
      null,
      { questionnaireId: string; studyId: string; filename?: string }
    >({
      queryFn: async ({ questionnaireId, studyId, filename }) => {
        try {
          const response = await fetchWithCsrf(
            `/chronicle/v3/survey/${encodeURIComponent(studyId)}/questionnaire/${encodeURIComponent(questionnaireId)}/data?type=csv`,
            { signal: timeoutSignal(DOWNLOAD_TIMEOUT_MS) },
          );
          if (!response.ok) return httpError(response, await response.text());
          triggerBlobDownload(await response.blob(), filename || `${studyId}-questionnaire-${questionnaireId}.csv`);
          return { data: null };
        } catch (err) {
          return networkError(err);
        }
      },
    }),
    getStudyLifecycleStatus: builder.query<StudyLifecycleStatus, string>({
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Lifecycle' }],
      queryFn: async (studyId) => {
        try {
          const response = await fetchWithCsrf(`/chronicle/api/web/study/${encodeURIComponent(studyId)}/lifecycle`);
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
      queryFn: async (studyId) => {
        try {
          const response = await fetchWithCsrf(`/chronicle/api/web/limits/study/${encodeURIComponent(studyId)}`);
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
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/survey/${encodeURIComponent(studyId)}/app-usage-frequency`,
    }),
    submitTimeUseDiary: builder.mutation<
      unknown,
      { studyId: string; participantId: string; data: ParticipantTimeUseDiaryResponse[]; idempotencyKey?: string }
    >({
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
      providesTags: (_result, _error, studyId) => [{ id: studyId, type: 'Study' }],
      query: (studyId) => `/time-use-diary/${encodeURIComponent(studyId)}/settings`,
    }),
    // Participant-facing single-questionnaire fetch. The backend GET is study-scoped
    // and not ACL-gated, so an enrolled participant can render it from a deep link.
    getParticipantQuestionnaire: builder.query<QuestionnaireRecord, { studyId: string; questionnaireId: string }>({
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
  ],
});

export const {
  useArchiveStudyMutation,
  useCancelScheduledDeletionMutation,
  useUnarchiveStudyMutation,
  useScheduleStudyDeletionMutation,
  useCreateStudyMutation,
  useSetStudyLimitsMutation,
  useUpdateStudySettingsMutation,
  useCreateQuestionnaireMutation,
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
