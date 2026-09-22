// Study configuration export/import, end to end against the real backend through a real
// browser: configure a study by hand, save it, export the persisted configuration from the
// edit dialog, import that file into the create dialog, save the second study, and prove the
// second study's persisted configuration equals the first one's.
//
// Two full server round trips are what make this an integration proof rather than a form
// test: the export reads what the backend actually stored (limits, settings, modules), and
// the comparison at the end reads what the backend stored for the imported copy.

import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { expect, chronicleTest as test } from './fixtures/chronicle-test';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form';

type ExportedConfig = {
  format: string;
  version: number;
  study: Record<string, unknown> & {
    title: string;
    healthConnectRecordTypes?: string[];
    moduleIntervalSeconds?: Record<string, string>;
    moduleRequired?: Record<string, boolean>;
    moduleSettings?: Record<string, boolean>;
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
  await page.getByRole('button', { name: 'Edit Study' }).click();
  const dialog = page.getByRole('dialog');
  // The edit form only renders once limits, collection settings and policy are loaded.
  await expect(dialog.getByRole('button', { name: 'Export configuration' })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel('Study Name')).not.toHaveValue('', { timeout: 30_000 });
  return dialog;
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

test.describe('study configuration transfer', () => {
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

          // ---- configure the source study by hand ------------------------------------
          await persona.openStudiesList();
          await page.getByRole('button', { name: 'Create New Study' }).click();
          const create = page.getByRole('dialog');
          await create.getByLabel('Study Name').fill(sourceTitle);
          await create.getByLabel('Description').fill('Exported from the source study');
          await create.getByLabel('Study Group').fill(`group-${runId}`);
          await create.getByLabel('Version', { exact: true }).fill('7.1');
          await create.getByLabel('Contact Email').fill('source@chronicle.test');
          await create.getByLabel('Enable daily notifications').check();
          await fillRequiredParticipantPolicy(create, runId);
          await setStudyFeature(create, 'Data Collection', true);
          await setStudyFeature(create, 'Time Use Diary', true);
          // Non-default module config: Health Connect required with an explicit scope, a
          // custom interval on a periodic module, and every limit set.
          await setModuleMode(create, 'Health', 'Health Connect', 'Required');
          await create.getByLabel('Steps', { exact: true }).check();
          await create.getByLabel('Heart rate', { exact: true }).check();
          await setModuleMode(create, 'Device State', 'Device Settings', 'Optional');
          await create.locator('#interval-device_settings').fill('1800');
          await create.locator('#participant-limit').fill('77');
          await create.locator('#study-duration').fill('120');
          await create.locator('#data-retention').fill('365');
          await create.getByRole('button', { name: 'Create Study', exact: true }).click();
          await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/, { timeout: 60_000 });
          const sourceUrl = page.url();

          // ---- export what the server persisted ----------------------------------------
          const sourceDialog = await openEditDialog(page);
          const { config: exported, path: exportedPath } = await exportFromEditDialog(page, sourceDialog);
          expect(exported.study.title).toBe(sourceTitle);
          expect(exported.study.contact).toBe('source@chronicle.test');
          expect(exported.study.description).toBe('Exported from the source study');
          expect(exported.study.group).toBe(`group-${runId}`);
          expect(exported.study.version).toBe('7.1');
          expect(exported.study.notificationsEnabled).toBe(true);
          expect(exported.study.participantLimit).toBe('77');
          expect(exported.study.studyDurationDays).toBe('120');
          expect(exported.study.dataRetentionDays).toBe('365');
          expect(exported.study.features).toEqual(
            expect.arrayContaining(['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY']),
          );
          expect(exported.study.moduleSettings?.health_connect).toBe(true);
          expect(exported.study.moduleRequired?.health_connect).toBe(true);
          expect([...(exported.study.healthConnectRecordTypes ?? [])].sort()).toEqual(['heart_rate', 'steps']);
          expect(exported.study.moduleSettings?.device_settings).toBe(true);
          expect(exported.study.moduleIntervalSeconds?.device_settings).toBe('1800');
          expect(exported.study.participantPolicy?.version).toBe(`e2e-${runId}`);
          await sourceDialog.getByRole('button', { name: 'Cancel' }).click();
          await expect(sourceDialog).toBeHidden();

          // ---- import into a brand-new study ------------------------------------------
          await persona.openStudiesList();
          await page.getByRole('button', { name: 'Create New Study' }).click();
          const importDialog = page.getByRole('dialog');
          await importDialog.getByTestId('study-config-file').setInputFiles(exportedPath);
          await expect(importDialog.getByRole('status')).toContainText('Loaded configuration from');
          // Every value landed in the form before the user touches anything.
          await expect(importDialog.getByLabel('Study Name')).toHaveValue(sourceTitle);
          await expect(importDialog.getByLabel('Contact Email')).toHaveValue('source@chronicle.test');
          await expect(importDialog.getByLabel('Enable daily notifications')).toBeChecked();
          await expect(importDialog.locator('#participant-limit')).toHaveValue('77');
          await expandModuleGroup(importDialog, 'Health');
          await expect(moduleMode(importDialog, 'Health Connect', 'Required')).toBeChecked();
          await expect(importDialog.getByLabel('Heart rate', { exact: true })).toBeChecked();
          await expect(importDialog.locator('#interval-device_settings')).toHaveValue('1800');
          await expect(importDialog.getByLabel('Policy Version')).toHaveValue(`e2e-${runId}`);
          // A copy needs its own name; everything else is kept.
          await importDialog.getByLabel('Study Name').fill(copyTitle);
          await importDialog.getByRole('button', { name: 'Create Study', exact: true }).click();
          await page.waitForURL(/\/studies\/[0-9a-f-]{36}$/, { timeout: 60_000 });
          expect(page.url()).not.toBe(sourceUrl);

          // ---- the copy's persisted configuration equals the source's ------------------
          const copyDialog = await openEditDialog(page);
          const { config: reExported } = await exportFromEditDialog(page, copyDialog);
          expect(reExported.study.title).toBe(copyTitle);
          const { title: _sourceTitle, ...sourceRest } = exported.study;
          const { title: _copyTitle, ...copyRest } = reExported.study;
          expect(copyRest).toEqual(sourceRest);
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
          await page.getByRole('button', { name: 'Create New Study' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Study Name').fill('Keep me');
          await dialog.getByTestId('study-config-file').setInputFiles({
            name: 'random.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ format: 'not-chronicle' })),
          });
          await expect(dialog.getByRole('alert')).toContainText('not a Chronicle study configuration');
          await expect(dialog.getByLabel('Study Name')).toHaveValue('Keep me');
        });
      });
    });
  });
});
