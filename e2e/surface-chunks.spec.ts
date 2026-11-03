import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { BUILD_METAFILE_PATH } from '../scripts/build-artifacts';
import { SESSION_PATH, STABLE_AUTHENTICATED_SESSION } from './dsl/constants';
import { expect, test } from './fixtures/browser-test';
import { seedStudyRoutes } from './fixtures/study-api';

const surfaces = [
  { path: '/enroll', input: 'routes/public-enrollment-page.tsx', heading: 'Review your study invitation' },
  { path: '/reviewer', input: 'routes/reviewer-enrollment-page.tsx', heading: 'Reviewer enrollment' },
  { path: '/', input: 'app/router.tsx', heading: 'Operations overview' },
];

for (const surface of surfaces) {
  test(`${surface.path} downloads only its application surface`, async ({ page }) => {
    const metadata = JSON.parse(readFileSync(BUILD_METAFILE_PATH, 'utf8')) as Bun.BuildMetafile;
    const scripts = new Set<string>();
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.add(basename(new URL(request.url()).pathname));
    });
    await seedStudyRoutes(page);
    await page.route(`**${SESSION_PATH}`, (route) => route.fulfill({ json: STABLE_AUTHENTICATED_SESSION }));
    await page.goto(surface.path);
    await expect(page.getByRole('heading', { name: surface.heading })).toBeVisible();
    for (const candidate of surfaces) {
      const chunks = Object.entries(metadata.outputs).filter(([, output]) =>
        Object.keys(output.inputs).some((input) => input.endsWith(candidate.input)));
      expect(chunks.length, `build output for ${candidate.input}`).toBeGreaterThan(0);
      expect(chunks.some(([output]) => scripts.has(basename(output))), candidate.input).toBe(candidate === surface);
    }
  });
}
