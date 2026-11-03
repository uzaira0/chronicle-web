// Deployed bundle journey. The release drill supplies both listeners and the dashboard password.
import type { Browser, Page } from '@playwright/test';

import spanish from '../src/modern/i18n/es/translation.json' with { type: 'json' };
import { AUTH_DASHBOARD_LOGIN_ENDPOINT } from '../src/modern/lib/auth-endpoints';
import { TESTING_LOGIN_PATH } from './dsl/constants.js';
import { expect, test } from './fixtures/browser-test.js';
import { fillRequiredParticipantPolicy, headerCreateStudyButton, setStudyFeature } from './fixtures/study-form.js';

const dashboardPassword = process.env.CHRONICLE_E2E_DASHBOARD_PASSWORD ?? '';
const publicBaseUrl = process.env.CHRONICLE_E2E_PUBLIC_BASE_URL ?? '';
if (!dashboardPassword || !publicBaseUrl) {
  throw new Error('CHRONICLE_E2E_DASHBOARD_PASSWORD and CHRONICLE_E2E_PUBLIC_BASE_URL are required');
}

// Caddy serves the SPA under /chronicle/ and the router derives its basename from that prefix,
// so every in-app path is /chronicle/<route>.
const APP = '/chronicle';

// Unique per run: the stack is long-lived and nothing here deletes what it created, so a fixed
// title would also match rows left by earlier runs and the "find what I just made" assertions
// would pass on the wrong one.
const runId = Math.random().toString(36).slice(2, 8);
const STUDY_TITLE = `E2E Selfhost Journey ${runId}`;
const PARTICIPANT_ID = `e2e-${runId}`;

async function createJourneyStudy(page: Page): Promise<void> {
  await page.goto(`${APP}/studies`, { waitUntil: 'domcontentloaded' });
  const password = page.getByRole('textbox', { name: 'Dashboard password', exact: true });
  await password.fill(crypto.randomUUID());
  const refused = page.waitForResponse(
    (response) => new URL(response.url()).pathname === AUTH_DASHBOARD_LOGIN_ENDPOINT,
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await refused).status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await password.fill(dashboardPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(headerCreateStudyButton(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Sign-in required')).toBeHidden();
  await expect(page.getByText('Session initialization failed')).toBeHidden();

  // ---- create a study ------------------------------------------------------------------
  await headerCreateStudyButton(page).click();
  const studyDialog = page.getByRole('dialog');
  await studyDialog.getByLabel('Study name').fill(STUDY_TITLE);
  // The operator-facing identity and participant-policy fields are all required. Supplying
  // them here proves the deployed form accepts a complete, publishable consent policy rather
  // than bypassing the same fail-closed validation a real researcher must satisfy.
  await studyDialog.getByLabel('Contact email').fill('e2e@chronicle.local');
  await fillRequiredParticipantPolicy(studyDialog, runId);
  // Both features matter downstream: TIME_USE_DIARY is what makes the participant modal issue
  // a diary access code, Android Data Collection is what makes it issue the app-usage one.
  await setStudyFeature(studyDialog, 'Time use diary', true);
  await setStudyFeature(studyDialog, 'Data collection', true);
  await studyDialog.getByRole('button', { name: 'Create study', exact: true }).click();

  // Success navigates to /chronicle/studies/<uuid>. Waiting on the URL rather than on a toast
  // is what proves the backend actually persisted the study and returned its id.
  await page.waitForURL(/\/chronicle\/studies\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByText(STUDY_TITLE).first()).toBeVisible({ timeout: 30_000 });
}

async function enrollJourneyParticipant(page: Page): Promise<void> {
  // ---- enrol a participant ---------------------------------------------------------------
  await page.getByRole('link', { name: 'Participants' }).click();
  await page.getByLabel('New participant ID').fill(PARTICIPANT_ID);
  await page.getByRole('button', { name: 'Register' }).click();
  // The row appearing means the enrollment round-tripped and the list refetched — not merely
  // that the form cleared.
  await expect(page.getByText(PARTICIPANT_ID, { exact: true })).toBeVisible({ timeout: 60_000 });

  // Registering opens the enrollment dialog with the participant ID selected and issues the
  // one-time link once (qr-enrollment-modal autoIssued), so the researcher does not reopen it or
  // type the ID twice. Check the QR is really for this participant, then dismiss the dialog.
  const qrDialog = page.getByRole('dialog');
  await expect(qrDialog.getByRole('img', { name: new RegExp(PARTICIPANT_ID) })).toBeVisible({ timeout: 30_000 });
  await expect(qrDialog.getByRole('button', { name: 'Replace the sent link' })).toBeVisible();
  await qrDialog.getByRole('button', { name: 'Close' }).click();
  await expect(qrDialog).toBeHidden();
}

async function issueJourneyDiaryLink(page: Page): Promise<string> {
  // ---- issue the participant's diary link ------------------------------------------------
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Participant info' }).click();
  const infoDialog = page.getByRole('dialog');

  // Issuing makes the app POST form-access-codes for each enabled form (never on open).
  // The link only appears once the backend returns a real one-time code; a failure
  // surfaces as the modal's error text instead of this label.
  await infoDialog.getByRole('button', { name: 'Issue participant form links' }).click();
  const diaryLabel = infoDialog.getByText('TUD — Today', { exact: true });
  await expect(diaryLabel, 'a TUD-enabled study must yield a diary link').toBeVisible({ timeout: 60_000 });

  // CopyField renders the value in a <code>; read that rather than the clipboard, which
  // needs a permission Playwright does not grant by default. `day=today` is what separates
  // this link from the "TUD — Yesterday" one rendered right below it.
  // textContent, not innerText: the value sits in an `overflow-x-auto` <code>, and innerText
  // returns the *rendered* text, which can fold in line breaks and produce a mangled access
  // code the exchange then rejects as invalid.
  const diaryLink = ((await infoDialog.locator('code', { hasText: 'day=today' }).first().textContent()) ?? '').trim();
  expect(diaryLink, 'the diary link should carry a one-time access code').toContain('accessCode=');
  return diaryLink;
}

async function openSpanishDiary(browser: Browser, diaryLink: string): Promise<void> {
  const participant = await browser.newContext({ ignoreHTTPSErrors: true });
  const origin = new URL(diaryLink).origin;
  const target = new URL(publicBaseUrl).origin;
  if (origin !== target) {
    // The archive drill publishes TLS through an ephemeral local port. Keep the real
    // browser origin and cookies while routing its requests to that listener.
    await participant.route(`${origin}/**`, async (route) => {
      const url = new URL(route.request().url());
      const response = await route.fetch({
        url: target + url.pathname + url.search,
        headers: { ...(await route.request().allHeaders()), host: url.host },
        maxRedirects: 0,
      });
      await route.fulfill({ response });
    });
  }
  try {
    const participantPage = await participant.newPage();
    // ?lang=es is the participant-facing language switch — tud-page-settings.ts resolves it
    // ahead of the study's configured `language`. It goes in the query, not on the end: the
    // access code lives in the fragment after it.
    const diaryUrl = new URL(diaryLink);
    diaryUrl.searchParams.set('lang', 'es');
    await participantPage.goto(diaryUrl.toString(), { waitUntil: 'domcontentloaded' });

    // ParticipantAccessBootstrap renders exactly one of three things: "Opening your form"
    // while the exchange is in flight, "A new link is required" if the code was rejected, or
    // — only on success — ParticipantShell around the diary. Wait for that shell rather than
    // for the failure panels to be absent: absence is also true before anything has rendered,
    // so an absence-first check passes on a link that is about to fail, and then reads an
    // empty page.
    // The page is in Spanish, so match the Spanish catalog's text for the shell and the failure panel.
    await expect(
      participantPage.getByText(spanish.participant_shell.subtitle),
      'the one-time diary link must be accepted',
    ).toBeVisible({ timeout: 60_000 });
    await expect(participantPage.getByText(spanish.participant_access.error_title)).toBeHidden();

    const body = await participantPage.locator('body').innerText();
    // The translator echoes an unknown key verbatim rather than falling back to English, so a
    // bare snake_case identifier on the page is a missing Spanish translation.
    expect(body, 'no raw translation keys should reach the participant').not.toMatch(
      /\b(intro_text|what_dow|day_of_week|survey_intro)\b/,
    );
    // Positive evidence that the Spanish table — not the English one — is in use.
    expect(body.toLowerCase(), 'the diary should render Spanish copy').toMatch(/siguiente|comenzar|continuar|día|hora/);
  } finally {
    await participant.close();
  }
}

test('a researcher signs in, configures a study, enrols a participant, and the participant fills the diary in Spanish', async ({
  page,
  browser,
}) => {
  // Study creation writes several settings sequentially after the study POST, and the diary
  // step then round-trips through a second browser context. 30s is not enough for the chain.
  test.setTimeout(180_000);

  await createJourneyStudy(page);
  await enrollJourneyParticipant(page);
  const diaryLink = await issueJourneyDiaryLink(page);
  await openSpanishDiary(browser, diaryLink);
});

test('the public listener serves participants but hides the researcher dashboard', async ({ browser }) => {
  // A fresh context reaches the public boundary without a researcher session.
  const context = await browser.newContext({ baseURL: publicBaseUrl, ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();

    const health = await page.request.get('/health');
    // The public route proxies the dependency-aware backend readiness endpoint. A healthy
    // readiness probe intentionally has no response body and therefore returns 204.
    expect(health.status(), 'the proxy must answer dependency-aware health checks').toBe(204);

    // In the internal-only dashboard modes the researcher surface is not routed on this
    // listener at all, so Caddy answers 404 rather than advertising it with a 401.
    for (const path of ['/chronicle/api/web/study', TESTING_LOGIN_PATH]) {
      const res = await page.request.get(path);
      expect(res.status(), `${path} must not be exposed on the public listener`).toBe(404);
    }

    // Mobile ingest stays reachable — a participant's phone has to talk to this listener. A
    // 401/403 means the route exists and demands credentials, which is correct; a 404 would
    // mean phones cannot upload at all.
    const ingest = await page.request.post(
      '/chronicle/v4/study/00000000-0000-0000-0000-000000000001/participant/fixture/android/sensors',
      { data: [] },
    );
    expect([401, 403], 'mobile ingest should be gated, not missing').toContain(ingest.status());
  } finally {
    await context.close();
  }
});
