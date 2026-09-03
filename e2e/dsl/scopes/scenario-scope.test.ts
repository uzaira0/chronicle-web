import { describe, expect, it, mock } from 'bun:test';
import type { Request, Route } from '@playwright/test';

// Re-implement the route handler logic identically to scenario-scope.ts here so
// we can unit-test it without mocking BrowserContext. The handler MUST stay in
// lockstep — ast-grep rule `bootstrap-route-handler-shape` (sgrules) flags
// drift.
function makeBootstrapHandler(userId: string) {
  return async (route: Route, request: Request): Promise<void> => {
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (typeof body.userId === 'string' && body.userId.length > 0) {
      await route.continue();
      return;
    }
    await route.continue({ postData: JSON.stringify({ userId }) });
  };
}

function fakeRoute() {
  const continueMock = mock(() => Promise.resolve());
  const route = { continue: continueMock } as unknown as Route;
  return { route, continueMock };
}

function fakeRequest(method: string, postData: string | null): Request {
  return {
    method: () => method,
    postData: () => postData,
  } as unknown as Request;
}

describe('asUser bootstrap-route handler', () => {
  it('passes through non-POST requests untouched', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('GET', null));
    expect(continueMock).toHaveBeenCalledWith();
  });

  it('passes through POST with an explicit userId untouched', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', JSON.stringify({ userId: 'someone-else' })));
    expect(continueMock).toHaveBeenCalledWith();
  });

  it('rewrites POST with empty body to inject our userId', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', '{}'));
    expect(continueMock).toHaveBeenCalledWith({ postData: JSON.stringify({ userId: 'test_admin' }) });
  });

  it('rewrites POST with no postData (null) to inject our userId', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', null));
    expect(continueMock).toHaveBeenCalledWith({ postData: JSON.stringify({ userId: 'test_admin' }) });
  });

  it('rewrites POST with malformed JSON to inject our userId (does not throw)', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', '{not json'));
    expect(continueMock).toHaveBeenCalledWith({ postData: JSON.stringify({ userId: 'test_admin' }) });
  });

  it('rewrites POST whose body is a JSON array (not an object) to inject our userId', async () => {
    // body.userId is undefined on arrays; the typeof guard correctly falls through to rewrite.
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', '[]'));
    expect(continueMock).toHaveBeenCalledWith({ postData: JSON.stringify({ userId: 'test_admin' }) });
  });

  it('rewrites POST with empty-string userId (treats as missing)', async () => {
    const handler = makeBootstrapHandler('test_admin');
    const { route, continueMock } = fakeRoute();
    await handler(route, fakeRequest('POST', JSON.stringify({ userId: '' })));
    expect(continueMock).toHaveBeenCalledWith({ postData: JSON.stringify({ userId: 'test_admin' }) });
  });
});
