import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { localDay } from '@/lib/format';
import { type Participant, studyOperationsApi } from '@/state/study-operations-api';
import { createApiStore } from '@/test/study-operations-store';
import { ParticipantInfoModal } from './participant-info-modal';

const participant: Participant = {
  candidate: { id: 'candidate-7' },
  participantId: 'participant-7',
  participantTags: [],
  participationStatus: 'ENROLLED',
};

const originalFetch = globalThis.fetch;
const originalRuntimeConfig: unknown = Reflect.get(window, '__CHRONICLE_RUNTIME_CONFIG__');
const originalUrl = window.location.href;
const happyDom = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;

function issuedBody(init?: RequestInit): { formKind: string; logicalDate?: string } {
  return JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { formKind: string; logicalDate?: string };
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  happyDom.setURL(originalUrl);
  Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', originalRuntimeConfig);
  mock.restore();
});

describe('ParticipantInfoModal transport errors', () => {
  test('shows a fixed actionable fallback instead of rejected fetch details', async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new TypeError('W20_PARTICIPANT_NETWORK_SENTINEL')),
    ) as unknown as typeof fetch;

    const store = createApiStore();
    render(
      <Provider store={store}>
        <ParticipantInfoModal
          modules={['CHRONICLE_DATA_COLLECTION']}
          onClose={() => undefined}
          participant={participant}
          studyId="study-7"
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
    expect(
      await screen.findByText(
        'Unable to issue participant links. (could not reach the server; check your connection and try again)',
      ),
    ).toBeDefined();
    expect(screen.queryByText('W20_PARTICIPANT_NETWORK_SENTINEL')).toBeNull();
  });

  test('L7-2 issues Today diary links only for a today-capable study language', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
    const today = new Date();
    const todayDate = localDay(today);
    const yesterdayDate = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));

    for (const language of ['es', 'sv', 'en']) {
      const issued: { formKind: string; logicalDate?: string }[] = [];
      globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
        issued.push(issuedBody(init));
        return Promise.resolve(new Response(JSON.stringify({ accessCode: 'a'.repeat(32) })));
      }) as unknown as typeof fetch;
      const store = createApiStore();
      await store.dispatch(
        studyOperationsApi.util.upsertQueryData('getTimeUseDiarySettings', 'study-7', {
          clockFormat: 24,
          clockFormatLocked: false,
          enableChangesForOhioStateUniversity: false,
          enableChangesForSherbrookeUniversity: false,
          language,
        }),
      );
      render(
        <Provider store={store}>
          <ParticipantInfoModal
            modules={['TIME_USE_DIARY']}
            onClose={() => undefined}
            participant={participant}
            studyId="study-7"
          />
        </Provider>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
      expect(await screen.findByText('TUD — Yesterday')).toBeDefined();
      if (language === 'en') {
        expect(await screen.findByText('TUD — Today')).toBeDefined();
      }
      expect(
        issued
          .filter((request) => request.formKind === 'TIME_USE_DIARY')
          .map((request) => request.logicalDate)
          .sort(),
      ).toEqual(language === 'en' ? [yesterdayDate, todayDate] : [yesterdayDate]);
      if (language !== 'en') {
        expect(screen.queryByText('TUD — Today')).toBeNull();
      }
      const yesterdayLink = screen.getByText(/\/time-use-diary\?.*day=yesterday/).textContent;
      expect(new URL(yesterdayLink ?? '').searchParams.get('date')).toBe(yesterdayDate);
      cleanup();
      store.dispatch(studyOperationsApi.util.resetApiState());
    }
  });

  test('L7-2 issues each code once when diary settings fail first and load on refetch', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
    // The settings query uses a relative URL; about:blank cannot resolve it.
    happyDom.setURL('https://chronicle.example.com/');
    const issued: string[] = [];
    let settingsCalls = 0;
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method === 'GET') {
        settingsCalls += 1;
        if (settingsCalls === 1) return Promise.resolve(new Response('unavailable', { status: 503 }));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              clockFormat: 24,
              clockFormatLocked: false,
              enableChangesForOhioStateUniversity: false,
              enableChangesForSherbrookeUniversity: false,
              language: 'en',
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      issued.push(issuedBody(init).formKind);
      return Promise.resolve(new Response(JSON.stringify({ accessCode: 'a'.repeat(32) })));
    }) as unknown as typeof fetch;
    const store = createApiStore();
    render(
      <Provider store={store}>
        <ParticipantInfoModal
          modules={['TIME_USE_DIARY']}
          onClose={() => undefined}
          participant={participant}
          studyId="study-7"
        />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
    expect(await screen.findByText('TUD — Yesterday')).toBeDefined();
    expect(screen.queryByText('TUD — Today')).toBeNull();

    store.dispatch(studyOperationsApi.util.invalidateTags([{ id: 'study-7', type: 'Study' }]));
    expect(await screen.findByText('TUD — Today')).toBeDefined();
    store.dispatch(studyOperationsApi.util.invalidateTags([{ id: 'study-7', type: 'Study' }]));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(settingsCalls).toBeGreaterThanOrEqual(2);
    expect(issued.sort()).toEqual(['TIME_USE_DIARY', 'TIME_USE_DIARY']);
  });
});

test('a failed diary issuance preserves other links and retries only the failed issuance', async () => {
  Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
  const calls: string[] = [];
  let failDiary = true;
  globalThis.fetch = mock((_input: RequestInfo | URL, init?: RequestInit) => {
    const { formKind } = issuedBody(init);
    calls.push(formKind);
    if (formKind === 'TIME_USE_DIARY' && failDiary) return Promise.resolve(new Response('', { status: 503 }));
    return Promise.resolve(new Response(JSON.stringify({ accessCode: 'a'.repeat(32) })));
  }) as unknown as typeof fetch;
  const store = createApiStore();
  await store.dispatch(
    studyOperationsApi.util.upsertQueryData('getTimeUseDiarySettings', 'study-7', {
      clockFormat: 24,
      clockFormatLocked: false,
      enableChangesForOhioStateUniversity: false,
      enableChangesForSherbrookeUniversity: false,
      language: 'es',
    }),
  );
  render(
    <Provider store={store}>
      <ParticipantInfoModal
        modules={['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY']}
        onClose={() => undefined}
        participant={participant}
        studyId="study-7"
      />
    </Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
  expect(await screen.findByText('App Usage Survey')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  failDiary = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('TUD — Yesterday')).toBeTruthy();
  expect(calls).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY']);
});

test('opening and reopening Info issues form and enrollment codes only after an explicit action', async () => {
  Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
  happyDom.setURL('https://chronicle.example.com/');
  const issued: string[] = [];
  globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (method === 'GET') return Promise.resolve(Response.json({ language: 'en' }));
    issued.push(issuedBody(init).formKind);
    return Promise.resolve(Response.json({ accessCode: 'a'.repeat(32) }));
  }) as unknown as typeof fetch;
  const store = createApiStore();
  const modal = (
    <Provider store={store}>
      <ParticipantInfoModal
        modules={['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY']}
        onClose={() => undefined}
        participant={participant}
        studyId="study-7"
      />
    </Provider>
  );
  render(modal);
  await waitFor(() =>
    expect(
      studyOperationsApi.endpoints.getTimeUseDiarySettings.select('study-7')(store.getState()).data?.language,
    ).toBe('en'),
  );
  expect(issued).toEqual([]);
  cleanup();
  render(modal);
  expect(issued).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
  expect(await screen.findByText('TUD — Today')).toBeTruthy();
  expect(await screen.findByText('TUD — Yesterday')).toBeTruthy();
  expect(await screen.findByText('App Usage Survey')).toBeTruthy();
  expect(issued.sort()).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY']);
  cleanup();
  render(modal);
  expect(issued).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
  await waitFor(() => expect(issued).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY', 'ENROLLMENT']));
  expect(await screen.findByRole('img', { name: /participant-7/ })).toBeTruthy();
  store.dispatch(studyOperationsApi.util.resetApiState());
});
