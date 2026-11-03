import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';

// The DOM test preload replaces fetch, so the real listener is read with node:http.
function getJson(url: string): Promise<{ body: unknown; status: number | undefined }> {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
      let text = '';
      response.on('data', (chunk) => {
        text += chunk;
      });
      response.on('end', () => resolve({ body: JSON.parse(text), status: response.statusCode }));
    }).on('error', reject);
  });
}

// Without CHRONICLE_BACKEND_URL the dev server must answer from synthetic fixtures and never reach a
// database: real data is opt-in through a backend, which applies the app role and RLS.
test('bun run dev without a backend serves synthetic data and opens no database session', async () => {
  const bin = mkdtempSync(join(import.meta.dir, '../node_modules/.cache-dev-local-'));
  const marker = join(bin, 'docker-called');
  writeFileSync(join(bin, 'docker'), `#!/bin/sh\ntouch '${marker}'\n`);
  chmodSync(join(bin, 'docker'), 0o755);
  const { CHRONICLE_BACKEND_URL: _unset, ...env } = process.env;
  const server = Bun.spawn(['bun', join(import.meta.dir, 'dev-local.ts')], {
    env: { ...env, HOST: '127.0.0.1', PATH: `${bin}:${env.PATH}`, PORT: '0' },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  try {
    const reader = server.stdout.getReader();
    let banner = '';
    while (!/http:\/\/127\.0\.0\.1:\d+/.test(banner)) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`[dev-local.test] server exited: ${await new Response(server.stderr).text()}`);
      banner += new TextDecoder().decode(value);
    }
    const origin = banner.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    const studyId = '00000000-0000-4000-8000-000000000001';
    for (const path of ['/chronicle/api/web/study', `/chronicle/api/web/study/${studyId}/participants`]) {
      expect(await getJson(`${origin}${path}`)).toEqual({ body: [], status: 200 });
    }
    expect(existsSync(marker)).toBe(false);
  } finally {
    server.kill();
    await server.exited;
    rmSync(bin, { force: true, recursive: true });
  }
}, 60_000);
