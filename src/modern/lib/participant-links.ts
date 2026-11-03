import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';
import { timeoutSignal } from '@/lib/request-timeout';

/**
 * Generates enrollment and survey links for study participants.
 * Participant links always use the deployment-configured public server. The researcher
 * dashboard may be served from a private listener that phones cannot reach.
 */

function getBaseUrl() {
  return `${getDefaultEnrollmentServerUrl()}/chronicle`;
}

type EnrollmentLinkOptions = {
  accessCode: string;
  /** The deployment's private CA root (`loadInvitationServerCa`), or null on a public CA. */
  serverCa?: string | null;
};

type ChronicleRuntimeConfig = {
  allowPrivateServerUrl?: unknown;
  localCa?: unknown;
  serverUrl?: unknown;
};

// base64url DER of one certificate. A 4096-bit RSA root is about 1.9k characters.
export const SERVER_CA_PARAMETER_NAME = 'serverCa';
const SERVER_CA_PARAMETER_PATTERN = /^[A-Za-z0-9_-]{100,4096}$/;
const PEM_CERTIFICATE = /^\s*-----BEGIN CERTIFICATE-----([A-Za-z0-9+/=\s]+)-----END CERTIFICATE-----\s*$/;

type PublicServerNormalizationOptions = {
  allowPrivateHost?: boolean;
};

const PARTICIPANT_ACCESS_CODE_CHARACTER = /^[A-Za-z0-9_-]$/;

// IANA special-purpose ranges that cannot identify an ordinary globally reachable
// participant server. Keep this conservative: a Play enrollment link must work from an
// unrelated reviewer network, not merely parse as a syntactically valid HTTPS URL.
const NON_PUBLIC_IPV4_RANGES: ReadonlyArray<readonly [start: number, prefixLength: number]> = [
  [0x00000000, 8], // current network
  [0x0a000000, 8], // private
  [0x64400000, 10], // shared carrier space
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link local
  [0xac100000, 12], // private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // TEST-NET-1
  [0xc0586300, 24], // retired 6to4 relay anycast
  [0xc0a80000, 16], // private
  [0xc6120000, 15], // benchmarking
  [0xc6336400, 24], // TEST-NET-2
  [0xcb007100, 24], // TEST-NET-3
  [0xe0000000, 4], // multicast
  [0xf0000000, 4], // reserved and limited broadcast
];

function isNonPublicIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const numericAddress = octets.reduce((address, octet) => address * 256 + octet, 0);
  return NON_PUBLIC_IPV4_RANGES.some(([start, prefixLength]) => {
    const size = 2 ** (32 - prefixLength);
    return numericAddress >= start && numericAddress < start + size;
  });
}

function isClearlyNonPublicHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (isNonPublicIpv4(host)) return true;
  if (!host.includes(':')) return false;

  if (host === '::' || host === '::1' || host.startsWith('::ffff:')) return true;
  const firstHextet = Number.parseInt(host.split(':', 1)[0] ?? '', 16);
  return (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) || (firstHextet >= 0xfe80 && firstHextet <= 0xfebf);
}

export function getDefaultEnrollmentServerUrl(): string {
  const config = Reflect.get(window, '__CHRONICLE_RUNTIME_CONFIG__') as ChronicleRuntimeConfig | undefined;
  const normalized = normalizePublicServerUrl(config?.serverUrl, {
    allowPrivateHost: config?.allowPrivateServerUrl === true,
  });
  if (!normalized) {
    throw new Error(createTranslator(getCurrentLanguage()).t('participant_access.missing_server'));
  }
  return normalized;
}

export function normalizePublicServerUrl(
  value: unknown,
  { allowPrivateHost = false }: PublicServerNormalizationOptions = {},
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.port === '8081' ||
      (!allowPrivateHost && isClearlyNonPublicHost(parsed.hostname))
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isValidParticipantAccessCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 32 &&
    value.length <= 256 &&
    Array.from(value).every((character) => PARTICIPANT_ACCESS_CODE_CHARACTER.test(character))
  );
}

function accessCodeFragment(accessCode: string): string {
  if (!isValidParticipantAccessCode(accessCode)) {
    throw new Error(createTranslator(getCurrentLanguage()).t('participant_access.access_code_required'));
  }
  return new URLSearchParams({ accessCode }).toString();
}

/** Read one bounded DER field; callers decide the X.509 structure. */
function certificateField(der: string, start: number, tag: number) {
  let cursor = start;
  if (der.charCodeAt(cursor++) !== tag) throw new Error();
  let length = der.charCodeAt(cursor++);
  if (length & 0x80) {
    const count = length & 0x7f;
    if (![1, 2].includes(count) || der.charCodeAt(cursor) === 0) throw new Error();
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + der.charCodeAt(cursor++);
    if (length < 128) throw new Error();
  }
  const end = cursor + length;
  if (!(length > 0 && end <= der.length)) throw new Error();
  return { contentStart: cursor, end };
}

export function isValidServerCaParameter(value: unknown): value is string {
  if (typeof value !== 'string' || !SERVER_CA_PARAMETER_PATTERN.test(value)) return false;
  try {
    const der = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    if (btoa(der).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') !== value) return false;
    // Check the DER envelope and mandatory X.509 fields. Native apps validate the CA and trust.
    const certificate = certificateField(der, 0, 0x30);
    const tbs = certificateField(der, certificate.contentStart, 0x30);
    let cursor = tbs.contentStart;
    if (der.charCodeAt(cursor) === 0xa0) cursor = certificateField(der, cursor, 0xa0).end;
    for (const tag of [0x02, 0x30, 0x30, 0x30, 0x30, 0x30]) cursor = certificateField(der, cursor, tag).end;
    if (cursor > tbs.end) return false;
    const algorithm = certificateField(der, tbs.end, 0x30);
    const signature = certificateField(der, algorithm.end, 0x03);
    return signature.end === certificate.end && certificate.end === der.length;
  } catch {
    return false;
  }
}

function serverCaUnavailable(): Error {
  return new Error(createTranslator(getCurrentLanguage()).t('participant_access.server_ca_unavailable'));
}

/** The single certificate of a PEM file as the `serverCa` link parameter (base64url DER, no padding). */
export function serverCaParameterFromPem(pem: string): string {
  const body = PEM_CERTIFICATE.exec(pem)?.[1]?.replace(/\s/g, '') ?? '';
  const parameter = body.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (!isValidServerCaParameter(parameter)) throw serverCaUnavailable();
  return parameter;
}

/**
 * In the local HTTPS trial the deployment's certificate comes from its own private CA. Invitation
 * links then carry that root so the apps trust it for this server without a CA profile. Null when
 * the deployment uses a certificate phones already trust.
 */
export async function loadInvitationServerCa(): Promise<string | null> {
  const config = Reflect.get(window, '__CHRONICLE_RUNTIME_CONFIG__') as ChronicleRuntimeConfig | undefined;
  if (config?.localCa !== true) return null;
  try {
    // Same origin: the dashboard listener serves Caddy's current root at /local-ca.crt.
    const response = await fetch('/local-ca.crt', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: timeoutSignal(),
    });
    if (!response.ok) throw serverCaUnavailable();
    return serverCaParameterFromPem(await response.text());
  } catch {
    throw serverCaUnavailable();
  }
}

export function getHttpsEnrollmentLink(studyId: string, participantId: string, options: EnrollmentLinkOptions) {
  const params = new URLSearchParams({ studyId, participantId });
  if (options.serverCa) params.set(SERVER_CA_PARAMETER_NAME, options.serverCa);
  return `${getBaseUrl()}/enroll?${params.toString()}#${accessCodeFragment(options.accessCode)}`;
}

export function getTimeUseDiaryLink(
  studyId: string,
  participantId: string,
  period: 'yesterday' | 'today',
  activityDate: string,
  accessCode: string,
) {
  const params = new URLSearchParams({
    date: activityDate,
    day: period,
    participantId,
    studyId,
  });
  return `${getBaseUrl()}/time-use-diary?${params.toString()}#${accessCodeFragment(accessCode)}`;
}

/** The survey link names no day: the page opens the server's oldest open day. */
export function getAppUsageLink(studyId: string, participantId: string, accessCode: string) {
  const params = new URLSearchParams({ studyId, participantId });
  return `${getBaseUrl()}/survey?${params.toString()}#${accessCodeFragment(accessCode)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Prefer the modern clipboard API (requires secure context)
  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // Legacy fallback for insecure contexts (HTTP)
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}
