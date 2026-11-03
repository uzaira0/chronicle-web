import { afterEach, describe, expect, test } from 'bun:test';
import { setupListeners } from '@reduxjs/toolkit/query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';

import { LanguageProvider } from '@/i18n';
import { UnsavedEditsGuard } from '@/lib/use-confirm-leave';
import { studyOperationsApi } from '@/state/study-operations-api';
import { createApiStore } from '@/test/study-operations-store';
import { SurveyRoutePage } from './survey-page';

const savedFetch = globalThis.fetch;
const savedConfirmDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: savedFetch, writable: true });
  if (savedConfirmDescriptor) Object.defineProperty(window, 'confirm', savedConfirmDescriptor);
  else Reflect.deleteProperty(window, 'confirm');
});

// The participant keeps the daily survey open across midnight in America/Santiago (the night of the
// April 2026 fall-back). The server's refreshed calendar adds the day that just ended, while the opened day and
// its unsubmitted answer stay put; the new day opens only after the participant agrees to discard the answer.
describe('survey calendar refresh across Santiago midnight', () => {
  function serve() {
    const server = { today: '2026-04-04', dayReads: 0 };
    const ended = () => ['2026-04-02', '2026-04-03', '2026-04-04'].filter((date) => date < server.today);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: (input: Request) => {
        const url = new URL(input.url);
        let body: unknown;
        if (url.pathname.endsWith('/app-usage-frequency')) body = { appUsageFrequency: 'DAILY' };
        else if (url.pathname.endsWith('/app-usage/days')) {
          server.dayReads += 1;
          body = {
            days: ended().map((date) => ({ date, state: date === '2026-04-02' ? 'ANSWERED' : 'UNANSWERED' })),
            timeZone: 'America/Santiago',
            today: server.today,
          };
        } else if (input.method === 'GET' && url.pathname.endsWith('/app-usage')) {
          const date = url.searchParams.get('date') ?? '';
          body = {
            apps: [
              {
                appLabel: `Maps ${date}`,
                appPackageName: 'com.google.android.apps.maps',
                blocks: [{ end: `${date}T14:00:00.000-03:00`, start: `${date}T13:00:00.000-03:00` }],
              },
            ],
            date,
            state: 'UNANSWERED',
            timeZone: 'America/Santiago',
          };
        } else throw new Error(`Unexpected survey request: ${input.method} ${url.pathname}`);
        return Promise.resolve(Response.json(body));
      },
      writable: true,
    });
    window.location.href = 'http://localhost/';
    const store = createApiStore();
    let reconnect: () => void = () => {};
    const unsubscribe = setupListeners(store.dispatch, (dispatch, actions) => {
      reconnect = () => dispatch(actions.onOnline());
      return () => undefined;
    });
    const router = createMemoryRouter(
      [
        {
          children: [{ element: <SurveyRoutePage />, path: '/survey' }],
          element: (
            <>
              <UnsavedEditsGuard />
              <Outlet />
            </>
          ),
        },
      ],
      { initialEntries: ['/survey?studyId=s1&participantId=p1'] },
    );
    const view = render(
      <Provider store={store}>
        <LanguageProvider initialSearch="?lang=en">
          <RouterProvider router={router} />
        </LanguageProvider>
      </Provider>,
    );
    return {
      server,
      unmount: () => {
        view.unmount();
        router.dispose();
        unsubscribe();
        store.dispatch(studyOperationsApi.util.resetApiState());
      },
      reconnect: () =>
        act(async () => {
          reconnect();
          await Promise.resolve();
        }),
    };
  }

  const answer = () => screen.findByLabelText<HTMLInputElement>('Child alone');
  const opened = () => screen.getByRole('button', { name: 'Apr 3, 2026: Not answered' });

  test('adds the newly ended day, keeps the opened day and its answer, and switches only after the discard decision', async () => {
    const { server, reconnect, unmount } = serve();
    try {
      expect(await screen.findByText('Maps 2026-04-03')).toBeTruthy();
      expect(opened().getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apr 4, 2026' }).disabled).toBe(true);
      fireEvent.click(await answer());

      server.today = '2026-04-05';
      await reconnect();
      const newDay = await screen.findByRole<HTMLButtonElement>('button', { name: 'Apr 4, 2026: Not answered' });
      expect(server.dayReads).toBe(2);
      expect(newDay.disabled).toBe(false);
      expect(opened().getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText('Maps 2026-04-03')).toBeTruthy();
      expect((await answer()).checked).toBe(true);

      const prompts: boolean[] = [];
      window.confirm = () => {
        prompts.push(false);
        return false;
      };
      fireEvent.click(newDay);
      expect(prompts).toHaveLength(1);
      expect(opened().getAttribute('aria-pressed')).toBe('true');
      expect((await answer()).checked).toBe(true);

      window.confirm = () => {
        prompts.push(true);
        return true;
      };
      fireEvent.click(newDay);
      expect(prompts).toHaveLength(2);
      expect(await screen.findByText('Maps 2026-04-04')).toBeTruthy();
      await waitFor(() => expect(newDay.getAttribute('aria-pressed')).toBe('true'));
      expect((await answer()).checked).toBe(false);
    } finally {
      unmount();
    }
  });
});
