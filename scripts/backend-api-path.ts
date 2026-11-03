const BACKEND_API_ROOTS = ['/chronicle/api/web', '/chronicle/v3', '/chronicle/v4'] as const;
export const INTERNAL_WEB_API_ROOT = '/chronicle/api/web';
export const DIRECT_API_ROOT = '/chronicle/v3';

export function isBackendApiPath(pathname: string): boolean {
  return BACKEND_API_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function isInternalWebApiPath(pathname: string): boolean {
  return pathname === INTERNAL_WEB_API_ROOT || pathname.startsWith(`${INTERNAL_WEB_API_ROOT}/`);
}

export function backendTargetPath(pathname: string): string {
  if (!isInternalWebApiPath(pathname)) {
    return pathname;
  }

  return `${DIRECT_API_ROOT}${pathname.slice(INTERNAL_WEB_API_ROOT.length)}`;
}

// The local dev server strips `Secure` from every backend auth cookie it proxies back.
// That is only defensible on a listener nothing off-box can reach, so the host is
// checked rather than trusted.
export function isLoopbackHost(host: string): boolean {
  const bare = host.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (bare === 'localhost' || bare === '::1' || bare === '::ffff:127.0.0.1') {
    return true;
  }
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare);
}

export function isSameOriginRequest(requestUrl: URL, originHeader: string | null): boolean {
  if (!originHeader) {
    return false;
  }

  try {
    return new URL(originHeader).origin === requestUrl.origin;
  } catch {
    return false;
  }
}
