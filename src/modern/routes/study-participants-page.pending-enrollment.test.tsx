import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { setupListeners } from '@reduxjs/toolkit/query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { studyOperationsApi } from '@/state/study-operations-api';
import participant from '@/test/golden/backend-participant.json';
import { installRelativeRequest, routeFetch } from '@/test/http-fixtures';
import { createApiStore } from '@/test/study-operations-store';
import { StudyParticipantsPage } from './study-participants-page';

test('cancelling pending enrollment refetches the query and removes the participant row action', async () => {
  const studyId = 'pending-study';
  const participantId = 'pending-participant';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const cancelPath = `${studyPath}/participant/${participantId}/pending-enrollment/cancel`;
  const cancelLabel = 'Cancel pending enrollment';
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  let pending = true;
  let pendingReads = 0;
  const cancellations: string[] = [];
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: () => Response.json({ id: studyId, title: 'Pending study', modules: {} }),
    [`GET ${studyPath}/participants`]: () => Response.json([{ ...participant, participantId }]),
    [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
    [`GET ${studyPath}/pending-enrollments`]: () => {
      pendingReads += 1;
      return Response.json(pending ? [participantId] : []);
    },
    [`POST ${cancelPath}`]: () => {
      cancellations.push(cancelPath);
      pending = false;
      return new Response(null, { status: 204 });
    },
  });
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
        <Routes>
          <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  try {
    const action = await screen.findByRole('button', { name: cancelLabel });
    expect(action.closest('tr')?.textContent).toContain(participantId);
    expect(pendingReads).toBe(1);
    fireEvent.click(action);
    // Revoking the device's enrollment code is confirmed first; the click alone sends nothing.
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke enrollment code' });
    expect(cancellations).toEqual([]);
    fireEvent.click(confirm);
    await waitFor(() => expect(cancellations).toEqual([cancelPath]));
    await waitFor(() => expect(screen.queryByRole('button', { name: cancelLabel })).toBeNull());
    expect(pendingReads).toBe(2);
    expect(studyOperationsApi.endpoints.getPendingEnrollments.select(studyId)(store.getState()).data).toEqual([]);
    expect(within(screen.getByRole('table')).getByText(participantId)).toBeTruthy();
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});

test('the register form applies the server participant-id rule, including its length bound', async () => {
  const studyId = 'id-rule-study';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: () => Response.json({ id: studyId, title: 'Id rule study', modules: {} }),
    [`GET ${studyPath}/participants`]: () => Response.json([]),
    [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
    [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
  });
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
        <Routes>
          <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  try {
    const input = await screen.findByRole('textbox', { name: 'New participant ID' });
    fireEvent.change(input, { target: { value: 'a'.repeat(255) } });
    expect(input.getAttribute('aria-invalid')).toBe('false');
    fireEvent.change(input, { target: { value: 'a'.repeat(256) } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});

// The researcher registers a participant and is handed that participant's enrollment link at once.
// A refused registration (the id already exists) says why and keeps the typed id for correction.
describe('registering a participant', () => {
  const studyId = 'register-study';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const accessCode = 'A'.repeat(40);
  let savedFetch: typeof fetch;
  let restoreRequest: () => void;
  let registered: { participantId: string; participationStatus: string }[];
  let registerStatus: number;
  let accessCodeRequests: string[];

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    restoreRequest = installRelativeRequest();
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://pilot-study.example.org' });
    registered = [];
    registerStatus = 200;
    accessCodeRequests = [];
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}`]: () => Response.json({ id: studyId, title: 'Register study', modules: {} }),
      [`GET ${studyPath}/participants`]: () =>
        Response.json(registered.map(({ participantId }) => ({ ...participant, participantId }))),
      [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
      [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
      [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
      [`GET ${studyPath}/deletions`]: () => Response.json([]),
      [`POST ${studyPath}/participant`]: async (request) => {
        if (registerStatus !== 200)
          return Response.json({ message: 'Participant pilot-007 already exists.' }, { status: registerStatus });
        registered.push((await request.json()) as { participantId: string; participationStatus: string });
        return new Response(null, { status: 200 });
      },
      [`GET ${studyPath}/participant/pilot-007/enrollment-code`]: (request) => {
        accessCodeRequests.push(`${request.method} enrollment-code`);
        return new Response(null, { status: 404 });
      },
      [`POST ${studyPath}/participant/pilot-007/form-access-codes`]: (request) => {
        accessCodeRequests.push(`${request.method} form-access-codes`);
        return Response.json({ accessCode });
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
    globalThis.fetch = savedFetch;
    restoreRequest();
  });

  function renderPage() {
    const store = createApiStore();
    const view = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
          <Routes>
            <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    return () => {
      view.unmount();
      store.dispatch(studyOperationsApi.util.resetApiState());
    };
  }

  test('registers the trimmed id as enrolled, lists it, and opens its enrollment link', async () => {
    const unmount = renderPage();
    try {
      const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'New participant ID' });
      fireEvent.change(input, { target: { value: '  pilot-007  ' } });
      fireEvent.click(screen.getByRole('button', { name: 'Register' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('QR enrollment')).toBeTruthy();
      const link = await within(dialog).findByText((text) => text.startsWith('https://pilot-study.example.org/'));
      const url = new URL(link.textContent ?? '');
      expect(url.searchParams.get('participantId')).toBe('pilot-007');
      expect(url.searchParams.get('studyId')).toBe(studyId);
      expect(new URLSearchParams(url.hash.slice(1)).get('accessCode')).toBe(accessCode);
      expect(accessCodeRequests).toEqual(['GET enrollment-code', 'POST form-access-codes']);
      expect(
        registered.map(({ participantId, participationStatus }) => ({ participantId, participationStatus })),
      ).toEqual([{ participantId: 'pilot-007', participationStatus: 'ENROLLED' }]);
      expect(input.value).toBe('');
      await waitFor(() =>
        expect(within(screen.getByRole('table', { hidden: true })).getByText('pilot-007')).toBeTruthy(),
      );
    } finally {
      unmount();
    }
  });

  test('a refused registration shows the server reason and keeps the typed id', async () => {
    registerStatus = 409;
    const unmount = renderPage();
    try {
      const input = await screen.findByRole<HTMLInputElement>('textbox', { name: 'New participant ID' });
      fireEvent.change(input, { target: { value: 'pilot-007' } });
      fireEvent.click(screen.getByRole('button', { name: 'Register' }));

      expect((await screen.findByRole('alert')).textContent).toContain('Participant pilot-007 already exists.');
      expect(input.value).toBe('pilot-007');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(registered).toEqual([]);
      expect(accessCodeRequests).toEqual([]);
    } finally {
      unmount();
    }
  });
});

// After pause, not-enrolled, withdraw or a processing block, the list shows each participant's true
// state, and sorting by status groups them so the researcher sees who is not collecting.
test('the participant list shows each true participation state and sorts by it', async () => {
  const studyId = 'status-study';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const savedFetch = globalThis.fetch;
  const restoreRequest = installRelativeRequest();
  const store = createApiStore();
  const rows = [
    { participantId: 'p-1-paused', participationStatus: 'PAUSED' },
    { participantId: 'p-2-not', participationStatus: 'NOT_ENROLLED' },
    { participantId: 'p-3-enrolled', participationStatus: 'ENROLLED' },
    { participantId: 'p-4-withdrawn', participationStatus: 'ENROLLED', withdrawnAt: '2026-10-01T15:00:00Z' },
    { participantId: 'p-5-blocked', participationStatus: 'ENROLLED', processingBlockedAt: '2026-10-02T15:00:00Z' },
  ];
  globalThis.fetch = routeFetch({
    [`GET ${studyPath}`]: () => Response.json({ id: studyId, title: 'Status study', modules: {} }),
    [`GET ${studyPath}/participants`]: () => Response.json(rows.map((row) => ({ ...participant, ...row }))),
    [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
    [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
    [`GET ${studyPath}/pending-enrollments`]: () => Response.json([]),
  });
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
        <Routes>
          <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  const statusCell = (id: string) => {
    const cells = (screen.getByText(id).closest('tr') as HTMLElement).querySelectorAll('td');
    return cells[3]?.textContent ?? '';
  };
  const order = () =>
    [...screen.getByRole('table').querySelectorAll('tbody tr')].flatMap((row) => {
      const id = row.querySelectorAll('td')[2]?.querySelector('span[translate="no"]')?.textContent;
      return id ? [id] : [];
    });
  try {
    await screen.findByText('p-5-blocked');
    expect(statusCell('p-1-paused')).toBe('Paused');
    expect(statusCell('p-2-not')).toBe('Not enrolled');
    expect(statusCell('p-4-withdrawn')).toContain('Withdrawn');
    expect(statusCell('p-5-blocked')).toBe('BlockedEnrolled');
    expect(statusCell('p-3-enrolled')).not.toMatch(/Paused|Not enrolled|Withdrawn|Blocked/);

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /^Status/ }));
    expect(order()).toEqual(['p-3-enrolled', 'p-4-withdrawn', 'p-5-blocked', 'p-2-not', 'p-1-paused']);
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /^Status/ }));
    expect(order()).toEqual(['p-1-paused', 'p-2-not', 'p-3-enrolled', 'p-4-withdrawn', 'p-5-blocked']);
  } finally {
    view.unmount();
    store.dispatch(studyOperationsApi.util.resetApiState());
    globalThis.fetch = savedFetch;
    restoreRequest();
  }
});

// The pending-enrollment action follows the server while the page stays open. The
// 30-second poll (paused while the window is unfocused) is what removes it when the phone
// finishes, and a failed cancellation never hides a still-pending enrollment.
describe('pending enrollment while the phone and operator act', () => {
  const studyId = 'polling-study';
  const participantId = 'polling-participant';
  const studyPath = `/chronicle/api/web/study/${studyId}`;
  const cancelPath = `${studyPath}/participant/${participantId}/pending-enrollment/cancel`;
  const cancelLabel = 'Cancel pending enrollment';
  let savedFetch: typeof fetch;
  let restoreRequest: () => void;
  let server: {
    pending: boolean;
    pollStatus: number;
    cancelStatus: number;
    reads: number;
    cancels: number;
    cancelsAfterCompletion: number;
  };

  beforeEach(() => {
    savedFetch = globalThis.fetch;
    restoreRequest = installRelativeRequest();
    server = { pending: true, pollStatus: 200, cancelStatus: 204, reads: 0, cancels: 0, cancelsAfterCompletion: 0 };
    globalThis.fetch = routeFetch({
      [`GET ${studyPath}`]: () => Response.json({ id: studyId, title: 'Polling study', modules: {} }),
      [`GET ${studyPath}/participants`]: () => Response.json([{ ...participant, participantId }]),
      [`GET ${studyPath}/participants/stats`]: () => Response.json({}),
      [`GET ${studyPath}/settings/type/DataCollection`]: () => Response.json({ modules: {} }),
      [`GET ${studyPath}/pending-enrollments`]: () => {
        server.reads += 1;
        if (server.pollStatus !== 200) return new Response(null, { status: server.pollStatus });
        return Response.json(server.pending ? [participantId] : []);
      },
      [`POST ${cancelPath}`]: () => {
        server.cancels += 1;
        if (!server.pending) server.cancelsAfterCompletion += 1;
        if (server.cancelStatus !== 204) return new Response(null, { status: server.cancelStatus });
        // The server revokes whatever is still pending; an enrollment that completed meanwhile is kept (no-op 204).
        server.pending = false;
        return new Response(null, { status: 204 });
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    restoreRequest();
  });

  function renderPage() {
    const store = createApiStore();
    let focus: { onFocus: () => void; onFocusLost: () => void } | undefined;
    const unsubscribe = setupListeners(store.dispatch, (dispatch, actions) => {
      focus = { onFocus: () => dispatch(actions.onFocus()), onFocusLost: () => dispatch(actions.onFocusLost()) };
      return () => undefined;
    });
    const view = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/studies/${studyId}/participants`]}>
          <Routes>
            <Route path="/studies/:studyId/participants" element={<StudyParticipantsPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );
    return {
      focus: focus ?? fail('setupListeners did not expose focus actions'),
      unmount: () => {
        view.unmount();
        unsubscribe();
        store.dispatch(studyOperationsApi.util.resetApiState());
      },
    };
  }

  // An open confirmation hides the page behind it from the accessibility tree; the row is still there.
  const action = () => screen.queryByRole('button', { hidden: true, name: cancelLabel });
  const row = () => within(screen.getByRole('table', { hidden: true })).getByText(participantId);

  // RTL's waitFor polls with timers it cannot see faked under bun, so settle by draining microtasks.
  async function settle(until: () => boolean) {
    for (let turn = 0; turn < 200 && !until(); turn += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(until()).toBe(true);
  }

  let advancePoll: () => void;
  async function poll() {
    const before = server.reads;
    await act(async () => {
      advancePoll();
      await Promise.resolve();
    });
    await settle(() => server.reads === before + 1);
  }

  test('a phone that completes enrollment loses the action at the next poll, and an unfocused page catches up on focus', async () => {
    const originalTimeout = globalThis.setTimeout;
    const originalClear = globalThis.clearTimeout;
    const polls = new Map<ReturnType<typeof setTimeout>, () => void>();
    const timer = jest.spyOn(globalThis, 'setTimeout').mockImplementation(((
      handler: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay !== 30_000) return originalTimeout(handler, delay, ...args);
      const id = originalTimeout(() => undefined, 2_000_000_000);
      polls.set(id, () => handler(...args));
      return id;
    }) as typeof setTimeout);
    const clear = jest.spyOn(globalThis, 'clearTimeout').mockImplementation(((
      id: ReturnType<typeof setTimeout> | undefined,
    ) => {
      if (id !== undefined) polls.delete(id);
      originalClear(id);
    }) as typeof clearTimeout);
    advancePoll = () => {
      for (const [id, handler] of [...polls]) {
        polls.delete(id);
        originalClear(id);
        handler();
      }
    };
    const page = renderPage();
    try {
      await settle(() => action() !== null);
      expect(server.reads).toBe(1);

      // The phone finishes enrolling; nobody presses anything.
      server.pending = false;
      await poll();
      await settle(() => action() === null);
      expect(row()).toBeTruthy();

      // A new enrollment starts and the next poll is lost: the page says so instead of showing stale state.
      server.pending = true;
      server.pollStatus = 503;
      await poll();
      await settle(() => screen.queryByText('Request failed') !== null);
      expect(action()).toBeNull();

      // Recover while focused before checking that a blurred window keeps the last known pending state.
      server.pollStatus = 200;
      await poll();
      await settle(() => action() !== null);
      page.focus.onFocusLost();
      // The phone finishes while the window is unfocused: no read sees it until focus returns.
      server.pending = false;
      const unfocusedReads = server.reads;
      await act(async () => {
        advancePoll();
        advancePoll();
        advancePoll();
        await Promise.resolve();
      });
      expect(server.reads).toBe(unfocusedReads);
      expect(action()).not.toBeNull();
      // Focus returning reads the phone's current state at once.
      await act(async () => {
        page.focus.onFocus();
        await Promise.resolve();
      });
      await settle(() => server.reads === unfocusedReads + 1);
      await settle(() => action() === null);
      expect(row()).toBeTruthy();
      expect(server.cancels).toBe(0);
    } finally {
      page.unmount();
      for (const id of polls.keys()) originalClear(id);
      clear.mockRestore();
      timer.mockRestore();
    }
  });

  test.each([409, 503])('a failed cancellation (%s) keeps the pending action and says it failed', async (status) => {
    server.cancelStatus = status;
    const page = renderPage();
    try {
      fireEvent.click(await screen.findByRole('button', { name: cancelLabel }));
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke enrollment code' }),
      );
      await waitFor(() => expect(server.cancels).toBe(1));
      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeTruthy();
      expect(action()).not.toBeNull();
      expect(row()).toBeTruthy();
      // Escape dismisses the failed confirmation without trying again; the pending action stays for later.
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(server.cancels).toBe(1);
      expect(action()).not.toBeNull();
    } finally {
      page.unmount();
    }
  });

  test('a cancel sent after the phone completed closes quietly and keeps the participant', async () => {
    const page = renderPage();
    try {
      fireEvent.click(await screen.findByRole('button', { name: cancelLabel }));
      const dialog = await screen.findByRole('dialog');
      server.pending = false;
      fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke enrollment code' }));
      await waitFor(() => expect(action()).toBeNull());
      expect(server.cancelsAfterCompletion).toBe(1);
      expect(row()).toBeTruthy();
      // A refused cancel keeps the dialog open with its alert; this one closed it.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(server.reads).toBeGreaterThan(1);
    } finally {
      page.unmount();
    }
  });
});

function fail(message: string): never {
  throw new Error(message);
}
