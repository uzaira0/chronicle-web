import { describe, expect, test } from 'bun:test';
import { routeFetch } from './http-fixtures';

describe('routeFetch', () => {
  test('routes by path and method and preserves query, headers and body for stateful handlers', async () => {
    let calls = 0;
    const fetch = routeFetch({
      'GET /fixture': () => Response.json({ calls: ++calls }),
      'POST /fixture': async (request) =>
        Response.json({
          query: new URL(request.url).searchParams.get('page'),
          header: request.headers.get('x-fixture'),
          body: (await request.json()) as unknown,
        }),
    });
    expect(await (await fetch('/fixture')).json()).toEqual({ calls: 1 });
    expect(await (await fetch('/fixture')).json()).toEqual({ calls: 2 });
    const response = await fetch(
      new Request('/fixture?page=2', {
        method: 'POST',
        headers: { 'x-fixture': 'present' },
        body: JSON.stringify({ title: 'saved' }),
      }),
    );
    expect(await response.json()).toEqual({ query: '2', header: 'present', body: { title: 'saved' } });
  });

  test('rejects unexpected paths and methods rather than returning a default response', async () => {
    const fetch = routeFetch({ 'GET /fixture': () => Response.json({}) });
    expect(await fetch('/missing').catch((error: unknown) => error)).toEqual(
      new Error('Unexpected request: GET /missing'),
    );
    expect(await fetch('/fixture', { method: 'DELETE' }).catch((error: unknown) => error)).toEqual(
      new Error('Unexpected request: DELETE /fixture'),
    );
  });
});
