import { createTranslator, getCurrentLanguage } from '@/i18n';

const MAX_USER_ERROR_MESSAGE_LENGTH = 1_000;
const HTML_RESPONSE_PATTERN = /(?:<!doctype\s+html|<\/?(?:html|head|body|script|style|iframe|main|div|form|h[1-6])\b)/i;

/**
 * Markers of a raw server diagnostic rather than a sentence written for a person.
 *
 * The compliance tab was printing an entire backend error document into the page —
 * the request path template, the correlation id, the exception class. None of that
 * helps a researcher, and a URI template plus a stack frame describes the server's
 * internals to whoever is standing at the screen. Anything matching here is logged
 * for the developer console and replaced by the caller's fallback sentence.
 */
const SERVER_DIAGNOSTIC_PATTERNS: readonly RegExp[] = [
  // A URI path template, e.g. /chronicle/api/web/study/{studyId}/compliance
  /\/\{[A-Za-z0-9_]+\}/,
  // Correlation ids and the surrounding Spring error-document fields.
  /\berror[_-]?id\b\s*[:=]/i,
  /"(?:timestamp|trace|exception|path|errorId)"\s*:/,
  // A Java/Kotlin stack frame.
  /\n\s*at\s+[\w$.]+\(/,
  /\b(?:java|kotlin|org\.springframework|com\.openlattice)\.[\w$.]+(?:Exception|Error)\b/,
];

function isSerializedDocument(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    // An unparseable brace-leading blob is no more presentable than a parseable one.
    return true;
  }
}

function isServerDiagnostic(message: string): boolean {
  return isSerializedDocument(message) || SERVER_DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(message));
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replaceAll('/app/src/', '[internal]/')
    .replaceAll('node_modules/', '[vendor]/')
    .replaceAll('webpack:///', '[bundle]:///');
}

function isDisplayableErrorMessage(message: string): boolean {
  const trimmed = message.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_USER_ERROR_MESSAGE_LENGTH &&
    !HTML_RESPONSE_PATTERN.test(trimmed) &&
    !isServerDiagnostic(trimmed)
  );
}

function extractFromData(data: unknown): string | null {
  if (typeof data === 'string' && data.length > 0) return data;
  if (data && typeof data === 'object' && 'message' in data) {
    const msg = (data as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.length > 0) return msg;
  }
  return null;
}

function extractRawMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;

  if ('data' in error) {
    const fromData = extractFromData((error as { data?: unknown }).data);
    if (fromData !== null) return fromData;
  }

  if ('error' in error && typeof (error as { error?: unknown }).error === 'string') {
    return (error as { error: string }).error;
  }

  if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return null;
}

// RTK Query's transport failures: the request never got an HTTP answer.
const NETWORK_FAILURE_STATUSES: ReadonlySet<unknown> = new Set(['FETCH_ERROR', 'TIMEOUT_ERROR']);
// Browser exception names whose message is the engine's own wording ("Failed to fetch",
// "signal timed out", "x is undefined"), never a sentence written for the person reading.
const ENGINE_ERROR_NAMES: ReadonlySet<unknown> = new Set(['TypeError', 'AbortError', 'TimeoutError']);

function isNetworkFailure(error: unknown): boolean {
  return !!error && typeof error === 'object' && NETWORK_FAILURE_STATUSES.has((error as { status?: unknown }).status);
}

function networkFailureKey(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'common.error_offline';
  return (error as { status?: unknown }).status === 'TIMEOUT_ERROR' ? 'common.error_timeout' : 'common.error_network';
}

function isEngineError(error: unknown): boolean {
  return !!error && typeof error === 'object' && ENGINE_ERROR_NAMES.has((error as { name?: unknown }).name);
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (isNetworkFailure(error)) {
    // Runs outside React; the caller's `fallback` is already translated.
    const { t } = createTranslator(getCurrentLanguage());
    return t(networkFailureKey(error), { message: fallback });
  }
  if (isEngineError(error)) {
    console.error('[chronicle] suppressed a browser exception message', error);
    return sanitizeErrorMessage(fallback);
  }

  const extracted = extractRawMessage(error);
  if (extracted !== null) {
    if (isDisplayableErrorMessage(extracted)) {
      return sanitizeErrorMessage(extracted);
    }
    // The detail still has to reach whoever is debugging; it just does not belong on
    // the page. The user sees the caller's fallback sentence instead. An empty payload
    // carries nothing worth logging.
    if (extracted.trim().length > 0) {
      console.error('[chronicle] suppressed an unpresentable error payload', error);
    }
  }

  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number | string }).status;
    if (typeof status === 'number' || typeof status === 'string') {
      // The caller's `fallback` already arrives translated; only this suffix is composed
      // here, and this runs outside React, so read the active language directly.
      const { t } = createTranslator(getCurrentLanguage());
      return sanitizeErrorMessage(t('common.error_with_status', { message: fallback, status }));
    }
  }

  return sanitizeErrorMessage(fallback);
}
