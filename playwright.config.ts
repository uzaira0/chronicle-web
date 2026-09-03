import { defineConfig, devices } from '@playwright/test';

const proxyBaseUrl = process.env.CHRONICLE_PROXY_BASE_URL ?? 'http://127.0.0.1:4173';
// The upstream the preview server proxies /chronicle/v3 and /chronicle/api/web to. Defaults
// to the same port `DIRECT_BACKEND_URL` in e2e/dsl/constants.ts already assumes, so both
// halves of the suite agree on where the backend is. Boot it with:
//   ./gradlew :chronicle-server:test --tests "*PlaywrightBackendServer*" \
//     -Dchronicle.playwright.backend=true
const backendUrl = process.env.CHRONICLE_BACKEND_URL ?? 'http://localhost:40320';

// Targeting a running self-host deployment instead of the local dev build. Two things differ
// there and both are fatal if unhandled:
//
//   1. The dashboard sits behind Caddy basic_auth (chronicle_dashboard_gate), so every
//      request — including the very first document load — needs credentials or returns 401.
//   2. The internal listener serves a self-signed certificate minted by cert-init, which the
//      browser refuses without ignoreHTTPSErrors.
//
// Setting the user is what switches this on; it also suppresses the webServer block, because
// there is already a server and `bun run build && bun run serve` would fight it for the port.
const selfhostUser = process.env.CHRONICLE_E2E_BASIC_AUTH_USER;
const selfhostPassword = process.env.CHRONICLE_E2E_BASIC_AUTH_PASSWORD;
const targetsSelfhost = Boolean(selfhostUser);
// Screenshot baselines are versioned only for this project's desktop Chromium environment.
// Other browser projects still discover every nonvisual spec.
const visualRegressionSpec = '**/visual-regression.spec.ts';

export default defineConfig({
  testDir: './e2e',
  // Match only browser specs. Bun unit-tests for DSL plumbing live in `*.test.ts`
  // alongside the code they cover; `bun run test:e2e-dsl` runs those.
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: proxyBaseUrl,
    trace: 'retain-on-failure',
    ...(targetsSelfhost
      ? {
          httpCredentials: { username: selfhostUser as string, password: selfhostPassword ?? '' },
          ignoreHTTPSErrors: true,
        }
      : {}),
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      testIgnore: visualRegressionSpec,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      testIgnore: visualRegressionSpec,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: visualRegressionSpec,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'tablet',
      testIgnore: visualRegressionSpec,
      use: { ...devices['iPad Mini'] },
    },
  ],
  // Omitted entirely when pointed at a self-host deployment: that URL is already served by
  // Caddy, and starting a second server here would either fail on the port or, worse,
  // silently serve a locally-built SPA while the tests believe they are exercising the
  // deployed one.
  ...(targetsSelfhost
    ? {}
    : {
        webServer: {
          command: 'bun run build && bun run serve',
          // Without this the preview server has no upstream, so every /chronicle/v3 and
          // /chronicle/api/web request 404s and the specs that talk to the API
          // (persona-adversary-api, the study/questionnaire UI specs, everything under
          // e2e/scenarios) fail on a dead backend rather than on anything they were written
          // to catch.
          env: { CHRONICLE_BACKEND_URL: backendUrl },
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          url: proxyBaseUrl,
        },
      }),
});
