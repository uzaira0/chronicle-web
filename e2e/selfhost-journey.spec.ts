// End-to-end journey against a RUNNING self-host deployment, driven through a real browser.
//
// This is deliberately different from e2e/scenarios/*.spec.ts, which drive the API through the
// DSL against a dev build. Here the target is the deployed stack — Caddy, the built SPA, the
// backend and Postgres exactly as an operator runs them — so it catches the class of problem
// the API tests cannot see: the proxy denying a route the SPA needs, a broken production
// bundle, the dashboard being reachable on the public listener, or a participant link that the
// researcher UI hands out but the participant page then refuses.
//
// Run it against a live deployment:
//
//   cd selfhost && docker compose up -d
//   cd ../chronicle-web
//   CHRONICLE_PROXY_BASE_URL=https://127.0.0.1:8081 \
//   CHRONICLE_E2E_BASIC_AUTH_USER=researcher \
//   CHRONICLE_E2E_BASIC_AUTH_PASSWORD='<the password behind DASHBOARD_PASSWORD_HASH>' \
//   CHRONICLE_E2E_PUBLIC_BASE_URL=http://127.0.0.1:8080 \
//     bunx playwright test e2e/selfhost-journey.spec.ts --project=desktop-chromium
//
// Setting CHRONICLE_E2E_BASIC_AUTH_USER is what puts playwright.config.ts into self-host mode
// (httpCredentials + ignoreHTTPSErrors + no webServer). Without it this whole file skips, so a
// normal `bun run e2e` against the dev build is unaffected.
//
// Requires TESTING_LOGIN_ENABLED=true and REQUIRE_MFA=false in selfhost/.env — the built-in
// dashboard login. Past the Caddy password prompt the SPA mints its own researcher session by
// POSTing /chronicle/v3/auth/testing-login. With the SSO overlay instead, sign-in is a
// Keycloak redirect and this file would stop at the "Sign-in required" panel. Note that
// changing .env only takes effect after `docker compose up -d --force-recreate backend`.
//
// The whole researcher-and-participant story is ONE test on purpose. Every full document load
// re-bootstraps the session, and the backend allows 10 requests/minute per IP to /auth/ paths
// (RateLimitConfiguration.authRequestsPerMinute), so a test-per-step file reloads its way to a
// 429 and the SPA renders "Session initialization failed" instead of the dashboard. Clicking
// through client-side routes off a single load is both what a real researcher does and what
// stays inside that budget. Two consecutive runs within the same minute can still trip it.
//
// The `test` fixture is the browser-safety one from ./fixtures/browser-test: it watches the
// browser context for uncaught page errors and renderer crashes and fails the test on either.
// It is an auto fixture, so it applies to every test here without being named. That is what
// lets this file claim "the frontend works" about the console too, not only about what
// rendered.

import { TESTING_LOGIN_PATH } from './dsl/constants.js';
import { expect, test } from './fixtures/browser-test.js';
import { fillRequiredParticipantPolicy, setStudyFeature } from './fixtures/study-form.js';

const basicAuthUser = process.env.CHRONICLE_E2E_BASIC_AUTH_USER;
const basicAuthPassword = process.env.CHRONICLE_E2E_BASIC_AUTH_PASSWORD ?? '';
const publicBaseUrl = process.env.CHRONICLE_E2E_PUBLIC_BASE_URL ?? '';

test.skip(!basicAuthUser, 'set CHRONICLE_E2E_BASIC_AUTH_USER to run against a self-host deployment');

// Caddy serves the SPA under /chronicle/ and the router derives its basename from that prefix,
// so every in-app path is /chronicle/<route>.
const APP = '/chronicle';

// Unique per run: the stack is long-lived and nothing here deletes what it created, so a fixed
// title would also match rows left by earlier runs and the "find what I just made" assertions
// would pass on the wrong one.
const runId = Math.random().toString(36).slice(2, 8);
const STUDY_TITLE = `E2E Selfhost Journey ${runId}`;
const PARTICIPANT_ID = `e2e-${runId}`;

test('the Caddy password gate accepts the dashboard credentials and rejects a wrong one', async ({
  page,
  browser,
}) => {
  const response = await page.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  // 200 rather than 401: httpCredentials satisfied chronicle_dashboard_gate. A 401 here means
  // the password and DASHBOARD_PASSWORD_HASH disagree, and nothing else in this file would
  // mean anything.
  expect(response?.status(), 'the configured dashboard password should be accepted').toBe(200);

  const wrong = await browser.newContext({
    httpCredentials: { username: basicAuthUser as string, password: 'not-the-dashboard-password' },
    ignoreHTTPSErrors: true,
  });
  try {
    const wrongPage = await wrong.newPage();
    const refused = await wrongPage.goto(`${APP}/`, { waitUntil: 'commit' });
    expect(refused?.status(), 'a wrong password must not reach the dashboard').toBe(401);
  } finally {
    await wrong.close();
  }
});

test('a researcher signs in, configures a study, enrols a participant, and the participant fills the diary in Spanish', async ({
  page,
  browser,
}) => {
  // Study creation writes several settings sequentially after the study POST, and the diary
  // step then round-trips through a second browser context. 30s is not enough for the chain.
  test.setTimeout(180_000);

  // ---- sign in -------------------------------------------------------------------------
  // The only load in the researcher half. The SPA bootstraps its session here: with testing
  // login enabled it POSTs /chronicle/v3/auth/testing-login and comes back authenticated.
  // Otherwise it renders "Sign-in required" — a working page, but not a working deployment.
  await page.goto(`${APP}/studies`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Create New Study' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Sign-in required')).toBeHidden();
  await expect(page.getByText('Session initialization failed')).toBeHidden();

  // ---- create a study ------------------------------------------------------------------
  await page.getByRole('button', { name: 'Create New Study' }).click();
  const studyDialog = page.getByRole('dialog');
  await studyDialog.getByLabel('Study Name').fill(STUDY_TITLE);
  // The operator-facing identity and participant-policy fields are all required. Supplying
  // them here proves the deployed form accepts a complete, publishable consent policy rather
  // than bypassing the same fail-closed validation a real researcher must satisfy.
  await studyDialog.getByLabel('Contact Email').fill('e2e@chronicle.local');
  await fillRequiredParticipantPolicy(studyDialog, runId);
  // Both features matter downstream: TIME_USE_DIARY is what makes the participant modal issue
  // a diary access code, Android Data Collection is what makes it issue the app-usage one.
  await setStudyFeature(studyDialog, 'Time Use Diary', true);
  await setStudyFeature(studyDialog, 'Data Collection', true);
  await studyDialog.getByRole('button', { name: 'Create Study', exact: true }).click();

  // Success navigates to /chronicle/studies/<uuid>. Waiting on the URL rather than on a toast
  // is what proves the backend actually persisted the study and returned its id.
  await page.waitForURL(/\/chronicle\/studies\/[0-9a-f-]{36}/, { timeout: 60_000 });
  await expect(page.getByText(STUDY_TITLE).first()).toBeVisible({ timeout: 30_000 });

  // ---- enrol a participant ---------------------------------------------------------------
  await page.getByRole('link', { name: 'Participants' }).click();
  await page.getByLabel('New participant ID').fill(PARTICIPANT_ID);
  await page.getByRole('button', { name: 'Register' }).click();
  // The row appearing means the enrollment round-tripped and the list refetched — not merely
  // that the form cleared.
  await expect(page.getByText(PARTICIPANT_ID, { exact: true })).toBeVisible({ timeout: 60_000 });

  // Registering deliberately opens the enrollment dialog with the participant ID already
  // selected, so the researcher does not have to reopen it or type the ID twice. One-time
  // credentials are never minted implicitly: issue the link deliberately, check the QR is
  // really for this participant, then dismiss the dialog the way a researcher would.
  const qrDialog = page.getByRole('dialog');
  await qrDialog.getByRole('button', { name: 'Issue one-time enrollment link' }).click();
  await expect(qrDialog.getByRole('img', { name: new RegExp(PARTICIPANT_ID) })).toBeVisible({ timeout: 30_000 });
  await qrDialog.getByRole('button', { name: 'Close' }).click();
  await expect(qrDialog).toBeHidden();

  // ---- issue the participant's diary link ------------------------------------------------
  await page.getByRole('button', { name: 'More actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Participant Info' }).click();
  const infoDialog = page.getByRole('dialog');

  // Opening this modal makes the app POST form-access-codes for each enabled form. The link
  // only appears once the backend returns a real one-time code; a failure surfaces as the
  // modal's error text instead of this label.
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

  // ---- the participant opens the diary in Spanish ----------------------------------------
  // A fresh context, because a participant is not the researcher: no dashboard session, no
  // sessionStorage, nothing but the one-time link. httpCredentials is still needed, since on
  // this internal listener Caddy gates the whole /chronicle/ prefix.
  const participant = await browser.newContext({
    httpCredentials: { username: basicAuthUser as string, password: basicAuthPassword },
    ignoreHTTPSErrors: true,
  });
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
    await expect(
      participantPage.getByText('Secure participant form'),
      'the one-time diary link must be accepted',
    ).toBeVisible({ timeout: 60_000 });
    await expect(participantPage.getByText('A new link is required')).toBeHidden();

    const body = await participantPage.locator('body').innerText();
    // The translator echoes an unknown key verbatim rather than falling back to English, so a
    // bare snake_case identifier on the page is a missing Spanish translation.
    expect(body, 'no raw translation keys should reach the participant').not.toMatch(
      /\b(intro_text|what_dow|day_of_week|survey_intro)\b/,
    );
    // Positive evidence that the Spanish table — not the English one — is in use.
    expect(body.toLowerCase(), 'the diary should render Spanish copy').toMatch(
      /siguiente|comenzar|continuar|día|hora/,
    );
  } finally {
    await participant.close();
  }
});

test('the public listener serves participants but hides the researcher dashboard', async ({ browser }) => {
  test.skip(!publicBaseUrl, 'set CHRONICLE_E2E_PUBLIC_BASE_URL to check the public listener');

  // A context with NO credentials: this is what the open internet reaches. Reusing the
  // authenticated one would send basic-auth headers and mask the whole point.
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
    const ingest = await page.request.get('/chronicle/v3/study/x/participant/y/datasource');
    expect([401, 403], 'mobile ingest should be gated, not missing').toContain(ingest.status());
  } finally {
    await context.close();
  }
});
