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
//   - With no backend it answers the API with synthetic fixtures (a signed-in session and
//     empty lists). Real data is opt-in: set CHRONICLE_BACKEND_URL to proxy the supported
//     /chronicle/api/web and /chronicle/v3 API families to a backend, which applies its app
//     role and RLS.

import index from '../index.html';
import { isBackendApiPath, isLoopbackHost } from './backend-api-path';
import { fixtureResponse } from './dev-fixtures';
import { proxyToPreviewBackend } from './preview-backend-proxy';

const port = Number(process.env.PORT ?? 5173);
// Loopback only: with a backend this server strips `Secure` from every backend auth
// cookie. A non-loopback HOST would publish that on the LAN, so it is refused.
const host = process.env.HOST ?? '127.0.0.1';
if (!isLoopbackHost(host)) {
  process.stderr.write(
    `dev:local refuses HOST=${host}: it downgrades proxied auth cookies to plain HTTP, ` +
      `which is only safe on a loopback listener. Use HOST=127.0.0.1.\n`,
  );
  process.exit(1);
}
const backendUrl = process.env.CHRONICLE_BACKEND_URL?.replace(/\/$/, '');

const server = Bun.serve({
  development: { console: true, hmr: true },
  hostname: host,
  port,
  routes: {
    // SPA: every non-API route serves the HMR-bundled app.
    '/*': index,
    // API: proxy to a backend when configured; else the synthetic session and empty defaults.
    '/chronicle/*': (request: Request) => {
      const url = new URL(request.url);
      if (backendUrl && isBackendApiPath(url.pathname)) {
        return proxyToPreviewBackend(request, url, {
          baseUrl: backendUrl,
          internalWebSecret: process.env.CHRONICLE_INTERNAL_WEB_SECRET,
        });
      }
      return fixtureResponse(request.method, url.pathname);
    },
  },
});

process.stdout.write(
  `Local dev server on http://${host}:${server.port}  ` +
    `(${backendUrl ? `proxying API → ${backendUrl}` : 'synthetic data + synthetic auth'})\n`,
);
