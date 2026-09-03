const BACKEND_API_ROOTS = ['/chronicle/api/web', '/chronicle/v3'] as const;
const INTERNAL_WEB_API_ROOT = '/chronicle/api/web';
const DIRECT_API_ROOT = '/chronicle/v3';

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
