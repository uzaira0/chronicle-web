import { defineConfig, devices } from '@playwright/test';

const proxyBaseUrl = process.env.CHRONICLE_PROXY_BASE_URL ?? 'http://127.0.0.1:4173';
// The upstream the preview server proxies /chronicle/v3 and /chronicle/api/web to. Defaults
// to the same port `DIRECT_BACKEND_URL` in e2e/dsl/constants.ts already assumes, so both
// halves of the suite agree on where the backend is. Boot it with:
//   ./gradlew :chronicle-server:test --tests "*PlaywrightBackendServer*" \
//     -Dchronicle.playwright.backend=true
const backendUrl = process.env.CHRONICLE_BACKEND_URL ?? 'http://localhost:40320';

const targetsSelfhost = process.env.CHRONICLE_E2E_SELFHOST === '1';
if (targetsSelfhost && !process.env.CHRONICLE_PROXY_BASE_URL) {
  throw new Error('CHRONICLE_PROXY_BASE_URL is required for the deployed self-host suite');
}
const selfhostSpec = '**/selfhost-journey.spec.ts';
const ignoredSpecs = targetsSelfhost ? [] : [selfhostSpec];
// Screenshot baselines are versioned only for this project's desktop Chromium environment.
// Other browser projects still discover every nonvisual spec.
const visualRegressionSpec = '**/visual-regression.spec.ts';

export default defineConfig({
  testDir: './e2e',
  // Match only browser specs. Bun unit-tests for DSL plumbing live in `*.test.ts`
  // alongside the code they cover; `bun run test:e2e-dsl` runs those.
  testMatch: targetsSelfhost ? selfhostSpec : '**/*.spec.ts',
  testIgnore: ignoredSpecs,
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
      testIgnore: [...ignoredSpecs, visualRegressionSpec],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      testIgnore: [...ignoredSpecs, visualRegressionSpec],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      testIgnore: [...ignoredSpecs, visualRegressionSpec],
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'tablet',
      testIgnore: [...ignoredSpecs, visualRegressionSpec],
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
          env: { CHRONICLE_BACKEND_URL: backendUrl, PORT: new URL(proxyBaseUrl).port || '80' },
          // Opt in with CHRONICLE_E2E_REUSE_SERVER=1; otherwise fail if the URL is already served.
          reuseExistingServer: process.env.CHRONICLE_E2E_REUSE_SERVER === '1',
          timeout: 180_000,
          url: proxyBaseUrl,
        },
      }),
});
