// Study configuration export/import, end to end against the real backend through a real
// browser: configure a study by hand, save it, export the persisted configuration from the
// edit dialog, import that file into the create dialog, save the second study, and prove the
// second study's persisted configuration equals the first one's.
//
// Two full server round trips are what make this an integration proof rather than a form
// test: the export reads what the backend actually stored (limits, settings, modules), and
// the comparison at the end reads what the backend stored for the imported copy.

import { readFile } from 'node:fs/promises';
import type { Browser, Locator, Page } from '@playwright/test';
import { COLLECTION_MODULES } from '../src/modern/lib/study-constants';
import { PROXY_BASE_URL_DEFAULT } from './dsl/constants';
import { apiPost } from './dsl/di/api-client';
import { ParticipantScope } from './dsl/scopes/participant-scope';
import type { PersonaScope } from './dsl/scopes/persona-scope';

import { expect, chronicleTest as test } from './fixtures/chronicle-test';
import { PILOT_MODULES, fillRequiredParticipantPolicy, headerCreateStudyButton, setStudyFeature } from './fixtures/study-form';

type ExportedConfig = {
  format: string;
  version: number;
  study: Record<string, unknown> & {
    title: string;
    modules?: Record<string, { mode: string; intervalSeconds: string; healthConnectRecordTypes?: string[] }>;
    participantPolicy?: Record<string, string>;
  };
};

async function exportFromEditDialog(page: Page, dialog: Locator): Promise<{ config: ExportedConfig; path: string }> {
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export configuration' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-config-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  const config = JSON.parse(await readFile(path, 'utf8')) as ExportedConfig;
  expect(config.format).toBe('chronicle-study-config');
  expect(config.version).toBe(1);
  return { config, path };
}

async function openEditDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Edit study' }).click();
  const dialog = page.getByRole('dialog');
  // The edit form only renders once limits, collection settings and policy are loaded.
  await expect(dialog.getByRole('button', { name: 'Export configuration' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel('Study name')).not.toHaveValue('', { timeout: 30_000 });
  return dialog;
}

// The test backend signs enrollment manifests for https://localhost (blank public-base-url), so invitation
// links name that server; a fresh browser reaches it through the preview proxy.
const PUBLIC_SERVER = { allowPrivateServerUrl: true, serverUrl: 'https://localhost' };

type PreviewManifest = {
  manifest: {
    collectionSettings: { modules?: Record<string, { enabled?: boolean }> };
    participantId: string;
    studyId: string;
    studyTitle: string;
  };
};

/** Opens an invitation link as a phone's browser would: a new browser profile with no dashboard session. */
async function openInvitation(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const proxy = test.info().project.use.baseURL ?? PROXY_BASE_URL_DEFAULT;
  const context = await browser.newContext();
  await context.route(`${PUBLIC_SERVER.serverUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/chronicle/runtime-config.js') {
      await route.fulfill({
        body: `window.__CHRONICLE_RUNTIME_CONFIG__ = Object.freeze(${JSON.stringify(PUBLIC_SERVER)});`,
        contentType: 'text/javascript',
      });
      return;
    }
    // Same origin at the public server, as the preview proxy treats its own origin.
    const { origin: _origin, ...headers } = route.request().headers();
    await route.fulfill({ response: await route.fetch({ headers, url: `${proxy}${url.pathname}${url.search}` }) });
  });
  return { close: () => context.close(), page: await context.newPage() };
}

async function expectInvitationPreview(
  browser: Browser,
  link: string,
  expected: { participantId: string; studyId: string; title: string; modules: ReadonlySet<string> },
): Promise<void> {
  const { close, page } = await openInvitation(browser);
  try {
    const response = page.waitForResponse((candidate) => candidate.url().endsWith('/enrollment-preview'));
    await page.goto(link);
    const { manifest } = (await (await response).json()) as PreviewManifest;
    await expect(page.getByText('Verified response from the study server')).toBeVisible();
    await expect(page.getByRole('heading', { name: expected.title })).toBeVisible();
    expect({ participantId: manifest.participantId, studyId: manifest.studyId, title: manifest.studyTitle }).toEqual({
      participantId: expected.participantId,
      studyId: expected.studyId,
      title: expected.title,
    });
    expect(
      Object.entries(manifest.collectionSettings.modules ?? {})
        .filter(([, module]) => module.enabled)
        .map(([id]) => id)
        .sort(),
    ).toEqual([...expected.modules].sort());
    const handoff = new URL(
      (await page.getByRole('link', { name: 'Open Chronicle for Android' }).getAttribute('href')) ?? '',
    );
    expect(handoff.searchParams.get('participantId')).toBe(expected.participantId);
    expect(handoff.searchParams.get('studyId')).toBe(expected.studyId);
  } finally {
    await close();
  }
}

async function expectInvitationRefused(browser: Browser, link: string): Promise<void> {
  const { close, page } = await openInvitation(browser);
  try {
    await page.goto(link);
    await expect(
      page.getByText('This study invitation is invalid, expired, or already used. Ask the study team for a new link.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Chronicle for Android' })).toHaveCount(0);
  } finally {
    await close();
  }
}

/** The link the Copy button puts on the clipboard, checked against the one the dialog shows. */
async function copyInvitationLink(page: Page, qr: Locator): Promise<string> {
  await qr.getByRole('button', { name: 'Copy enrollment link' }).click();
  await expect(qr.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  await expect(qr.locator('code', { hasText: '/chronicle/enroll?' })).toHaveText(copied);
  return copied;
}

// The copied invitation is the one the server honours, reopening shows that same link, and an
// explicit replacement retires it with a participant-facing refusal.
async function verifyInvitationLink(
  persona: PersonaScope,
  browser: Browser,
  qr: Locator,
  expected: { participantId: string; studyId: string; title: string; modules: ReadonlySet<string> },
): Promise<void> {
  const page = persona.page;
  await persona.context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const link = await copyInvitationLink(page, qr);
  expect(link.startsWith(`${PUBLIC_SERVER.serverUrl}/chronicle/enroll?`)).toBe(true);
  await expectInvitationPreview(browser, link, expected);
  await qr.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(qr).toBeHidden();

  await page.getByRole('button', { name: 'QR enrollment', exact: true }).click();
  const reopened = page.getByRole('dialog');
  await reopened.getByLabel('Participant ID').fill(expected.participantId);
  await reopened.getByRole('button', { name: 'Issue one-time enrollment link' }).click();
  await expect(reopened.getByRole('button', { name: 'Replace the sent link' })).toBeVisible();
  expect(await copyInvitationLink(page, reopened)).toBe(link);
  await expectInvitationPreview(browser, link, expected);

  await reopened.getByRole('button', { name: 'Replace the sent link' }).click();
  await expect(reopened.locator('code', { hasText: '/chronicle/enroll?' })).not.toHaveText(link);
  await expect(reopened.getByRole('button', { name: 'Copy enrollment link' })).toBeVisible();
  const replacement = await copyInvitationLink(page, reopened);
  expect(replacement).not.toBe(link);
  await expectInvitationPreview(browser, replacement, expected);
  await expectInvitationRefused(browser, link);
  await reopened.getByRole('button', { name: 'Close', exact: true }).click();
}

async function verifyPilotParticipantControls(
  persona: PersonaScope,
  browser: Browser,
  pilot: ReadonlySet<string>,
  title: string,
): Promise<void> {
  const page = persona.page;
  await page.getByRole('link', { name: 'Participants', exact: true }).click();
  await page.evaluate((config) => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', config);
  }, PUBLIC_SERVER);
  const participant = 'pilot';
  await page.getByRole('textbox', { name: 'New participant ID' }).fill(participant);
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  const qr = page.getByRole('dialog');
  await expect(qr.getByRole('img', { name: `Enrollment QR code for participant ${participant}` })).toBeVisible();
  await expect(qr.getByRole('button', { name: 'Copy enrollment link' })).toBeEnabled();
  const studyId = new URL(page.url()).pathname.split('/')[2];
  if (!studyId) throw new Error('Expected a saved study');
  await verifyInvitationLink(persona, browser, qr, { modules: pilot, participantId: participant, studyId, title });
  const enrolled = new ParticipantScope(persona.ctx, 'test_admin', persona.api, persona.context, studyId, participant);
  await enrolled.device(persona.ctx.providers.data.androidDevice(), async (device) => {
    await device.upload(persona.ctx.providers.data.usageEvents(1), async (data) => {
      await data.flush();
    });
  });
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: participant });
  await expect(row).toContainText('Android');
  await expect(row).toContainText('1 day');
  await row.getByRole('button', { name: `Expand row for ${participant}` }).click();
  const consent = page.getByRole('table', { name: 'Participant consent decisions' });
  for (const id of pilot) await expect(consent).toContainText(id);
  await row.getByRole('button', { name: `Collapse row for ${participant}` }).click();
  for (const [action, status] of [
    ['Pause enrollment', 'Paused'],
    ['Resume enrollment', 'Enrolled'],
    ['Mark not enrolled', 'Not enrolled'],
    ['Enroll participant', 'Enrolled'],
  ] as const) {
    await row.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Change enrollment' }).click();
    const change = page.getByRole('dialog');
    await change.getByRole('button', { name: action, exact: true }).click();
    await expect(change).toBeHidden();
    await expect(row).toContainText(new RegExp(status, 'i'));
  }
}

// Each module row's Required/Optional/Disabled control is a fieldset whose legend is
// "<module label> collection mode", so it is addressable as a named group.
function moduleMode(dialog: Locator, moduleLabel: string, mode: 'Required' | 'Optional' | 'Disabled'): Locator {
  return dialog.getByRole('group', { name: `${moduleLabel} collection mode` }).getByRole('radio', { name: mode });
}

// Module rows live in native <details> groups that open only when a module in them is already
// enabled, so a default-off module's controls are hidden until the group is expanded.
async function expandModuleGroup(dialog: Locator, groupLabel: string): Promise<void> {
  // The summary reads "<group> · <n> on"; anchor on the separator so "Health" cannot match a
  // module row's text.
  const summary = dialog.locator('summary', { hasText: new RegExp(`^${groupLabel} · `) });
  await expect(summary).toBeVisible();
  if (!(await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open))) {
    await summary.click();
  }
}

async function setModuleMode(
  dialog: Locator,
  groupLabel: string,
  moduleLabel: string,
  mode: 'Required' | 'Optional' | 'Disabled',
): Promise<void> {
  await expandModuleGroup(dialog, groupLabel);
  // The radio itself is visually hidden; its label is the click target.
  await dialog
    .getByRole('group', { name: `${moduleLabel} collection mode` })
    .locator('label', { hasText: mode })
    .click();
  await expect(moduleMode(dialog, moduleLabel, mode)).toBeChecked();
}

// Health Connect and Device Settings are not collected by the Play Store app, so the save asks first.
async function createWithPlayStoreModules(page: Page, dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Create study', exact: true }).click();
  await page.getByRole('button', { name: 'Save anyway', exact: true }).click();
  await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/, { timeout: 60_000 });
}

async function configureSourceStudy(page: Page, sourceTitle: string, runId: string): Promise<void> {
  await headerCreateStudyButton(page).click();
  const create = page.getByRole('dialog');
  await create.getByLabel('Study name').fill(sourceTitle);
  await create.getByLabel('Description').fill('Exported from the source study');
  await create.getByLabel('Study group').fill(`group-${runId}`);
  await create.getByLabel('Version', { exact: true }).fill('7.1');
  await create.getByLabel('Contact email').fill('source@chronicle.test');
  await fillRequiredParticipantPolicy(create, runId);
  await setStudyFeature(create, 'Data collection', true);
  await setStudyFeature(create, 'Time use diary', true);
  await setModuleMode(create, 'Health', 'Health Connect', 'Required');
  await create.getByLabel('Steps', { exact: true }).check();
  await create.getByLabel('Heart rate', { exact: true }).check();
  await setModuleMode(create, 'Device State', 'Device Settings', 'Optional');
  await create.locator('input[id$="-interval-device_settings"]').fill('1800');
  await create.getByLabel('Study duration (days)', { exact: true }).fill('120');
  await create.getByLabel('Data retention (days)', { exact: true }).fill('365');
  await createWithPlayStoreModules(page, create);
}

test.describe('study configuration transfer', () => {
  for (const allRequired of [false, true]) {
    test(`Pilot configuration survives editing and file transfer (${allRequired ? 'all required' : 'one required'})`, async ({
      browser,
      scenario,
    }) => {
      test.setTimeout(180_000);
      await scenario(async (s) => {
        await s.asUser('test_admin', async (auth) => {
          await auth.asPersona('expert-researcher', async (persona) => {
            const page = persona.page;
            await persona.openStudiesList();
            await headerCreateStudyButton(page).click();
            const create = page.getByRole('dialog');
            const { config } = await exportFromEditDialog(page, create);
            const pilot = PILOT_MODULES;
            config.study.title = `Pilot ${allRequired} ${Date.now()}`;
            config.study.features = ['CHRONICLE_DATA_COLLECTION'];
            for (const module of COLLECTION_MODULES) {
              const draft = config.study.modules?.[module.value];
              if (draft)
                draft.mode = pilot.has(module.value)
                  ? module.consentGated && (allRequired || module.value === 'usage_events')
                    ? 'required'
                    : 'optional'
                  : 'disabled';
            }
            await create.getByTestId('study-config-file').setInputFiles({
              name: 'pilot.json',
              mimeType: 'application/json',
              buffer: Buffer.from(JSON.stringify(config)),
            });
            await create.getByLabel('Contact email').fill('pilot@chronicle.test');
            await fillRequiredParticipantPolicy(create, `pilot-${allRequired}`);
            await create.getByRole('button', { name: 'Create study', exact: true }).click();
            await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/);
            const edit = await openEditDialog(page);
            await edit.getByLabel('Description').fill('Pilot edited settings');
            await edit.locator('input[id$="-interval-battery_telemetry"]').fill('1800');
            await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
            await expect(edit).toBeHidden();
            const source = await openEditDialog(page);
            const { config: saved, path } = await exportFromEditDialog(page, source);
            expect(
              Object.entries(saved.study.modules ?? {})
                .filter(([, draft]) => draft.mode !== 'disabled')
                .map(([id]) => id)
                .sort(),
            ).toEqual([...pilot].sort());
            expect(saved.study.description).toBe('Pilot edited settings');
            expect(saved.study.modules?.battery_telemetry?.intervalSeconds).toBe('1800');
            await source.getByRole('button', { name: 'Cancel' }).click();
            await persona.openStudiesList();
            await headerCreateStudyButton(page).click();
            const copy = page.getByRole('dialog');
            await copy.getByTestId('study-config-file').setInputFiles(path);
            await copy.getByLabel('Study name').fill(`${saved.study.title} copy`);
            await copy.getByRole('button', { name: 'Create study', exact: true }).click();
            await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/);
            const copied = await openEditDialog(page);
            const { config: restored } = await exportFromEditDialog(page, copied);
            expect({ ...restored.study, title: saved.study.title }).toEqual(saved.study);
            await copied.getByRole('button', { name: 'Cancel' }).click();
            await verifyPilotParticipantControls(persona, browser, pilot, `${saved.study.title} copy`);
          });
        });
      });
    });
  }

  test('a saved study exports, the file imports into a new study, and the copy persists identically', async ({
    scenario,
  }) => {
    test.setTimeout(240_000);
    const runId = Math.random().toString(36).slice(2, 8);
    const sourceTitle = `Config Source ${runId}`;
    const copyTitle = `Config Copy ${runId}`;
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          const page = persona.page;
          await persona.openStudiesList();
          await configureSourceStudy(page, sourceTitle, runId);
          const sourceUrl = page.url();
          const sourceDialog = await openEditDialog(page);
          const { config: exported, path: exportedPath } = await exportFromEditDialog(page, sourceDialog);
          expect(exported.study.title).toBe(sourceTitle);
          expect(exported.study.contact).toBe('source@chronicle.test');
          expect(exported.study.description).toBe('Exported from the source study');
          expect(exported.study.group).toBe(`group-${runId}`);
          expect(exported.study.version).toBe('7.1');
          expect(exported.study.studyDurationDays).toBe('120');
          expect(exported.study.dataRetentionDays).toBe('365');
          expect(exported.study.features).toEqual(
            expect.arrayContaining(['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY']),
          );
          expect(exported.study.modules?.health_connect?.mode).toBe('required');
          expect([...(exported.study.modules?.health_connect?.healthConnectRecordTypes ?? [])].sort()).toEqual([
            'heart_rate',
            'steps',
          ]);
          expect(exported.study.modules?.device_settings?.mode).toBe('optional');
          expect(exported.study.modules?.device_settings?.intervalSeconds).toBe('1800');
          expect(exported.study.participantPolicy?.version).toBe(`e2e-${runId}`);
          await sourceDialog.getByRole('button', { name: 'Cancel' }).click();
          await expect(sourceDialog).toBeHidden();
          await persona.openStudiesList();
          await headerCreateStudyButton(page).click();
          const importDialog = page.getByRole('dialog');
          await importDialog.getByTestId('study-config-file').setInputFiles(exportedPath);
          await expect(importDialog.getByRole('status')).toContainText('Loaded configuration from');
          await expect(importDialog.getByLabel('Study name')).toHaveValue(sourceTitle);
          await expect(importDialog.getByLabel('Contact email')).toHaveValue('source@chronicle.test');
          await expect(importDialog.getByLabel('Study duration (days)', { exact: true })).toHaveValue('120');
          await expandModuleGroup(importDialog, 'Health');
          await expect(moduleMode(importDialog, 'Health Connect', 'Required')).toBeChecked();
          await expect(importDialog.getByLabel('Heart rate', { exact: true })).toBeChecked();
          await expect(importDialog.locator('input[id$="-interval-device_settings"]')).toHaveValue('1800');
          await expect(importDialog.getByLabel('Policy version')).toHaveValue(`e2e-${runId}`);
          await importDialog.getByLabel('Study name').fill(copyTitle);
          await createWithPlayStoreModules(page, importDialog);
          expect(page.url()).not.toBe(sourceUrl);
          const copyDialog = await openEditDialog(page);
          const { config: reExported } = await exportFromEditDialog(page, copyDialog);
          expect(reExported.study.title).toBe(copyTitle);
          expect({ ...reExported.study, title: exported.study.title }).toEqual(exported.study);
        });
      });
    });
  });

  // Kept beside the export/import helpers rather than in scenarios/study-lifecycle:
  // non-default pilot settings survive save, reload and import into a new study; an enrolled study keeps
  // its enrollment-locked policy and withdrawal mode on import; and a save cut off part-way persists the
  // whole configuration when retried.
  test('a pilot configuration round-trips through saved studies, enrollment locks and a failed save', async ({
    scenario,
  }) => {
    test.setTimeout(300_000);
    const runId = Math.random().toString(36).slice(2, 8);
    const pilot = PILOT_MODULES;
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          const page = persona.page;
          await persona.openStudiesList();
          await headerCreateStudyButton(page).click();
          const create = page.getByRole('dialog');
          const { config: defaults } = await exportFromEditDialog(page, create);
          const chosen = {
            appUsageFrequency: defaults.study.appUsageFrequency === 'HOURLY' ? 'DAILY' : 'HOURLY',
            dataRetentionDays: '400',
            description: 'Pilot round trip',
            features: ['CHRONICLE_DATA_COLLECTION'],
            studyDurationDays: '45',
            timeZone: 'America/Santiago',
            title: `Pilot round trip ${runId}`,
            withdrawalMode: defaults.study.withdrawalMode === 'ERASE' ? 'KEEP_PRIOR_DATA' : 'ERASE',
          };
          const file: ExportedConfig = { ...defaults, study: { ...defaults.study, ...chosen } };
          for (const module of COLLECTION_MODULES) {
            const draft = file.study.modules?.[module.value];
            if (draft)
              draft.mode = !pilot.has(module.value)
                ? 'disabled'
                : module.consentGated && module.value === 'usage_events'
                  ? 'required'
                  : 'optional';
          }
          const battery = file.study.modules?.battery_telemetry;
          if (battery) battery.intervalSeconds = '1800';
          await create.getByTestId('study-config-file').setInputFiles({
            buffer: Buffer.from(JSON.stringify(file)),
            mimeType: 'application/json',
            name: 'pilot.json',
          });
          await create.getByLabel('Contact email').fill('pilot@chronicle.test');
          await fillRequiredParticipantPolicy(create, `round-${runId}`);
          await create.getByRole('button', { name: 'Create study', exact: true }).click();
          await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/);
          await page.reload();

          const { config: saved, path } = await exportFromEditDialog(page, await openEditDialog(page));
          expect(saved.study).toMatchObject(chosen);
          expect(saved.study.modules?.battery_telemetry?.intervalSeconds).toBe('1800');
          expect(
            Object.entries(saved.study.modules ?? {})
              .filter(([, draft]) => draft.mode !== 'disabled')
              .map(([id]) => id)
              .sort(),
          ).toEqual([...pilot].sort());
          await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

          await persona.openStudiesList();
          await headerCreateStudyButton(page).click();
          const copy = page.getByRole('dialog');
          await copy.getByTestId('study-config-file').setInputFiles(path);
          await copy.getByLabel('Study name').fill(`${chosen.title} copy`);
          await copy.getByRole('button', { name: 'Create study', exact: true }).click();
          await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/);
          const studyId = new URL(page.url()).pathname.split('/')[2] ?? '';
          await page.reload();
          const { config: restored } = await exportFromEditDialog(page, await openEditDialog(page));
          expect({ ...restored.study, title: saved.study.title }).toEqual(saved.study);
          await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

          // An enrolled phone locks the participant policy and withdrawal mode of the copy.
          await apiPost(persona.api, `/chronicle/v3/study/${studyId}/participant`, {
            candidate: {},
            participantId: `locked-${runId}`,
            participationStatus: 'ENROLLED',
          });
          const enrolled = new ParticipantScope(
            persona.ctx,
            'test_admin',
            persona.api,
            persona.context,
            studyId,
            `locked-${runId}`,
          );
          await enrolled.device(persona.ctx.providers.data.androidDevice(), () => Promise.resolve());
          const restoredBattery = restored.study.modules?.battery_telemetry;
          if (!restoredBattery) throw new Error('Expected the pilot battery module in the restored configuration');
          const changed: ExportedConfig = {
            ...restored,
            study: {
              ...restored.study,
              description: 'Changed after enrollment',
              // A changed collection value, so the save cut off at its collection-settings write is detectable.
              modules: {
                ...restored.study.modules,
                battery_telemetry: { ...restoredBattery, intervalSeconds: '3600' },
              },
              participantPolicy: { ...restored.study.participantPolicy, version: `changed-${runId}` },
              studyDurationDays: '60',
              withdrawalMode: restored.study.withdrawalMode === 'ERASE' ? 'KEEP_PRIOR_DATA' : 'ERASE',
            },
          };
          await page.reload();
          const edit = await openEditDialog(page);
          await edit.getByTestId('study-config-file').setInputFiles({
            buffer: Buffer.from(JSON.stringify(changed)),
            mimeType: 'application/json',
            name: 'changed.json',
          });
          await expect(edit.getByRole('status')).toContainText('Loaded configuration from');

          // The first collection-settings write fails after the earlier writes of the same save succeeded.
          let collectionWrites = 0;
          await page.route('**/settings/type/DataCollection', async (route) => {
            if (route.request().method() !== 'PATCH') return route.fallback();
            collectionWrites += 1;
            if (collectionWrites === 1) return route.fulfill({ json: { message: 'unavailable' }, status: 503 });
            return route.fallback();
          });
          await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
          await expect(edit.getByRole('alert')).toBeVisible();
          await expect(edit).toBeVisible();
          await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
          await expect(edit).toBeHidden();
          expect(collectionWrites).toBeGreaterThanOrEqual(2);
          await page.unroute('**/settings/type/DataCollection');

          await page.reload();
          const { config: final } = await exportFromEditDialog(page, await openEditDialog(page));
          expect(final.study).toEqual({
            ...changed.study,
            participantPolicy: restored.study.participantPolicy,
            withdrawalMode: restored.study.withdrawalMode,
          });
        });
      });
    });
  });

  test('a file that is not a study configuration is refused and the form keeps its values', async ({ scenario }) => {
    await scenario(async (s) => {
      await s.asUser('test_admin', async (auth) => {
        await auth.asPersona('expert-researcher', async (persona) => {
          const page = persona.page;
          await persona.openStudiesList();
          await headerCreateStudyButton(page).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Study name').fill('Keep me');
          await dialog.getByTestId('study-config-file').setInputFiles({
            name: 'random.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ format: 'not-chronicle' })),
          });
          await expect(dialog.getByRole('alert')).toContainText('not a Chronicle study configuration');
          await expect(dialog.getByLabel('Study name')).toHaveValue('Keep me');
        });
      });
    });
  });
});
