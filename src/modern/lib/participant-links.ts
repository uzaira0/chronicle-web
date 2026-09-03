import { getCurrentLanguage } from '@/i18n/language-context';
import { createTranslator } from '@/i18n/translator';

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
};

type ChronicleRuntimeConfig = {
  allowPrivateServerUrl?: unknown;
  serverUrl?: unknown;
};

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

export function getHttpsEnrollmentLink(studyId: string, participantId: string, options: EnrollmentLinkOptions) {
  const params = new URLSearchParams({ studyId, participantId });
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

export function getAppUsageLink(studyId: string, participantId: string, logicalDate: string, accessCode: string) {
  const params = new URLSearchParams({ date: logicalDate, studyId, participantId });
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
