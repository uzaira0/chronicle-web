import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  HOSTED_PREPROCESSING_GUI_URL,
  isPreprocessingGuiAvailable,
  PREPROCESSING_GUI_PATH,
  preprocessingGuiUrl,
} from './preprocessing-gui';

it('W78 shipped technical inventory identifies both preprocessing providers and the browser boundary', () => {
  const inventory = readFileSync('../THIRD-PARTY.md', 'utf8').replace(/\s+/g, ' ');
  expect(inventory).toContain(HOSTED_PREPROCESSING_GUI_URL);
  expect(inventory).toContain(PREPROCESSING_GUI_PATH);
  expect(inventory).toContain('https://github.com/uzaira0/chronicle-android-raw-data-preprocessing-app');
  expect(inventory).toContain('GitHub Pages');
  expect(inventory).toContain('browser');
  expect(inventory).toContain('selected export files');
  expect(inventory).toContain('external application');
});

const DASHBOARD_SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Chronicle</title>
  </head>
  <body>
    <main id="app" />
  </body>
</html>`;

const REAL_PREPROCESSING_GUI_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Chronicle Preprocessing</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

function fakeFetch(response: { ok: boolean; text: string } | Error): typeof fetch {
  return (() => {
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    return Promise.resolve({
      ok: response.ok,
      text: () => Promise.resolve(response.text),
    } as Response);
  }) as unknown as typeof fetch;
}

describe('preprocessingGuiUrl', () => {
  it('builds a URL under PREPROCESSING_GUI_PATH carrying the studyId', () => {
    const url = preprocessingGuiUrl('study-123');
    expect(url.startsWith(PREPROCESSING_GUI_PATH)).toBe(true);
    expect(url).toContain('studyId=study-123');
  });

  it('includes studyTitle when provided', () => {
    const url = preprocessingGuiUrl('study-123', 'My Study');
    expect(url).toContain('studyTitle=My+Study');
  });

  it('omits studyTitle when not provided', () => {
    const url = preprocessingGuiUrl('study-123');
    expect(url).not.toContain('studyTitle');
  });
});

describe('isPreprocessingGuiAvailable', () => {
  it("returns false when the response is this dashboard's own SPA shell (no preprocessing route configured)", async () => {
    const available = await isPreprocessingGuiAvailable(fakeFetch({ ok: true, text: DASHBOARD_SHELL_HTML }));
    expect(available).toBe(false);
  });

  it('returns true when the response is a genuinely different app', async () => {
    const available = await isPreprocessingGuiAvailable(fakeFetch({ ok: true, text: REAL_PREPROCESSING_GUI_HTML }));
    expect(available).toBe(true);
  });

  it('returns false on a non-2xx response', async () => {
    const available = await isPreprocessingGuiAvailable(fakeFetch({ ok: false, text: 'not found' }));
    expect(available).toBe(false);
  });

  it('returns false when the fetch throws (network error, offline, CORS, etc.)', async () => {
    const available = await isPreprocessingGuiAvailable(fakeFetch(new Error('network error')));
    expect(available).toBe(false);
  });
});

it('preprocessing documentation discloses the hosted destination and keeps selected files browser-local', () => {
  const readme = readFileSync('README.md', 'utf8').replace(/\s+/g, ' ');
  expect(readme).toContain(HOSTED_PREPROCESSING_GUI_URL);
  expect(readme).toContain('GitHub Pages');
  expect(readme).toContain('network IP address and User-Agent');
  expect(readme).toContain('processed locally in the browser; they are not uploaded');
});
