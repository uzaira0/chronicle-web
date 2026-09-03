import { describe, expect, it } from 'bun:test';

import { isPreprocessingGuiAvailable, PREPROCESSING_GUI_PATH, preprocessingGuiUrl } from './preprocessing-gui';

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
