import { expect, test } from 'bun:test';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

test('form download starts before a 2 GiB response body completes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'native-download-'));
  const bundle = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'download.ts')],
    target: 'browser',
    outdir: directory,
  });
  expect(bundle.success).toBe(true);
  const output = bundle.outputs[0];
  if (!output) throw new Error('Download module bundle was not emitted');
  let requested = false;
  const observed: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    observed.push(path);
    if (path === '/download.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      createReadStream(output.path).pipe(response);
    } else if (path === '/file') {
      requested = true;
      response.writeHead(200, {
        'Content-Disposition': 'attachment; filename=export.csv',
        'Content-Type': 'text/csv',
        'Content-Length': String(2 * 1024 ** 3),
      });
      response.flushHeaders();
      response.write(new Uint8Array(1024));
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<button>Download</button><script type="module">
        import { navigatePostDownload } from '/download.js';
        document.querySelector('button').onclick = () => navigatePostDownload('/file', 'csrf');
      </script>`);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Download fixture did not bind a TCP port');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://127.0.0.1:${address.port}`);
    page.on('pageerror', (error) => observed.push(error.message));
    const [started] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(requested).toBe(true);
    expect(started.suggestedFilename()).toBe('export.csv');
    const cdp = await page.context().newCDPSession(page);
    const heap = await cdp.send('Runtime.getHeapUsage');
    expect(heap.usedSize).toBeLessThan(200 * 1024 ** 2);
    await started.cancel();
  } catch (error) {
    throw new Error(`Native form download failed; observed: ${observed.join(', ')}`, { cause: error });
  } finally {
    await browser.close();
    server.closeAllConnections();
    await rm(directory, { recursive: true, force: true });
    if (server.listening)
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}, 30_000);
