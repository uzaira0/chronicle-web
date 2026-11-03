import { describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CheckCircle2 } from 'lucide-react';

import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { PARTICIPANT_FORM_DATE_HEADER } from '@/generated/chronicle-contracts';
import { getCurrentLanguage, LanguageProvider } from '@/i18n';
import english from '@/i18n/en/translation.json';
import spanish from '@/i18n/es/translation.json';
import { createTranslator } from '@/i18n/translator';
import { storeParticipantSessionContext } from '@/lib/participant-access';
import { SurveyRoutePage } from '@/routes/survey-page';
import type { AppUsageAnswer, AppUsageDayApp, AppUsageDaySurvey } from '@/state/study-operations-api';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { AppUsageStatusCard } from './app-usage-survey';
import { HOURLY_SURVEY_USER } from './hourly-survey-core';
import { ParticipantHourlySurveyForm } from './participant-hourly-survey-form';
import {
  APP_USAGE_NONE_OPTION,
  APP_USAGE_USER_OPTIONS,
  AppUsageRow,
  ParticipantSurveyForm,
} from './participant-survey-form';

const DAY = '2026-06-01';
const OTHER_DAY = '2026-06-02';
const dayBlock = { start: '2026-06-01T00:00:00-04:00', end: '2026-06-02T00:00:00-04:00' };
const youtube: AppUsageDayApp = {
  appLabel: 'YouTube',
  appPackageName: 'com.google.android.youtube',
  blocks: [dayBlock],
};
const chrome: AppUsageDayApp = { appLabel: 'Chrome', appPackageName: 'com.android.chrome', blocks: [dayBlock] };
const answeredYoutube: AppUsageDayApp = { ...youtube, blocks: [{ ...dayBlock, users: ['Parent alone'] }] };
const survey = (apps: AppUsageDayApp[], state: AppUsageDaySurvey['state'] = 'UNANSWERED'): AppUsageDaySurvey => ({
  apps,
  date: DAY,
  state,
  timeZone: 'America/Santiago',
});
const answer = (app: AppUsageDayApp, users: string[]): AppUsageAnswer => ({
  appPackageName: app.appPackageName,
  blockStart: dayBlock.start,
  users,
});

type Write = { body: AppUsageAnswer[]; dateHeader: string | null; day: string | null; key: string | null };

/**
 * Renders a survey form against routed fetches; returns what it wrote and how often it read the day. `reload`
 * stands for a page reload: a fresh mount and store, with the tab's sessionStorage kept.
 */
async function withSurvey(
  options: {
    hourly?: boolean;
    lang?: string;
    page?: boolean;
    read: (date: string) => AppUsageDaySurvey;
    write?: (body: AppUsageAnswer[], key: string | null) => Response | Promise<Response>;
  },
  run: (
    writes: Write[],
    reads: () => number,
    store: ReturnType<typeof createApiStore>,
    reload: () => void,
  ) => Promise<void>,
) {
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  const stores = [store];
  const writes: Write[] = [];
  let reads = 0;
  globalThis.fetch = routeFetch({
    'GET /chronicle/v3/survey/s1/participant/p1/app-usage': (request) => {
      reads += 1;
      const date = new URL(request.url).searchParams.get('date') ?? '';
      expect(options.page ? [DAY, OTHER_DAY] : [DAY]).toContain(date);
      return Response.json(options.read(date));
    },
    'GET /chronicle/v3/survey/s1/app-usage-frequency': () =>
      Response.json({ appUsageFrequency: options.hourly ? 'HOURLY' : 'DAILY' }),
    'GET /chronicle/v3/survey/s1/participant/p1/app-usage/days': () =>
      Response.json({
        days: [DAY, OTHER_DAY].map((date) => ({ date, state: options.read(date).state })),
        timeZone: 'America/Santiago',
        today: '2026-06-03',
      }),
    'POST /chronicle/v3/survey/s1/participant/p1/app-usage': async (request) => {
      const body = (await request.json()) as AppUsageAnswer[];
      writes.push({
        body,
        dateHeader: request.headers.get(PARTICIPANT_FORM_DATE_HEADER),
        day: new URL(request.url).searchParams.get('date'),
        key: request.headers.get('Idempotency-Key'),
      });
      return options.write?.(body, request.headers.get('Idempotency-Key')) ?? Response.json({});
    },
  });
  const Form = options.hourly ? ParticipantHourlySurveyForm : ParticipantSurveyForm;
  const mount = (target: ReturnType<typeof createApiStore>) => {
    const view = (
      <Provider store={target}>
        {options.page ? (
          <MemoryRouter initialEntries={[`/survey?studyId=s1&participantId=p1&date=${DAY}`]}>
            <SurveyRoutePage />
          </MemoryRouter>
        ) : (
          <Form date={DAY} participantId="p1" studyId="s1" />
        )}
      </Provider>
    );
    return render(
      options.lang ? <LanguageProvider initialSearch={`?lang=${options.lang}`}>{view}</LanguageProvider> : view,
    );
  };
  const reload = () => {
    cleanup();
    const next = createApiStore();
    stores.push(next);
    mount(next);
  };
  try {
    mount(store);
    await run(writes, () => reads, store, reload);
  } finally {
    cleanup();
    // The provider remembers its language; later tests start from English again.
    if (options.lang) render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>).unmount();
    for (const target of stores) target.dispatch(studyOperationsApi.util.resetApiState());
    window.sessionStorage.clear();
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit survey' }));

describe('ParticipantSurveyForm - AppUsageRow', () => {
  test('renders the app label and every user option plus the none option', () => {
    render(<AppUsageRow app={youtube} index={0} onToggle={() => {}} selection={[]} />);

    expect(screen.getByText('YouTube')).toBeTruthy();
    for (const option of APP_USAGE_USER_OPTIONS) {
      expect(screen.getByLabelText(option)).toBeTruthy();
    }
    expect(screen.getByLabelText(APP_USAGE_NONE_OPTION)).toBeTruthy();
  });

  test('resolves option labels through the translator while submitting the canonical English value', () => {
    const onToggle = mock(() => {});
    render(
      <AppUsageRow app={youtube} index={0} onToggle={onToggle} selection={[]} translator={createTranslator('es')} />,
    );

    fireEvent.click(screen.getByLabelText('Solo hijo/a'));
    expect(onToggle).toHaveBeenCalledWith('com.google.android.youtube', 'Child alone', true);
  });

  test('falls back to the package name when there is no label', () => {
    render(<AppUsageRow app={{ ...youtube, appLabel: '' }} index={3} onToggle={() => {}} selection={[]} />);
    expect(screen.getByText('com.google.android.youtube')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  test('reflects the current selection and reports toggles with the app package', () => {
    const onToggle = mock(() => {});
    render(<AppUsageRow app={youtube} index={2} onToggle={onToggle} selection={['Child alone']} />);

    expect(screen.getByLabelText<HTMLInputElement>('Child alone').checked).toBe(true);
    const parentAlone = screen.getByLabelText<HTMLInputElement>('Parent alone');
    expect(parentAlone.checked).toBe(false);
    fireEvent.click(parentAlone);
    expect(onToggle).toHaveBeenCalledWith('com.google.android.youtube', 'Parent alone', true);
  });
});

test('daily form answers the day it was opened on, by block, and binds no day to the session', async () => {
  await withSurvey({ read: () => survey([youtube]) }, async (writes) => {
    expect(await screen.findByText('Jun 1, 2026')).toBeTruthy();
    fireEvent.click(await screen.findByLabelText('Child alone'));
    submit();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
    expect(writes).toHaveLength(1);
    expect(writes[0]?.day).toBe(DAY);
    expect(writes[0]?.dateHeader).toBeNull();
    expect(writes[0]?.key).toBeTruthy();
    expect(writes[0]?.body).toEqual([answer(youtube, ['Child alone'])]);
  });
});

// "I don't know" is an answer the study keeps, under the canonical value the export documents
// (docs/PILOT-DATA.md: `users` such as {"Parent alone","I don't know"}).
test("an I don't know answer is stored, not dropped", async () => {
  await withSurvey({ read: () => survey([youtube]) }, async (writes) => {
    fireEvent.click(await screen.findByLabelText(english.app_usage_survey.user_options.dont_know));
    submit();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual([answer(youtube, ["I don't know"])]);
  });
});

// A pilot participant reads the daily survey questions and controls in Spanish (the shipped
// es catalog, no English fallback or raw key); the stored answer stays the canonical English value.
test('the daily survey asks and submits in Spanish', async () => {
  const es = spanish.app_usage_survey;
  const en = english.app_usage_survey;
  const storedPreferences = Object.entries(window.localStorage);
  await withSurvey({ lang: 'es', read: () => survey([youtube]) }, async (writes) => {
    expect(await screen.findByText(es.daily_instructions)).toBeTruthy();
    expect(screen.getByRole('heading', { name: es.title })).toBeTruthy();
    for (const label of Object.values(es.user_options)) expect(screen.getByLabelText(label)).toBeTruthy();
    for (const label of Object.values(en.user_options)) expect(screen.queryByLabelText(label)).toBeNull();
    const text = document.body.textContent ?? '';
    for (const englishText of [en.daily_instructions, en.title, en.submit_survey])
      expect(text).not.toContain(englishText);
    expect(text).not.toMatch(/app_usage_survey\.|\{\{/);
    fireEvent.click(screen.getByLabelText(es.user_options.child_alone));
    fireEvent.click(screen.getByRole('button', { name: es.submit_survey }));
    expect(await screen.findByRole('heading', { name: es.thank_you_title })).toBeTruthy();
    expect(writes[0]?.body).toEqual([answer(youtube, ['Child alone'])]);
  });
  expect(getCurrentLanguage()).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(document.documentElement.dir).toBe('ltr');
  expect(Object.entries(window.localStorage)).toEqual(storedPreferences);
});

// A late upload reopens the day for its new apps only; the answered app is shown, not asked again.
test('answered apps are read-only and only the new apps are asked', async () => {
  await withSurvey({ read: () => survey([answeredYoutube, chrome], 'NEW_APPS') }, async (writes) => {
    expect(await screen.findByText('YouTube')).toBeTruthy();
    expect(screen.getAllByLabelText('Child alone')).toHaveLength(1);
    fireEvent.click(screen.getByLabelText('Child alone'));
    submit();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual([answer(chrome, ['Child alone'])]);
  });
});

// A day with nothing to review is confirmed and stored, so it stops being an unanswered day.
test.each([false, true])('a day with no apps is confirmed with an empty answer (hourly=%s)', async (hourly) => {
  await withSurvey({ hourly, read: () => survey([]) }, async (writes) => {
    expect(await screen.findByText('Nothing to review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual([]);
  });
});

// A failed empty-day confirmation shows the same alert as the answer form, and Confirm retries it.
test.each([false, true])('a failed empty-day confirmation is reported and retried (hourly=%s)', async (hourly) => {
  let status = 503;
  await withSurvey(
    { hourly, read: () => survey([]), write: () => Response.json({ message: 'Unavailable' }, { status }) },
    async (writes) => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/server is temporarily busy or unavailable/);
      status = 200;
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
      expect(writes.map((write) => write.body)).toEqual([[], []]);
    },
  );
});

test.each([false, true])('an answered day with no apps asks nothing (hourly=%s)', async (hourly) => {
  await withSurvey({ hourly, read: () => survey([], 'ANSWERED') }, async (writes) => {
    expect(await screen.findByText('This day is answered')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(writes).toHaveLength(0);
  });
});

test.each([false, true])(
  'an ordinary answered day shows stored answers without a failure (hourly=%s)',
  async (hourly) => {
    await withSurvey({ hourly, read: () => survey([answeredYoutube], 'ANSWERED') }, async (writes) => {
      expect(await screen.findByText('This day is answered')).toBeTruthy();
      expect(screen.getByText(/Parent alone/)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Submit survey' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Begin survey' })).toBeNull();
      expect(writes).toHaveLength(0);
    });
  },
);

// A day changed under the open page is a conflict the page explains and reloads, never "try again later".
test('a changed day is explained and reloaded so the new apps can be answered', async () => {
  let apps = [youtube];
  let status = 409;
  await withSurvey(
    {
      read: () => survey(apps),
      write: () => Response.json({ code: 'APPS_CHANGED', message: 'Conflict' }, { status }),
    },
    async (writes, reads) => {
      fireEvent.click(await screen.findByLabelText('Child alone'));
      const before = reads();
      apps = [youtube, chrome];
      submit();
      expect(await screen.findByText(/The apps for this day changed/)).toBeTruthy();
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
      await waitFor(() => expect(screen.getAllByLabelText('Parent alone')).toHaveLength(2));
      status = 200;
      fireEvent.click(screen.getAllByLabelText('Parent alone')[1] as HTMLElement);
      submit();
      await waitFor(() => expect(writes).toHaveLength(2));
      const byApp = (rows: AppUsageAnswer[]) =>
        [...rows].sort((a, b) => a.appPackageName.localeCompare(b.appPackageName));
      expect(byApp(writes[1]?.body ?? [])).toEqual(
        byApp([answer(youtube, ['Child alone']), answer(chrome, ['Parent alone'])]),
      );
      expect(writes[1]?.key).not.toBe(writes[0]?.key);
    },
  );
});

// The other two structured conflicts. Another tab answered the day first: the page shows the stored
// answers read-only and never resends its own. The day stopped being answerable: the page says so, releases the
// frozen answers, and a later submission is a new one (fresh idempotency key), not a replay.
test.each([false, true])(
  'a day answered elsewhere shows the stored answers and is not resubmitted (hourly=%s)',
  async (hourly) => {
    let stored: string[] | null = null;
    await withSurvey(
      {
        hourly,
        read: () =>
          stored ? survey([{ ...youtube, blocks: [{ ...dayBlock, users: stored }] }], 'ANSWERED') : survey([youtube]),
        write: () => {
          stored = ['Parent alone'];
          return Response.json({ code: 'ALREADY_ANSWERED', message: 'Conflict' }, { status: 409 });
        },
      },
      async (writes) => {
        if (hourly) {
          fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
          fireEvent.click(screen.getByLabelText('YouTube'));
          fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        } else {
          fireEvent.click(await screen.findByLabelText('Child alone'));
        }
        submit();
        expect(await screen.findByText('This day was already answered. Its answers are shown.')).toBeTruthy();
        expect(screen.getByText('This day is answered')).toBeTruthy();
        expect(screen.getByText(/Parent alone/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Submit survey' })).toBeNull();
        expect(writes).toHaveLength(1);
      },
    );
  },
);

test('an unavailable day releases the frozen answers and a later submission uses a new key', async () => {
  let status = 409;
  await withSurvey(
    {
      read: () => survey([youtube]),
      write: () =>
        status === 409
          ? Response.json({ code: 'DAY_UNAVAILABLE', message: 'Conflict' }, { status })
          : Response.json({}),
    },
    async (writes) => {
      fireEvent.click(await screen.findByLabelText('Child alone'));
      submit();
      expect(await screen.findByText("This day can't be answered. Choose another day.")).toBeTruthy();
      await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Parent alone').disabled).toBe(false));
      status = 200;
      fireEvent.click(screen.getByLabelText('Parent alone'));
      submit();
      await waitFor(() => expect(writes).toHaveLength(2));
      expect(writes[1]?.body).toEqual([answer(youtube, ['Child alone', 'Parent alone'])]);
      expect(writes[0]?.key).toBeTruthy();
      expect(writes[1]?.key).toBeTruthy();
      expect(writes[1]?.key).not.toBe(writes[0]?.key);
      expect(writes.map((write) => write.day)).toEqual([DAY, DAY]);
    },
  );
});

test.each([false, true])('app-usage submission recovery retains answers (hourly=%s)', async (hourly) => {
  storeParticipantSessionContext({
    csrfToken: 'form-csrf',
    expiresAt: '2099-01-01T00:00:00Z',
    formKind: 'APP_USAGE',
    participantId: 'p1',
    studyId: 's1',
  });
  let status = 401;
  let apps = [youtube];
  await withSurvey(
    {
      hourly,
      read: () => survey(apps),
      write: () => Response.json({ message: 'Review the selected users.' }, { status }),
    },
    async (writes, _reads, store) => {
      if (hourly) {
        fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
        fireEvent.click(screen.getByLabelText('YouTube'));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      } else {
        fireEvent.click(await screen.findByLabelText('Child alone'));
      }
      submit();
      expect(
        await screen.findByText(/Ask your study team to check your participation or provide a fresh link/),
      ).toBeTruthy();
      // A refresh that lists more apps must not change what the pending submission sends.
      apps = [youtube, chrome];
      await act(async () => {
        const args = studyOperationsApi.util.selectCachedArgsForQuery(store.getState(), 'getAppUsageDaySurvey')[0];
        if (!args) throw new Error('Missing survey subscription');
        const query = store.dispatch(
          studyOperationsApi.endpoints.getAppUsageDaySurvey.initiate(args, { forceRefetch: true }),
        );
        await query.unwrap();
        query.unsubscribe();
      });
      expect(screen.queryByText('Chrome')).toBeNull();
      status = 422;
      submit();
      expect(await screen.findByText('Review the selected users.')).toBeTruthy();
      status = 503;
      submit();
      expect(await screen.findByText(/server is temporarily busy or unavailable/)).toBeTruthy();
      expect(writes).toHaveLength(3);
      expect(writes[1]?.body).toEqual(writes[0]?.body);
      expect(writes[2]?.body).toEqual(writes[0]?.body);
      // The same submission each time: a 503 that hid a committed write is deduplicated by the server.
      expect(writes[0]?.key).toBeTruthy();
      expect(writes[1]?.key).toBe(writes[0]?.key);
      expect(writes[2]?.key).toBe(writes[0]?.key);
    },
  );
});

/** The server's receipt rule: one completed payload per Idempotency-Key; a different payload under it is a 409. */
function receiptServer(respond: (body: AppUsageAnswer[]) => Response | undefined) {
  const receipts = new Map<string, string>();
  return (body: AppUsageAnswer[], key: string | null) => {
    const payload = JSON.stringify(body);
    const prior = key ? receipts.get(key) : undefined;
    if (prior !== undefined)
      return prior === payload
        ? Response.json({})
        : Response.json(
            { message: 'This form resource already has a different completed submission' },
            { status: 409 },
          );
    // A response here commits nothing (the request failed before the receipt was stored).
    const failed = respond(body);
    if (failed) return failed;
    if (key) receipts.set(key, payload);
    return Response.json({});
  };
}

// The replayed success retires the attempt only when the calendar's NEW_APPS day is opened again, and the
// new apps are a new attempt with a key of their own.
test('a mounted retry replays the committed receipt after its response was lost and new apps arrived', async () => {
  const commit = mock(() => undefined);
  const server = receiptServer(commit);
  let lost = true;
  const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  const confirm = mock(() => false);
  window.confirm = confirm;
  await withSurvey(
    {
      page: true,
      read: () => (lost ? survey([youtube]) : survey([answeredYoutube, chrome], 'NEW_APPS')),
      write: (body, key) => {
        const response = server(body, key);
        if (!lost) return response;
        lost = false;
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      },
    },
    async (writes, reads, store) => {
      fireEvent.click(await screen.findByLabelText('Child alone'));
      submit();
      expect(await screen.findByText(/server is temporarily busy or unavailable/)).toBeTruthy();
      const before = reads();
      act(() => {
        store.dispatch(studyOperationsApi.util.invalidateTags(['AppUsageSurvey']));
      });
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
      expect(screen.queryByText('Chrome')).toBeNull();
      submit();
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
      expect(commit).toHaveBeenCalledTimes(1);
      expect(writes).toHaveLength(2);
      expect(writes[0]?.body).toEqual([answer(youtube, ['Child alone'])]);
      expect(writes[1]).toEqual(writes[0]);
      fireEvent.click(await screen.findByRole('button', { name: 'Jun 1, 2026: New apps to answer' }));
      expect(await screen.findByText('Chrome')).toBeTruthy();
      expect(screen.getAllByLabelText('Parent alone')).toHaveLength(1);
      fireEvent.click(screen.getByLabelText('Parent alone'));
      submit();
      expect(await screen.findByRole('heading', { name: 'Thank you' })).toBeTruthy();
      expect(writes).toHaveLength(3);
      expect(confirm).not.toHaveBeenCalled();
      expect(commit).toHaveBeenCalledTimes(2);
      expect(writes[2]?.day).toBe(DAY);
      expect(writes[2]?.body).toEqual([answer(chrome, ['Parent alone'])]);
      expect(writes[2]?.key).toBeTruthy();
      expect(writes[2]?.key).not.toBe(writes[0]?.key);
    },
  ).finally(() => {
    if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
    else Reflect.deleteProperty(window, 'confirm');
  });
});

test.each([false, true])(
  'double-clicking submits only once while confirmation is pending (empty=%s)',
  async (empty) => {
    const response = Promise.withResolvers<Response>();
    await withSurvey(
      { page: true, read: () => survey(empty ? [] : [youtube]), write: () => response.promise },
      async (writes) => {
        if (!empty) fireEvent.click(await screen.findByLabelText('Child alone'));
        const name = empty ? 'Confirm' : 'Submit survey';
        const button = await screen.findByRole<HTMLButtonElement>('button', { name });
        fireEvent.click(button);
        fireEvent.click(button);
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(button.disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Jun 1, 2026: Not answered' }));
        expect(screen.getByRole<HTMLButtonElement>('button', { name: empty ? name : 'Submitting…' }).disabled).toBe(
          true,
        );
        response.resolve(Response.json({}));
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
        expect(writes).toHaveLength(1);
      },
    ).finally(() => response.resolve(Response.json({})));
  },
);

test.each([false, true])('selecting the open day preserves a failed empty-day attempt (hourly=%s)', async (hourly) => {
  const commit = mock(() => undefined);
  const server = receiptServer(commit);
  let lost = true;
  await withSurvey(
    {
      hourly,
      page: true,
      read: () => (lost ? survey([]) : survey([chrome], 'NEW_APPS')),
      write: (body, key) => {
        const response = server(body, key);
        if (!lost) return response;
        lost = false;
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      },
    },
    async (writes, _reads, store) => {
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
      expect(await screen.findByRole('alert')).toBeTruthy();
      act(() => {
        store.dispatch(studyOperationsApi.util.invalidateTags(['AppUsageSurvey']));
      });
      fireEvent.click(await screen.findByRole('button', { name: 'Jun 1, 2026: New apps to answer' }));
      expect(screen.queryByText('Chrome')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(await screen.findByRole('heading', { name: 'Thank you' })).toBeTruthy();
      expect(writes).toHaveLength(2);
      expect(writes[0]?.body).toEqual([]);
      expect(writes[0]?.key).toBeTruthy();
      expect(writes[1]).toEqual(writes[0]);
      expect(commit).toHaveBeenCalledTimes(1);
    },
  );
});

test.each([200, 409])('switching days isolates a pending submission and its later %s response', async (status) => {
  const response = Promise.withResolvers<Response>();
  const otherBlock = { start: '2026-06-02T00:00:00-04:00', end: '2026-06-03T00:00:00-04:00' };
  const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  const confirm = mock(() => true);
  window.confirm = confirm;
  try {
    await withSurvey(
      {
        page: true,
        read: (date) => (date === DAY ? survey([youtube]) : { ...survey([{ ...chrome, blocks: [otherBlock] }]), date }),
        write: (body) => (body[0]?.appPackageName === youtube.appPackageName ? response.promise : Response.json({})),
      },
      async (writes, reads) => {
        fireEvent.click(await screen.findByLabelText('Child alone'));
        submit();
        await waitFor(() => expect(writes).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: 'Jun 2, 2026: Not answered' }));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(await screen.findByText('Chrome')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Parent alone'));
        submit();
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
        const before = reads();
        response.resolve(Response.json({ code: 'APPS_CHANGED' }, { status }));
        await waitFor(() => expect(reads()).toBeGreaterThan(before));
        expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy();
        expect(screen.queryByText(/The apps for this day changed/)).toBeNull();
        expect(writes).toHaveLength(2);
        expect(writes.map((write) => write.day)).toEqual([DAY, OTHER_DAY]);
        expect(writes[0]?.body).toEqual([answer(youtube, ['Child alone'])]);
        expect(writes[1]?.body).toEqual([
          { appPackageName: chrome.appPackageName, blockStart: otherBlock.start, users: ['Parent alone'] },
        ]);
        expect(writes[1]?.key).toBeTruthy();
        expect(writes[1]?.key).not.toBe(writes[0]?.key);
      },
    );
  } finally {
    if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
    else Reflect.deleteProperty(window, 'confirm');
  }
});

// Day A's success arriving after day B's never erases B's completion, so B reopens for its new apps.
test.each([false, true])('a late success for one day leaves another day reopenable (hourly=%s)', async (hourly) => {
  const response = Promise.withResolvers<Response>();
  const otherBlock = { start: '2026-06-02T00:00:00-04:00', end: '2026-06-03T00:00:00-04:00' };
  let otherNewApps = false;
  let sent = 0;
  const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
  window.confirm = mock(() => true);
  try {
    await withSurvey(
      {
        hourly,
        page: true,
        read: (date) =>
          date === DAY
            ? survey([])
            : { ...(otherNewApps ? survey([{ ...chrome, blocks: [otherBlock] }], 'NEW_APPS') : survey([])), date },
        // A's confirmation (the first write) waits; B's succeeds at once.
        write: () => (++sent === 1 ? response.promise : Response.json({})),
      },
      async (writes, reads) => {
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(writes).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: 'Jun 2, 2026: Not answered' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
        await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
        otherNewApps = true;
        const before = reads();
        response.resolve(Response.json({}));
        await waitFor(() => expect(reads()).toBeGreaterThan(before));
        fireEvent.click(await screen.findByRole('button', { name: 'Jun 2, 2026: New apps to answer' }));
        expect(await screen.findByText(hourly ? 'Begin survey' : 'Chrome')).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'Thank you' })).toBeNull();
        expect(writes.map((write) => write.day)).toEqual([DAY, OTHER_DAY]);
      },
    );
  } finally {
    if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
    else Reflect.deleteProperty(window, 'confirm');
  }
});

// A commits but its response is lost; the participant reloads; a late upload reopens the day for
// B. B's answers are a new attempt with a key of their own, never A's key with B's payload.
test('after a lost response and a reload, the reopened day is submitted as a new attempt', async () => {
  let committed: AppUsageAnswer[] | undefined;
  const server = receiptServer((body) => {
    committed ??= body;
    return undefined;
  });
  let loseResponse = true;
  await withSurvey(
    {
      read: () =>
        committed
          ? survey([{ ...youtube, blocks: [{ ...dayBlock, users: ['Child alone'] }] }, chrome], 'NEW_APPS')
          : survey([youtube]),
      write: (body, key) => {
        const response = server(body, key);
        if (!loseResponse) return response;
        loseResponse = false;
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      },
    },
    async (writes, _reads, _store, reload) => {
      fireEvent.click(await screen.findByLabelText('Child alone'));
      submit();
      expect(await screen.findByText(/server is temporarily busy or unavailable/)).toBeTruthy();
      expect(committed).toEqual([answer(youtube, ['Child alone'])]);
      reload();
      expect(await screen.findByText('Chrome')).toBeTruthy();
      expect(screen.getAllByLabelText('Parent alone')).toHaveLength(1);
      fireEvent.click(screen.getByLabelText('Parent alone'));
      submit();
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
      expect(writes).toHaveLength(2);
      expect(writes[1]?.body).toEqual([answer(chrome, ['Parent alone'])]);
      expect(writes[1]?.key).toBeTruthy();
      expect(writes[1]?.key).not.toBe(writes[0]?.key);
    },
  );
});

// A reload discards a pending attempt whole. Its key does not outlive its answers, so the answers
// given after the reload are a new attempt the server accepts.
test('a reload with a pending submission starts a new attempt for the answers given after it', async () => {
  let failed = false;
  const server = receiptServer(() => {
    if (failed) return undefined;
    failed = true;
    // The first request commits nothing; the participant reloads while it is unconfirmed.
    return Response.json({ message: 'Unavailable' }, { status: 503 });
  });
  await withSurvey({ read: () => survey([youtube]), write: server }, async (writes, _reads, _store, reload) => {
    fireEvent.click(await screen.findByLabelText('Child alone'));
    submit();
    expect(await screen.findByText(/server is temporarily busy or unavailable/)).toBeTruthy();
    reload();
    fireEvent.click(await screen.findByLabelText('Parent alone'));
    submit();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Thank you' })).toBeTruthy());
    expect(writes.map((write) => write.body)).toEqual([
      [answer(youtube, ['Child alone'])],
      [answer(youtube, ['Parent alone'])],
    ]);
    expect(writes[1]?.key).toBeTruthy();
    expect(writes[1]?.key).not.toBe(writes[0]?.key);
  });
});

test('the same answers under a new key recover when the pre-reload request commits after the day was read', async () => {
  const release = Promise.withResolvers<void>();
  let committed: AppUsageAnswer[] | undefined;
  const server = receiptServer((body) => {
    if (committed) return Response.json({ code: 'ALREADY_ANSWERED', message: 'Conflict' }, { status: 409 });
    committed = body;
    return undefined;
  });
  let first = true;
  await withSurvey(
    {
      read: () => (committed ? survey([answeredYoutube], 'ANSWERED') : survey([youtube])),
      write: async (body, key) => {
        if (!first) return server(body, key);
        first = false;
        await release.promise;
        server(body, key);
        return Response.json({ message: 'Unavailable' }, { status: 503 });
      },
    },
    async (writes, _reads, _store, reload) => {
      fireEvent.click(await screen.findByLabelText('Parent alone'));
      submit();
      await waitFor(() => expect(writes).toHaveLength(1));
      reload();
      fireEvent.click(await screen.findByLabelText('Parent alone'));
      release.resolve();
      await waitFor(() => expect(committed).toEqual([answer(youtube, ['Parent alone'])]));
      submit();
      expect(await screen.findByText('This day was already answered. Its answers are shown.')).toBeTruthy();
      expect(screen.getByText('This day is answered')).toBeTruthy();
      expect(screen.getByText(/Parent alone/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Submit survey' })).toBeNull();
      expect(writes).toHaveLength(2);
      expect(writes[1]?.body).toEqual(writes[0]?.body);
      expect(writes[1]?.key).toBeTruthy();
      expect(writes[1]?.key).not.toBe(writes[0]?.key);
    },
  );
});

// HOURLY asks who used each app per study-zone hour; every hour of the day gets a stored answer.
test('hourly form answers every unanswered hour: the child, or no one', async () => {
  const ten = { start: '2026-06-01T10:00:00-04:00', end: '2026-06-01T11:00:00-04:00' };
  const eleven = { start: '2026-06-01T11:00:00-04:00', end: '2026-06-01T12:00:00-04:00' };
  const hourlyYoutube = { ...youtube, blocks: [ten, eleven] };
  const hourlyChrome = { ...chrome, blocks: [ten] };
  await withSurvey({ hourly: true, read: () => survey([hourlyYoutube, hourlyChrome]) }, async (writes) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
    fireEvent.click(screen.getByLabelText('YouTube'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    submit();
    await waitFor(() => expect(writes).toHaveLength(1));
    const byBlock = (rows: AppUsageAnswer[]) =>
      [...rows].sort((a, b) =>
        `${a.appPackageName}${a.blockStart}`.localeCompare(`${b.appPackageName}${b.blockStart}`),
      );
    expect(byBlock(writes[0]?.body ?? [])).toEqual(
      byBlock([
        { appPackageName: youtube.appPackageName, blockStart: ten.start, users: [HOURLY_SURVEY_USER] },
        { appPackageName: youtube.appPackageName, blockStart: eleven.start, users: [HOURLY_SURVEY_USER] },
        { appPackageName: chrome.appPackageName, blockStart: ten.start, users: [] },
      ]),
    );
  });
});

const tenAm = { start: '2026-06-01T10:00:00-04:00', end: '2026-06-01T11:00:00-04:00' };
const elevenAm = { start: '2026-06-01T11:00:00-04:00', end: '2026-06-01T12:00:00-04:00' };
const tiktok: AppUsageDayApp = { appLabel: 'TikTok', appPackageName: 'com.zhiliaoapp.musically', blocks: [tenAm] };
const byBlock = (rows: AppUsageAnswer[]) =>
  [...rows].sort((a, b) => `${a.appPackageName}${a.blockStart}`.localeCompare(`${b.appPackageName}${b.blockStart}`));
const hourAnswer = (app: AppUsageDayApp, block: { start: string }, child: boolean): AppUsageAnswer => ({
  appPackageName: app.appPackageName,
  blockStart: block.start,
  users: child ? [HOURLY_SURVEY_USER] : [],
});
const hourIn = (appLabel: string, range: string) =>
  within(screen.getByRole('group', { name: appLabel })).getByLabelText(range);

// A shared device: the child used some apps together with others, so the parent picks the child's hours in two
// passes (primary user, then any remaining use). Both passes are the child's; every other asked hour is no one's.
test('hourly shared apps store the hours picked in either pass for the child and the rest for no one', async () => {
  const sharedYoutube = { ...youtube, blocks: [tenAm, elevenAm] };
  const sharedChrome = { ...chrome, blocks: [tenAm] };
  await withSurvey({ hourly: true, read: () => survey([sharedYoutube, sharedChrome, tiktok]) }, async (writes) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(english.app_usage_survey.instructions.select_shared_apps)).toBeTruthy();
    for (const label of ['YouTube', 'Chrome', 'TikTok']) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(english.app_usage_survey.instructions.resolve_shared_apps)).toBeTruthy();
    fireEvent.click(hourIn('YouTube', '10am - 11am'));
    fireEvent.click(hourIn('TikTok', '10am - 11am'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    // The second pass asks only the hours the first pass left open.
    expect(screen.getByText(english.app_usage_survey.instructions.resolve_other_apps)).toBeTruthy();
    const youtubeHours = within(screen.getByRole('group', { name: 'YouTube' }));
    expect(youtubeHours.queryByLabelText('10am - 11am')).toBeNull();
    expect(youtubeHours.getByLabelText('11am - 12pm')).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'TikTok' })).getByText(english.app_usage_survey.no_remaining_times),
    ).toBeTruthy();
    fireEvent.click(hourIn('Chrome', '10am - 11am'));
    submit();

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(byBlock(writes[0]?.body ?? [])).toEqual(
      byBlock([
        hourAnswer(youtube, tenAm, true),
        hourAnswer(youtube, elevenAm, false),
        hourAnswer(chrome, tenAm, true),
        hourAnswer(tiktok, tenAm, true),
      ]),
    );
  });
});

// The parent changes their mind: an app first marked shared, then child-only on going back, is never both. All its
// hours are the child's, and an unticked child-only app returns to the shared choices.
test('hourly: going back to mark a shared app child-only answers all its hours for the child', async () => {
  const hourlyYoutube = { ...youtube, blocks: [tenAm, elevenAm] };
  const hourlyChrome = { ...chrome, blocks: [tenAm] };
  await withSurvey({ hourly: true, read: () => survey([hourlyYoutube, hourlyChrome]) }, async (writes) => {
    fireEvent.click(await screen.findByRole('button', { name: 'Begin survey' }));
    fireEvent.click(screen.getByLabelText('Chrome'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Chrome is child-only, so it is not offered as shared.
    expect(screen.queryByLabelText('Chrome')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByLabelText('Chrome'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByLabelText('YouTube'));
    fireEvent.click(screen.getByLabelText('Chrome'));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText<HTMLInputElement>('YouTube').checked).toBe(false);
    fireEvent.click(screen.getByLabelText('YouTube'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByLabelText('YouTube')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Chrome').checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(screen.getByRole('group', { name: 'Chrome' })).getByLabelText('10am - 11am')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'YouTube' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    submit();

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(byBlock(writes[0]?.body ?? [])).toEqual(
      byBlock([
        hourAnswer(youtube, tenAm, true),
        hourAnswer(youtube, elevenAm, true),
        hourAnswer(chrome, tenAm, false),
      ]),
    );
  });
});

// Focus announces the replacement heading without a second announcement from a live region.
test.each([
  ['daily', false, [youtube], () => fireEvent.click(screen.getByLabelText('Child alone'))],
  ['daily empty day', false, [], () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))],
  ['hourly', true, [youtube], () => fireEvent.click(screen.getByRole('button', { name: 'Begin survey' }))],
  ['hourly empty day', true, [], () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))],
] as const)('a stored %s submission focuses the thank-you once', async (_name, hourly, apps, begin) => {
  await withSurvey({ hourly, page: true, read: () => survey([...apps]) }, async (writes, _reads, store) => {
    await screen.findByText(apps.length === 0 ? 'Nothing to review' : hourly ? 'Begin survey' : 'YouTube');
    if (apps.length === 0) screen.getByRole('button', { name: 'Confirm' }).focus();
    begin();
    if (apps.length > 0) {
      if (hourly) {
        fireEvent.click(screen.getByLabelText('YouTube'));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      }
      screen.getByRole('button', { name: 'Submit survey' }).focus();
      submit();
    }
    const thanks = await screen.findByRole('heading', { name: 'Thank you' });
    expect(writes).toHaveLength(1);
    await waitFor(() => expect(document.activeElement).toBe(thanks));
    expect(thanks.closest('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]')).toBeNull();

    const otherDay = screen.getByRole('button', { name: 'Jun 2, 2026: Not answered' });
    otherDay.focus();
    await act(async () => {
      await store
        .dispatch(
          studyOperationsApi.endpoints.getAppUsageDaySurvey.initiate(
            { date: DAY, participantId: 'p1', studyId: 's1' },
            { forceRefetch: true, subscribe: false },
          ),
        )
        .unwrap();
    });
    expect(screen.getByRole('heading', { name: 'Thank you' })).toBe(thanks);
    expect(document.activeElement).toBe(otherDay);
  });
});

test('ordinary app-usage status cards leave focus and heading tab order unchanged', () => {
  const control = document.createElement('button');
  document.body.append(control);
  control.focus();
  render(<AppUsageStatusCard description="No survey days" dir="ltr" icon={CheckCircle2} title="Nothing to review" />);
  const heading = screen.getByRole('heading', { name: 'Nothing to review' });
  expect(document.activeElement).toBe(control);
  expect(heading.getAttribute('tabindex')).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
});

test('daily app-usage submit names each unanswered app and focuses the first one', async () => {
  await withSurvey({ read: () => survey([youtube, chrome]) }, async (writes) => {
    const firstOption = (await screen.findAllByLabelText<HTMLInputElement>('Parent alone'))[0];
    submit();

    expect(writes).toHaveLength(0);
    expect(screen.getAllByText('Response is required')).toHaveLength(2);
    expect(document.activeElement).toBe(firstOption ?? null);
    const group = firstOption?.closest('fieldset');
    expect(document.getElementById(group?.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Response is required',
    );
    fireEvent.click(firstOption as HTMLInputElement);
    expect(screen.getAllByText('Response is required')).toHaveLength(1);
  });
});

test('daily app-usage submit sends the answered apps and leaves the rest asked, as upstream', async () => {
  await withSurvey({ read: () => survey([youtube, chrome]) }, async (writes) => {
    fireEvent.click((await screen.findAllByLabelText('Child alone'))[1] as HTMLInputElement);
    submit();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual([answer(chrome, ['Child alone'])]);
  });
});
