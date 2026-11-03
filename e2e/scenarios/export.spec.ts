import { readFile } from 'node:fs/promises';
import http from 'node:http';
import type { BrowserContext, Page } from '@playwright/test';
import { COLLECTION_MODULES, STUDY_SETTING_CLASSES } from '../../src/modern/lib/study-constants';
import { DIRECT_BACKEND_URL, HEADER_CSRF_TOKEN } from '../dsl/constants.js';
import { currentCsrfToken } from '../dsl/di/api-client.js';
import type { StudySpec, UsageEventSpec } from '../dsl/di/test-data-provider.js';
import { expect, chronicleTest as test } from '../fixtures/chronicle-test.js';
import { PILOT_MODULES } from '../fixtures/study-form.js';

type CsvRow = Record<string, string>;

/** The exported CSV as rows keyed by header; every value in these fixtures is comma- and quote-free. */
function parseCsv(text: string): CsvRow[] {
  const unquote = (value: string) => value.replace(/^"(.*)"$/, '$1');
  const [header = '', ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(',').map(unquote);
  return lines.map((line) =>
    Object.fromEntries(line.split(',').map((value, index) => [columns[index] ?? '', unquote(value)])),
  );
}

/** Presses the dialog's Download and returns the native form POST's fields with the parsed file. */
async function downloadFromDialog(
  page: Page,
  context: BrowserContext,
): Promise<{ bytes: number; form: URLSearchParams; rows: CsvRow[] }> {
  const [request, file] = await Promise.all([
    context.waitForEvent(
      'request',
      (candidate) => candidate.method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/participants/data'),
    ),
    page.waitForEvent('download'),
    page.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click(),
  ]);
  expect(await file.failure()).toBeNull();
  const path = await file.path();
  if (!path) throw new Error('Native download did not produce a file');
  const text = await readFile(path, 'utf8');
  return { bytes: Buffer.byteLength(text), form: new URLSearchParams(request.postData() ?? ''), rows: parseCsv(text) };
}

function usageEvent(clientEventId: string, timestamp: string, timezone = 'America/Santiago'): UsageEventSpec {
  return {
    appPackageName: 'com.e2e.sentinel',
    applicationLabel: 'Sentinel',
    clientEventId,
    interactionType: 'Move to Foreground',
    timestamp,
    timezone,
    user: 'e2e-test-user',
  };
}

/** Exactly the pilot modules, with the study days in America/Santiago. */
function pilotStudy(spec: StudySpec): StudySpec {
  return {
    ...spec,
    settings: {
      ...spec.settings,
      DataCollection: {
        '@class': STUDY_SETTING_CLASSES.DataCollection,
        modules: Object.fromEntries(COLLECTION_MODULES.map(({ value }) => [value, { enabled: PILOT_MODULES.has(value) }])),
      },
      TimeUseDiary: { '@class': STUDY_SETTING_CLASSES.TimeUseDiary, timeZone: 'America/Santiago' },
    },
  };
}

test.describe('Exports', () => {
  test('Download data modal returns a 200 CSV with every uploaded row', async ({ scenario, providers, context }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('NativeCSV'), async (study) => {
          const participant = providers.data.participant();
          const events = providers.data.usageEvents(10);
          await study.participant(participant, async (part) => {
            await part.device(providers.data.androidDevice(), async (dev) => {
              await dev.upload(events, async (data) => {
                await data.flush();
              });
            });
          });
          await study.asPersona('expert-researcher', async ({ page }) => {
            await page.goto(`/studies/${study.id}/participants`);
            const row = page.getByRole('row').filter({ hasText: participant.participantId });
            await row.getByRole('button', { name: 'More actions', exact: true }).click();
            await page.getByRole('menuitem', { name: 'Download data', exact: true }).click();
            const dialog = page.getByRole('dialog');
            await dialog.getByRole('button', { name: 'Usage Events', exact: true }).click();
            await expect(dialog.getByLabel('Start date', { exact: true })).toHaveValue('');
            await expect(dialog.getByLabel('End date', { exact: true })).toHaveValue('');
            const [, file] = await Promise.all([
              context
                .waitForEvent(
                  'response',
                  (response) =>
                    response.request().method() === 'POST' &&
                    new URL(response.url()).pathname.endsWith('/participants/data'),
                )
                .then(async (response) => {
                  expect(response.status(), `Native POST Origin: ${response.request().headers().origin}`).toBe(200);
                  expect(await response.request().headerValue('origin')).toBe(new URL(page.url()).origin);
                }),
              page.waitForEvent('download'),
              dialog.getByRole('button', { name: 'Download', exact: true }).click(),
            ]);
            expect(await file.failure()).toBeNull();
            const path = await file.path();
            if (!path) throw new Error('Native download did not produce a file');
            const csv = await readFile(path, 'utf8');
            expect(csv.trim().split('\n')).toHaveLength(events.length + 1);
          });
        });
      });
    });
  });

  // A valid export of the wrong subset would silently omit records, so the file must
  // hold exactly the participants the operator left selected after search, sort and clearing.
  test('the toolbar download holds exactly the selected participants after search and sort', async ({
    scenario,
    providers,
    context,
  }) => {
    test.setTimeout(240_000);
    const run = crypto.randomUUID().slice(0, 6);
    const ids = Array.from({ length: 25 }, (_, index) => `b${run}-${String(index).padStart(2, '0')}`);
    const sentinels = new Map(ids.map((id) => [id, [crypto.randomUUID(), crypto.randomUUID()]]));
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('BulkSelect'), async (study) => {
          for (const id of ids) {
            await study.participant({ participantId: id }, (part) =>
              part.device(undefined, (dev) =>
                dev.upload(
                  (sentinels.get(id) ?? []).map((eventId, index) =>
                    usageEvent(eventId, new Date(Date.now() - (index + 1) * 60_000).toISOString()),
                  ),
                  (data) => {
                    expect(data.rowsWritten).toBe(2);
                    return Promise.resolve();
                  },
                ),
              ),
            );
          }
          await providers.flusherFor(study.client).flush();
          await study.asPersona('expert-researcher', async ({ page }) => {
            await page.goto(`/studies/${study.id}/participants`);
            const box = (id: string) => page.getByRole('checkbox', { name: `Select participant ${id}`, exact: true });
            await expect(box(ids[24] ?? '')).toBeVisible();
            await page.getByLabel('Select all participants shown').check();
            const dropped = [ids[3] ?? '', ids[17] ?? ''];
            for (const id of dropped) await box(id).uncheck();
            const search = page.getByRole('searchbox', { name: 'Search participants' });
            await search.fill(`b${run}-1`);
            await expect(box(ids[5] ?? '')).toBeHidden();
            await page.getByRole('button', { name: 'Collection activity' }).click();
            await search.fill('');
            await expect(box(ids[5] ?? '')).toBeVisible();

            const selected = ids.filter((id) => !dropped.includes(id));
            await page.getByRole('button', { name: `Download Data (${selected.length})` }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Usage Events', exact: true }).click();
            const { form, rows } = await downloadFromDialog(page, context);
            expect(form.getAll('participantId').sort()).toEqual(selected);
            expect([...new Set(rows.map((row) => row.participant_id))].sort()).toEqual(selected);
            expect(rows.map((row) => row.client_event_id).sort()).toEqual(
              selected.flatMap((id) => sentinels.get(id) ?? []).sort(),
            );
          });
        });
      });
    });
  });

  test.describe('in the study time zone from a UTC browser', () => {
    test.use({ timezoneId: 'UTC' });

    // Instants placed by hand from America/Santiago's 2026 rules: 2026-04-04 lasts 25 hours (midnight -03:00 to the next
    // midnight -04:00, 23:xx repeated) and 2026-09-06 lasts 23 hours (starts 01:00 -03:00, midnight skipped).
    const rows = {
      aprBefore: '2026-04-04T02:59:59Z',
      aprStart: '2026-04-04T03:00:00Z',
      aprRepeatFirst: '2026-04-05T02:30:00Z',
      aprRepeatSecond: '2026-04-05T03:30:00Z',
      aprLast: '2026-04-05T03:59:59Z',
      aprNext: '2026-04-05T04:00:00Z',
      sepBefore: '2026-09-06T03:59:59Z',
      sepStart: '2026-09-06T04:00:00Z',
      sepLast: '2026-09-07T02:59:59Z',
      sepNext: '2026-09-07T03:00:00Z',
    } as const;
    type RowName = keyof typeof rows;
    const diagnosticDays = ['2026-04-03', '2026-04-04', '2026-04-05', '2026-09-05', '2026-09-06', '2026-09-07'];

    // Usage events and day-granular diagnostics: the dates picked in the modal reach
    // the native export as the study's day boundaries, so rows just outside a DST day are neither lost nor added.
    test('chosen dates bound usage events and diagnostics by Santiago days', async ({
      scenario,
      providers,
      context,
    }) => {
      test.setTimeout(180_000);
      const eventIds = Object.fromEntries(Object.keys(rows).map((name) => [name, crypto.randomUUID()])) as Record<
        RowName,
        string
      >;
      const diagnosticIds = Object.fromEntries(diagnosticDays.map((day) => [day, crypto.randomUUID()]));
      const participant = providers.data.participant();
      await scenario(async (s) => {
        await s.asUser('test_admin', async (auth) => {
          await auth.study(pilotStudy(providers.data.study('SantiagoBounds')), async (study) => {
            await study.participant(participant, (part) =>
              part.device(undefined, async (dev) => {
                const stored = await dev.uploadDiagnostics(
                  diagnosticDays.map((day) => ({
                    count: 1,
                    day,
                    firstOccurredAt: `${day}T12:00:00-03:00`,
                    id: diagnosticIds[day],
                    issueCode: 'TIMEOUT',
                    lastOccurredAt: `${day}T12:00:00-03:00`,
                    moduleFamily: 'USAGE_LIFECYCLE',
                  })),
                );
                expect(stored.sort()).toEqual(Object.values(diagnosticIds).sort());
                await dev.upload(
                  (Object.keys(rows) as RowName[]).map((name) => usageEvent(eventIds[name], rows[name])),
                  async (data) => {
                    expect(data.rowsWritten).toBe(Object.keys(rows).length);
                    await data.flush();
                  },
                );
              }),
            );
            await study.asPersona('expert-researcher', async ({ page }) => {
              await page.goto(`/studies/${study.id}/participants`);
              const download = async (type: string, start: string, end: string) => {
                const row = page.getByRole('row').filter({ hasText: participant.participantId });
                await row.getByRole('button', { name: 'More actions', exact: true }).click();
                await page.getByRole('menuitem', { name: 'Download data', exact: true }).click();
                const dialog = page.getByRole('dialog');
                await expect(dialog).toContainText('Dates are days in the study time zone, America/Santiago.');
                await dialog.getByRole('button', { name: type, exact: true }).click();
                await dialog.getByLabel('Start date', { exact: true }).fill(start);
                await dialog.getByLabel('End date', { exact: true }).fill(end);
                const result = await downloadFromDialog(page, context);
                await expect(dialog).toBeHidden();
                return { start: result.form.get('startDate'), end: result.form.get('endDate'), rows: result.rows };
              };
              const usage = async (start: string, end: string) => {
                const result = await download('Usage Events', start, end);
                return { ...result, rows: result.rows.map((row) => row.client_event_id).sort() };
              };
              const named = (...names: RowName[]) => names.map((name) => eventIds[name]).sort();

              expect(await usage('2026-04-04', '2026-04-04')).toEqual({
                start: '2026-04-04T00:00:00.000-03:00',
                end: '2026-04-05T00:00:00.000-04:00',
                rows: named('aprStart', 'aprRepeatFirst', 'aprRepeatSecond', 'aprLast'),
              });
              expect(await usage('2026-09-06', '2026-09-06')).toEqual({
                start: '2026-09-06T01:00:00.000-03:00',
                end: '2026-09-07T00:00:00.000-03:00',
                rows: named('sepStart', 'sepLast'),
              });
              expect(await usage('2026-09-06', '')).toEqual({
                start: '2026-09-06T01:00:00.000-03:00',
                end: null,
                rows: named('sepStart', 'sepLast', 'sepNext'),
              });
              expect(await usage('', '2026-04-04')).toEqual({
                start: null,
                end: '2026-04-05T00:00:00.000-04:00',
                rows: named('aprBefore', 'aprStart', 'aprRepeatFirst', 'aprRepeatSecond', 'aprLast'),
              });

              const diagnostics = async (start: string, end: string) => {
                const csv = await download('Upload Diagnostics', start, end);
                // The same bounds as JSON: the API serves both formats from one request.
                const query = new URLSearchParams({ dataType: 'UploadDiagnostics', responseType: 'json' });
                query.append('participantId', participant.participantId);
                if (csv.start) query.set('startDate', csv.start);
                if (csv.end) query.set('endDate', csv.end);
                const response = await page.request.get(`/chronicle/v3/study/${study.id}/participants/data?${query}`, {
                  headers: { [HEADER_CSRF_TOKEN]: await currentCsrfToken(context) },
                });
                expect(response.status()).toBe(200);
                const json = (await response.json()) as { event_id: string }[];
                const csvIds = csv.rows.map((row) => row.event_id).sort();
                expect(json.map((row) => row.event_id).sort()).toEqual(csvIds);
                return csvIds;
              };
              const days = (...names: string[]) => names.map((day) => diagnosticIds[day]).sort();
              expect(await diagnostics('2026-04-04', '2026-04-04')).toEqual(days('2026-04-04'));
              expect(await diagnostics('2026-09-06', '2026-09-06')).toEqual(days('2026-09-06'));
              expect(await diagnostics('2026-09-06', '')).toEqual(days('2026-09-06', '2026-09-07'));
              expect(await diagnostics('', '2026-04-04')).toEqual(days('2026-04-03', '2026-04-04'));
            });
          });
        });
      });
    });
  });

  // Exports abandoned mid-stream must release their database cursors, so a
  // later export still completes in full. Rounds of stalled exports add up to more than the backend's
  // runtime pool (10 connections); a leaked cursor per abandoned export would starve the later rounds.
  test('exports abandoned mid-stream leave the next export complete', async ({ scenario, providers, context }) => {
    test.setTimeout(300_000);
    // About 7 MB of CSV: more than loopback socket buffers hold, so a reader that stops cannot have it all.
    const total = 30_000;
    const participant = providers.data.participant();
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.study(providers.data.study('AbandonedExport'), async (study) => {
          await study.participant(participant, (part) =>
            part.device(undefined, async (dev) => {
              for (let batch = 0; batch < total / 2_000; batch++) {
                const events = Array.from({ length: 2_000 }, (_, index) =>
                  usageEvent(
                    crypto.randomUUID(),
                    new Date(Date.now() - (batch * 2_000 + index + 1) * 1_000).toISOString(),
                    'UTC',
                  ),
                );
                await dev.upload(events, (data) => {
                  expect(data.rowsWritten).toBe(events.length);
                  return Promise.resolve();
                });
              }
            }),
          );
          await providers.flusherFor(study.client).flush();

          const query = new URLSearchParams({ dataType: 'UsageEvents', participantId: participant.participantId });
          const headers = {
            Cookie: (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
            [HEADER_CSRF_TOKEN]: await currentCsrfToken(context),
          };
          const received: number[] = [];
          for (let round = 0; round < 6; round++) {
            const stalled = await Promise.allSettled(
              Array.from({ length: 4 }, () =>
                stallExport(`${DIRECT_BACKEND_URL}/chronicle/v3/study/${study.id}/participants/data?${query}`, headers),
              ),
            );
            try {
              for (const result of stalled) if (result.status === 'rejected') throw result.reason;
            } finally {
              for (const result of stalled) if (result.status === 'fulfilled') received.push(result.value.abandon());
            }
          }

          await study.asPersona('expert-researcher', async ({ page }) => {
            await page.goto(`/studies/${study.id}/participants`);
            const row = page.getByRole('row').filter({ hasText: participant.participantId });
            await row.getByRole('button', { name: 'More actions', exact: true }).click();
            await page.getByRole('menuitem', { name: 'Download data', exact: true }).click();
            await page.getByRole('dialog').getByRole('button', { name: 'Usage Events', exact: true }).click();
            const { rows, bytes } = await downloadFromDialog(page, context);
            expect(new Set(rows.map((row) => row.client_event_id)).size).toBe(total);
            expect(rows).toHaveLength(total);
            // Each abandoned export had received well under the whole file: it was cut mid-stream.
            expect(Math.max(...received)).toBeLessThan(bytes / 2);
          });
        });
      });
    });
  });
});

/** Pauses after the first CSV row; abandon drops the connection and returns the bytes received. */
function stallExport(url: string, headers: Record<string, string>): Promise<{ abandon: () => number }> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers, timeout: 30_000 }, (response) => {
      if (response.statusCode !== 200) {
        request.destroy();
        reject(new Error(`export answered ${response.statusCode}`));
        return;
      }
      let lines = 0;
      response.on('data', (chunk: Buffer) => {
        lines += chunk.toString('utf8').split('\n').length - 1;
        if (lines < 2) return;
        response.pause();
        resolve({
          abandon: () => {
            const bytes = request.socket?.bytesRead ?? 0;
            request.destroy();
            return bytes;
          },
        });
      });
      response.once('error', reject);
      response.once('end', () => reject(new Error('Export ended before its first CSV row')));
    });
    request.once('timeout', () => request.destroy(new Error('Export did not produce a CSV row within 30 seconds')));
    request.once('error', reject);
  });
}
