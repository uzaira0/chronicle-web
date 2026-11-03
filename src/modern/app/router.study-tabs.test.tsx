import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { isValidElement, Suspense } from 'react';
import { MemoryRouter, matchRoutes, useRoutes } from 'react-router';
import { storeParticipantSessionContext } from '@/lib/participant-access';
import { allStudyTabs } from '@/lib/study-tabs';
import { modernRoutes as routes } from '@/test/route-fixtures';

const notFound = matchRoutes(routes, '/studies/test-study/missing-tab')?.at(-1)?.route.element;

function RoutedApp() {
  return <Suspense fallback={null}>{useRoutes(routes)}</Suspense>;
}

describe('study tab destinations', () => {
  // 'preprocessing' linked a hosted third-party app; the self-host dashboard serves no such page.
  test.each(['missing-tab', 'preprocessing'])('/%s resolves to the NotFound element', (tab) => {
    expect(isValidElement(notFound)).toBe(true);
    expect(matchRoutes(routes, `/studies/test-study/${tab}`)?.at(-1)?.route.path).toBe('*');
  });

  test.each([...allStudyTabs])('$labelKey resolves to a real study route', ({ to }) => {
    const matches = matchRoutes(routes, `/studies/test-study/${to}`);
    expect(matches?.some(({ route }) => route.path === 'studies/:studyId')).toBe(true);
    const target = matches?.at(-1)?.route;
    const element = target?.element;
    expect(isValidElement(element) && isValidElement(notFound) && element.type !== notFound.type).toBe(true);
    expect(target?.path).not.toBe('*');
    expect(target?.index ? '' : target?.path).toBe(to);
  });
});

// The participant portal link (/participant) is loaded on demand: through the shipped route table it reaches the
// submission-history page for the signed-in participant, not the researcher dashboard.
describe('participant portal route', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
  });

  test('opens the participant history page for a participant session', async () => {
    storeParticipantSessionContext({
      csrfToken: 'portal-csrf',
      expiresAt: '2099-01-01T00:00:00Z',
      formKind: 'PORTAL',
      participantId: 'p1',
      studyId: 's1',
    });
    const requested: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      requested.push(String(input instanceof Request ? input.url : input));
      return Promise.resolve(Response.json({}));
    }) as unknown as typeof fetch;
    render(
      <MemoryRouter initialEntries={['/participant?studyId=s1&participantId=p1']}>
        <RoutedApp />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText('No time-use diary submissions were found for the recent 90-day window.'),
    ).toBeTruthy();
    expect(screen.queryByText('Researcher sign in')).toBeNull();
    expect(requested.length).toBeGreaterThan(0);
  });
});
