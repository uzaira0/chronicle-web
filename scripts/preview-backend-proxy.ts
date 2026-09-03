import { backendTargetPath, isInternalWebApiPath, isSameOriginRequest } from './backend-api-path';

type PreviewBackendFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function proxyToPreviewBackend(
  request: Request,
  url: URL,
  backendBaseUrl: string,
  backendFetch: PreviewBackendFetch = fetch,
): Promise<Response> {
  const internalWebRequest = isInternalWebApiPath(url.pathname);
  const target = `${backendBaseUrl}${backendTargetPath(url.pathname)}${url.search}`;
  // Drop accept-encoding so the upstream returns plain text — Bun's fetch would
  // transparently decode gzip but we'd then forward Content-Encoding: gzip to
  // the browser, which would try to decode the already-decoded body and fail
  // with ERR_CONTENT_DECODING_FAILED.
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete('accept-encoding');
  upstreamHeaders.delete('x-chronicle-internal-web');
  if (internalWebRequest) {
    upstreamHeaders.set('x-chronicle-internal-web', 'true');
  }
  // A browser request to this reverse proxy is same-origin at the public
  // boundary. Do not reinterpret the preview server's origin as a cross-origin
  // request at the private upstream boundary. Preserve foreign or malformed
  // Origin values so the backend can continue to reject them.
  if (isSameOriginRequest(url, upstreamHeaders.get('origin'))) {
    upstreamHeaders.delete('origin');
  }
  upstreamHeaders.set('host', new URL(backendBaseUrl).host);
  const init: RequestInit = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await backendFetch(target, init);
  } catch {
    // A reverse proxy must turn an unreachable upstream into an HTTP response.
    // Letting the transport exception escape closes the browser request and
    // creates an unhandled fetch rejection in the SPA.
    return Response.json(
      { error: 'The Chronicle backend is unavailable.' },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  // Strip encoding/length headers that no longer match the (possibly decoded) body.
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  // Backend cookies are Secure (HTTPS-only) and Path=/chronicle. For dev preview:
  //   - We run over plain HTTP, so Secure must go.
  //   - Frontend pages live at /, /studies, /dashboard etc. (NOT /chronicle/*),
  //     so a Path=/chronicle cookie wouldn't be exposed via document.cookie and
  //     getCsrfToken() would return null. Rewriting Path=/ makes the CSRF cookie
  //     readable from any frontend route.
  const setCookies = upstream.headers.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders.delete('set-cookie');
    for (const cookie of setCookies) {
      const rewritten = cookie.replace(/;\s*Secure/gi, '').replace(/;\s*Path=\/chronicle/gi, '; Path=/');
      responseHeaders.append('set-cookie', rewritten);
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
