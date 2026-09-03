#!/usr/bin/env bun

import { existsSync } from 'node:fs';
import path from 'node:path';
import { isBackendApiPath } from './backend-api-path';
import { proxyToPreviewBackend } from './preview-backend-proxy';

const distDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const port = Number(process.env.PORT ?? 4173);

if (!existsSync(path.join(distDir, 'index.html'))) {
  throw new Error('Web preview build is missing. Run `bun run build` first.');
}

function resolveAssetPath(requestPath: string) {
  if (requestPath === '/' || requestPath === '') {
    return path.join(distDir, 'index.html');
  }

  const normalizedPath = requestPath.startsWith('/chronicle/') ? requestPath.slice('/chronicle'.length) : requestPath;

  return path.join(distDir, normalizedPath);
}

// If CHRONICLE_BACKEND_URL is set (e.g. http://localhost:40320), proxy the two
// supported backend API families to the real backend.
// Otherwise fall back to the hardcoded "awaiting-sso" mock responses, which
// keep the unauthenticated dev experience working without a backend.
const backendUrl = process.env.CHRONICLE_BACKEND_URL?.replace(/\/$/, '');

const server = Bun.serve({
  async fetch(request) {
    const url = new URL(request.url);

    // Deployments inject this script at the edge with their public HTTPS URL.
    // The production bundle intentionally does not contain that deployment-
    // specific file, so preview mode supplies a valid empty configuration
    // instead of falling through to index.html and executing HTML as JavaScript.
    if (url.pathname === '/chronicle/runtime-config.js') {
      return new Response('window.__CHRONICLE_RUNTIME_CONFIG__ = Object.freeze({});\n', {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/javascript; charset=utf-8',
        },
      });
    }

    // The browser app uses /chronicle/api/web while the scenario DSL uses
    // /chronicle/v3. Proxy both API families, but never /chronicle/* assets or
    // SPA routes.
    if (backendUrl && isBackendApiPath(url.pathname)) {
      return proxyToPreviewBackend(request, url, backendUrl);
    }

    if (url.pathname === '/chronicle/v3/auth/session') {
      return Response.json({
        authenticated: false,
        providerLabel: 'Institutional SSO',
        status: 'awaiting-sso',
        testingLoginEnabled: false,
        tokenSource: 'sso-session',
      });
    }

    if (url.pathname === '/chronicle/v3/auth/testing-login') {
      return Response.json(
        {
          authenticated: false,
          error: 'testing login is not enabled in preview mode',
          providerLabel: 'Chronicle testing session',
          status: 'awaiting-sso',
        },
        {
          status: 403,
        },
      );
    }

    if (url.pathname === '/chronicle/v3/auth/logout') {
      return new Response(null, { status: 204 });
    }

    const assetPath = resolveAssetPath(url.pathname);

    if (existsSync(assetPath) && Bun.file(assetPath).size > 0) {
      return new Response(Bun.file(assetPath));
    }

    return new Response(Bun.file(path.join(distDir, 'index.html')), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  },
  hostname: '127.0.0.1',
  port,
});

process.stdout.write(`Modern preview server listening on http://127.0.0.1:${server.port}\n`);
