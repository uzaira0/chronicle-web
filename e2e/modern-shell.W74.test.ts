import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const spec = readFileSync(new URL('./modern-shell.spec.ts', import.meta.url), 'utf8');

describe('W74 modern shell fixtures', () => {
  test('seeds the authenticated study-list request with a specific empty payload', () => {
    expect(spec).toContain("url.pathname === '/chronicle/api/web/study'");
    expect(spec).toContain("route.fulfill({ json: [] })");
    expect(spec).toContain('STABLE_AUTHENTICATED_SESSION');
  });

  test('keeps the novice create action scoped to the empty-catalog status region', () => {
    expect(spec).toContain("test.describe.serial('modern shell first-study flow'");
    expect(spec).toContain("emptyCatalog.getByRole('button', { name: 'Create New Study', exact: true })");
    expect(spec).toContain("page.getByText('E2E User', { exact: true })");
    expect(spec).toContain("page.getByRole('button', { name: 'Sign out' })");
  });

  test('does not mask missing API routes with a catch-all fixture', () => {
    expect(spec).not.toMatch(/page\.route\(\s*['"]\*\*\/chronicle\/api\/web\/\*\*/);
    expect(spec).not.toMatch(/page\.route\(\s*['"]\*\*\/\*['"]/);
  });
});
