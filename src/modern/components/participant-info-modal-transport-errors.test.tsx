import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import english from '@/i18n/en/translation.json';
import { localDay } from '@/lib/format';
import { type Participant, studyOperationsApi } from '@/state/study-operations-api';
import { routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { ParticipantInfoModal } from './participant-info-modal';

type IssuedForm = { formKind: string; logicalDate?: string };

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
      Promise.reject(new TypeError('PARTICIPANT_NETWORK_SENTINEL')),
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
    expect(screen.queryByText('PARTICIPANT_NETWORK_SENTINEL')).toBeNull();
  });

  test('issues Today diary links only for a today-capable study language', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
    const today = new Date();
    const todayDate = localDay(today);
    const yesterdayDate = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));

    for (const language of ['es', 'sv', 'en']) {
      const issued: IssuedForm[] = [];
      globalThis.fetch = routeFetch({
        'POST /chronicle/api/web/study/study-7/participant/participant-7/form-access-codes': async (request) => {
          issued.push((await request.json()) as IssuedForm);
          return Response.json({ accessCode: 'a'.repeat(32) });
        },
      });
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

  test('issues each code once when diary settings fail first and load on refetch', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
    // The settings query uses a relative URL; about:blank cannot resolve it.
    happyDom.setURL('https://chronicle.example.com/');
    const issued: string[] = [];
    let settingsCalls = 0;
    globalThis.fetch = routeFetch({
      'GET /chronicle/v3/time-use-diary/study-7/settings': () => {
        settingsCalls += 1;
        return settingsCalls === 1
          ? new Response('unavailable', { status: 503 })
          : Response.json({
              clockFormat: 24,
              clockFormatLocked: false,
              enableChangesForOhioStateUniversity: false,
              enableChangesForSherbrookeUniversity: false,
              language: 'en',
            });
      },
      'POST /chronicle/api/web/study/study-7/participant/participant-7/form-access-codes': async (request) => {
        issued.push(((await request.json()) as IssuedForm).formKind);
        return Response.json({ accessCode: 'a'.repeat(32) });
      },
    });
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
  globalThis.fetch = routeFetch({
    'POST /chronicle/api/web/study/study-7/participant/participant-7/form-access-codes': async (request) => {
      const body = (await request.json()) as IssuedForm & { logicalDate?: string };
      const { formKind } = body;
      calls.push(formKind);
      // The survey code is not bound to the researcher's own calendar day.
      if (formKind === 'APP_USAGE') expect(body.logicalDate).toBeUndefined();
      if (formKind === 'TIME_USE_DIARY' && failDiary) return new Response('', { status: 503 });
      return Response.json({ accessCode: 'a'.repeat(32) });
    },
  });
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
  expect(await screen.findByText('App usage survey')).toBeTruthy();
  expect(screen.getByRole('alert')).toBeTruthy();
  failDiary = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('TUD — Yesterday')).toBeTruthy();
  expect(calls).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY']);
  const surveyLink = [...document.querySelectorAll('code')]
    .map((code) => code.textContent ?? '')
    .find((value) => value.includes('/survey?'));
  if (!surveyLink) throw new Error('No survey link issued');
  expect(new URL(surveyLink).searchParams.has('date')).toBe(false);
});

test('opening and reopening Info issues form and enrollment codes only after an explicit action', async () => {
  Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://chronicle.example.com' });
  happyDom.setURL('https://chronicle.example.com/');
  const issued: string[] = [];
  globalThis.fetch = routeFetch({
    'GET /chronicle/v3/time-use-diary/study-7/settings': () => Response.json({ language: 'en' }),
    // No enrollment link was sent yet, so the QR dialog issues one.
    'GET /chronicle/api/web/study/study-7/participant/participant-7/enrollment-code': () =>
      new Response('', { status: 404 }),
    'POST /chronicle/api/web/study/study-7/participant/participant-7/form-access-codes': async (request) => {
      issued.push(((await request.json()) as IssuedForm).formKind);
      return Response.json({ accessCode: 'a'.repeat(32) });
    },
  });
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
  expect(await screen.findByText('App usage survey')).toBeTruthy();
  expect(issued.sort()).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY']);
  cleanup();
  render(modal);
  expect(issued).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
  await waitFor(() => expect(issued).toEqual(['APP_USAGE', 'TIME_USE_DIARY', 'TIME_USE_DIARY', 'ENROLLMENT']));
  expect(await screen.findByRole('img', { name: /participant-7/ })).toBeTruthy();
  store.dispatch(studyOperationsApi.util.resetApiState());
});

// The server issues the survey code, but this deployment has no public HTTPS server URL to build the participant's
// link on: the modal names the configuration problem instead of failing silently or showing a broken link.
test('a deployment without a public server URL reports why no survey link can be shown', async () => {
  Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
  const issued: string[] = [];
  globalThis.fetch = routeFetch({
    'POST /chronicle/api/web/study/study-7/participant/participant-7/form-access-codes': async (request) => {
      issued.push(((await request.json()) as IssuedForm).formKind);
      return Response.json({ accessCode: 'a'.repeat(32) });
    },
  });
  const store = createApiStore();
  let closed = 0;
  render(
    <Provider store={store}>
      <ParticipantInfoModal
        modules={['CHRONICLE_DATA_COLLECTION']}
        onClose={() => {
          closed++;
        }}
        participant={participant}
        studyId="study-7"
      />
    </Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Issue participant form links' }));
  expect(await screen.findByText(english.participant_access.missing_server)).toBeTruthy();
  expect(issued).toEqual(['APP_USAGE']);
  expect(screen.queryAllByText((text) => text.includes('/survey?')).length).toBe(0);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(closed).toBe(1);
  store.dispatch(studyOperationsApi.util.resetApiState());
});
