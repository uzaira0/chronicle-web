#!/usr/bin/env bun
//
// Local-only dev server for frontend work.
//
//   bun run dev:local              # live source + HMR, localhost-only, auth mocked
//   PORT=5173 bun run dev:local    # pick a port
//   CHRONICLE_BACKEND_URL=http://127.0.0.1:40320 bun run dev:local   # proxy API to a backend
//
// Why this exists instead of `bun --port 5173 index.html`:
//   - Bun's bare HTML dev server binds 0.0.0.0 (no host flag in 1.3.x). This host
//     also runs the public prod stack, so we bind 127.0.0.1 explicitly — the
//     server is NOT reachable off-box.
//   - It still gives live source + hot module reload (HTML import + development.hmr),
//     unlike `bun run preview`, which serves a built dist/.
//   - With no backend it mocks the 3 auth bootstrap endpoints so the app boots to
//     its unauthenticated SSO landing instead of erroring. Set CHRONICLE_BACKEND_URL
//     to proxy the supported /chronicle/api/web and /chronicle/v3 API families
//     to a real backend instead.

import index from '../index.html';
import { backendTargetPath, isBackendApiPath, isInternalWebApiPath, isSameOriginRequest } from './backend-api-path';
import { fixtureResponse } from './dev-fixtures';
import { realDataResponse } from './dev-realdata';

const port = Number(process.env.PORT ?? 5173);
// Default to loopback so the server is NOT reachable off-box. Set HOST=0.0.0.0 to
// listen on all interfaces (reachable on the LAN via the host's hostname) — only
// do that in mock mode; exposing a real-backend proxy on the LAN leaks auth/data.
const host = process.env.HOST ?? '127.0.0.1';
const backendUrl = process.env.CHRONICLE_BACKEND_URL?.replace(/\/$/, '');

// Proxy a supported Chronicle API request to a real backend. Kept in parity
// with serve-modern-preview.ts:
// strip accept-encoding (Bun's fetch auto-decodes gzip; forwarding the stale
// Content-Encoding header would make the browser double-decode), and rewrite the
// backend's Secure; Path=/chronicle cookies to plain-HTTP Path=/ so the CSRF cookie
// is readable from the frontend routes during local dev.
async function proxyToBackend(request: Request, url: URL): Promise<Response> {
  const internalWebRequest = isInternalWebApiPath(url.pathname);
  const target = `${backendUrl}${backendTargetPath(url.pathname)}${url.search}`;
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete('accept-encoding');
  upstreamHeaders.delete('x-chronicle-internal-web');
  if (internalWebRequest) {
    upstreamHeaders.set('x-chronicle-internal-web', 'true');
  }
  if (isSameOriginRequest(url, upstreamHeaders.get('origin'))) {
    upstreamHeaders.delete('origin');
  }
  upstreamHeaders.set('host', new URL(backendUrl as string).host);
  const init: RequestInit = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: 'manual',
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }
  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  const setCookies = upstream.headers.getSetCookie();
  if (setCookies.length > 0) {
    responseHeaders.delete('set-cookie');
    for (const cookie of setCookies) {
      responseHeaders.append(
        'set-cookie',
        cookie.replace(/;\s*Secure/gi, '').replace(/;\s*Path=\/chronicle/gi, '; Path=/'),
      );
    }
  }
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

const server = Bun.serve({
  development: { console: true, hmr: true },
  hostname: host,
  port,
  routes: {
    // SPA: every non-API route serves the HMR-bundled app.
    '/*': index,
    // API: proxy to a backend when configured; else serve REAL data read from the
    // prod DB (studies/participants/stats), falling back to the synthetic auth
    // session + a benign empty default for anything not backed by real data.
    '/chronicle/*': async (request: Request) => {
      const url = new URL(request.url);
      // Mirror Traefik's chronicle-web-strip middleware so dev matches prod routing:
      // the dashboard calls /chronicle/api/web/*, which the edge rewrites to /chronicle/v3/*.
      // Without this, every dashboard query 404s/empties locally even though it works deployed.
      const apiPath = url.pathname.replace(/^\/chronicle\/api\/web\/?/, '/chronicle/v3/');
      if (backendUrl && isBackendApiPath(apiPath)) {
        if (apiPath !== url.pathname) {
          url.pathname = apiPath;
        }
        return proxyToBackend(request, url);
      }
      const real = await realDataResponse(request.method, apiPath);
      if (real) {
        return real;
      }
      return fixtureResponse(request.method, url.pathname);
    },
  },
});

process.stdout.write(
  `Local dev server on http://${host}:${server.port}  ` +
    `(${backendUrl ? `proxying API → ${backendUrl}` : 'real data from prod DB (read-only) + synthetic auth'})\n`,
);
