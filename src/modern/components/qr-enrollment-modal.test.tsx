import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import english from '@/i18n/en/translation.json';
import { createApiStore } from '@/test/study-operations-store';
import { LARGE_TRIAL_CA_PEM, TRIAL_CA_PARAMETER, TRIAL_CA_PEM } from '@/test/trial-ca';

const ACCESS_CODE = 'Abc_123-'.repeat(8);
const originalFetch = globalThis.fetch;

import { MAX_QR_BYTE_LENGTH, QrEnrollmentModal } from './qr-enrollment-modal';

function renderModal(props: ComponentProps<typeof QrEnrollmentModal>) {
  return render(
    <Provider store={createApiStore()}>
      <QrEnrollmentModal {...props} />
    </Provider>,
  );
}

beforeEach(() => {
  globalThis.fetch = mock(() =>
    Promise.resolve(new Response(JSON.stringify({ accessCode: ACCESS_CODE }), { status: 200 })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
});

const LIVE_CODE = 'Live_123'.repeat(8);
const STUDY = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';

/** The server's two routes: the live code already sent (404 when none) and the issue that replaces it. */
function serverWithLiveCode(live: string | null) {
  const requests: string[] = [];
  globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.slice(url.indexOf('/participant/'))}`);
    if (method === 'GET' && url.endsWith('/enrollment-code')) {
      return Promise.resolve(
        live ? new Response(JSON.stringify({ accessCode: live }), { status: 200 }) : new Response('', { status: 404 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ accessCode: ACCESS_CODE }), { status: 200 }));
  }) as unknown as typeof fetch;
  return requests;
}

function shownCode(): string | null {
  const displayed = screen.queryAllByText((text) =>
    text.startsWith('https://public-study.example.org/chronicle/enroll'),
  );
  return displayed[0]
    ? new URLSearchParams(new URL(displayed[0].textContent ?? '').hash.slice(1)).get('accessCode')
    : null;
}

describe('QrEnrollmentModal keeps the link already sent', () => {
  test('shows the live link and replaces it only on the action that says so', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    const requests = serverWithLiveCode(LIVE_CODE);
    renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });

    await waitFor(() => expect(shownCode()).toBe(LIVE_CODE));
    expect(requests).toEqual(['GET /participant/participant-7/enrollment-code']);
    expect(screen.getByText('Replacing it issues a new link and stops the one already sent.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Replace the sent link' }));
    await waitFor(() => expect(shownCode()).toBe(ACCESS_CODE));
    expect(requests).toEqual([
      'GET /participant/participant-7/enrollment-code',
      'POST /participant/participant-7/form-access-codes',
    ]);
  });

  test('issues a link when the participant has none', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    const requests = serverWithLiveCode(null);
    renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });

    await waitFor(() => expect(shownCode()).toBe(ACCESS_CODE));
    expect(requests).toEqual([
      'GET /participant/participant-7/enrollment-code',
      'POST /participant/participant-7/form-access-codes',
    ]);
  });
});

describe('QrEnrollmentModal public enrollment link', () => {
  // A refused copy is announced, and the link stays on screen as text to select and copy by hand.
  test('a refused copy announces the failure and keeps the link selectable', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    const execCommandKey = 'execCommand';
    const execCommand = Object.getOwnPropertyDescriptor(document, execCommandKey);
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException('Clipboard denied', 'NotAllowedError')) },
    });
    document.execCommand = () => false;
    try {
      renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });
      fireEvent.click(await screen.findByRole('button', { name: 'Copy enrollment link' }));
      expect((await screen.findByRole('alert')).textContent).toBe(english.common.copy_failed);
      expect(shownCode()).toBe(ACCESS_CODE);
      const shown = screen.getByText((text) => text.startsWith('https://public-study.example.org/chronicle/enroll'));
      expect(shown.closest('[hidden], [aria-hidden="true"], .hidden, .invisible, .select-none, .sr-only')).toBeNull();
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (execCommand) Object.defineProperty(document, execCommandKey, execCommand);
      else Reflect.deleteProperty(document, execCommandKey);
    }
  });

  test('generates only an HTTPS landing link with the one-time code isolated in the fragment', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    renderModal({
      onClose: () => undefined,
      participantId: 'participant-7',
      studyId: '28d661b8-a45a-41b6-aec4-ed9988fa28dc',
    });

    const displayedLink = await screen.findByText((text) =>
      text.startsWith('https://public-study.example.org/chronicle/enroll'),
    );
    const link = new URL(displayedLink.textContent ?? '');

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(link.protocol).toBe('https:');
    expect(link.pathname).toBe('/chronicle/enroll');
    expect(link.searchParams.has('accessCode')).toBe(false);
    expect(link.pathname).not.toContain(ACCESS_CODE);
    expect(new URLSearchParams(link.hash.slice(1)).get('accessCode')).toBe(ACCESS_CODE);
    expect(screen.queryByRole('button', { name: 'Deep Link' })).toBeNull();
  });

  test('a code issued for one participant is never shown for an id edited while issuing', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    let respond: (response: Response) => void = () => undefined;
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    ) as unknown as typeof fetch;
    renderModal({ onClose: () => undefined, studyId: '28d661b8-a45a-41b6-aec4-ed9988fa28dc' });
    const input = screen.getByLabelText<HTMLInputElement>('Participant ID');

    fireEvent.change(input, { target: { value: 'participant-a' } });
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Issue one-time enrollment link' }).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'participant-b' } });
    respond(new Response(JSON.stringify({ accessCode: ACCESS_CODE }), { status: 200 }));
    await waitFor(() => expect(input.disabled).toBe(false));

    // Counts, not elements: a failure would otherwise print the whole DOM tree.
    expect(
      screen.queryAllByText((text) => text.startsWith('https://public-study.example.org/chronicle/enroll')).length,
    ).toBe(0);
    expect(screen.queryAllByRole('img').length).toBe(0);
  });

  test('maps fetch failures to a fixed message and keeps link issuance retryable', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new TypeError('W20_QR_NETWORK_SENTINEL'));
      return Promise.resolve(new Response(JSON.stringify({ accessCode: ACCESS_CODE }), { status: 200 }));
    }) as unknown as typeof fetch;
    renderModal({
      onClose: () => undefined,
      participantId: 'participant-7',
      studyId: '28d661b8-a45a-41b6-aec4-ed9988fa28dc',
    });

    // A failed lookup never falls through to issuing: that would revoke a link already sent.
    expect(
      await screen.findByText(
        'Unable to load the enrollment link already sent. (could not reach the server; check your connection and try again)',
      ),
    ).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Unable to load the enrollment link already sent.');
    expect(screen.queryByText('W20_QR_NETWORK_SENTINEL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
    expect(
      await screen.findByText((text) => text.startsWith('https://public-study.example.org/chronicle/enroll')),
    ).toBeDefined();
    expect(calls).toBe(2);
  });
});

describe('QrEnrollmentModal failures an operator or researcher can hit', () => {
  // A deployment without a valid public HTTPS server URL cannot produce a link a phone can open: say so, issue nothing.
  test('a deployment without a public server URL explains it and issues nothing', async () => {
    const onClose = mock(() => undefined);
    renderModal({ onClose, participantId: 'participant-7', studyId: STUDY });
    expect(await screen.findByText(english.participant_access.missing_server)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Issue one-time enrollment link' }).disabled).toBe(
      true,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Escape closes the dialog through the caller.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // The participant has no link yet and the issue itself fails: no QR is shown, and the failure says why.
  test.each([
    [
      'a malformed code',
      () => new Response(JSON.stringify({ accessCode: 'short' }), { status: 200 }),
      english.qr_modal.malformed,
    ],
    ['a busy server', () => new Response('', { status: 503 }), english.qr_modal.issue_failed_generic],
  ] as const)(
    'issuing a first link that returns %s shows no link and an alert',
    async (_name, issueResponse, message) => {
      Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
      globalThis.fetch = mock((input: RequestInfo | URL) =>
        Promise.resolve(
          String(input instanceof Request ? input.url : input).endsWith('/enrollment-code')
            ? new Response('', { status: 404 })
            : issueResponse(),
        ),
      ) as unknown as typeof fetch;
      renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });
      expect((await screen.findByRole('alert')).textContent).toContain(message);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(
        screen.queryAllByText((text) => text.startsWith('https://public-study.example.org/chronicle/enroll')).length,
      ).toBe(0);
      expect(screen.queryAllByRole('img').length).toBe(0);
    },
  );
});

describe('QrEnrollmentModal in the local HTTPS trial', () => {
  const TRIAL = { allowPrivateServerUrl: true, localCa: true, serverUrl: 'https://192.168.1.50' };

  function trialServer(caFile: () => Promise<Response>) {
    const requests = mock((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === '/local-ca.crt') return caFile();
      if (url.endsWith('/enrollment-code')) return Promise.resolve(new Response('', { status: 404 }));
      return Promise.resolve(new Response(JSON.stringify({ accessCode: ACCESS_CODE }), { status: 200 }));
    });
    globalThis.fetch = requests as unknown as typeof fetch;
    return requests;
  }

  function shownLink(): URL | null {
    const displayed = screen.queryAllByText((text) => text.startsWith('https://192.168.1.50/chronicle/enroll'));
    return displayed[0] ? new URL(displayed[0].textContent ?? '') : null;
  }

  test('the invitation link carries the deployment CA root for the apps', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', TRIAL);
    trialServer(() => Promise.resolve(new Response(TRIAL_CA_PEM, { status: 200 })));
    renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });

    await waitFor(() => expect(shownLink()).not.toBeNull());
    expect(shownLink()?.searchParams.get('serverCa')).toBe(TRIAL_CA_PARAMETER);
    const qr = screen.getByRole('img');
    expect(qr.getAttribute('width')).toBe('384');
    // Four modules of quiet zone around the dense certificate-bearing code.
    expect(qr.querySelectorAll('path')[1]?.getAttribute('d')).toStartWith('M4 4');
  });

  test('an invitation beyond QR capacity keeps its copyable link without crashing', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', TRIAL);
    trialServer(() => Promise.resolve(new Response(LARGE_TRIAL_CA_PEM, { status: 200 })));
    renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });

    await waitFor(() => expect(shownLink()).not.toBeNull());
    expect(shownLink()?.href.length).toBeGreaterThan(MAX_QR_BYTE_LENGTH);
    expect(screen.queryByRole('img')).toBeNull();
  });

  test('an unreadable CA root shows the failure and no link that the apps would reject', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', TRIAL);
    const requests = trialServer(() => Promise.resolve(new Response('', { status: 404 })));
    renderModal({ onClose: () => undefined, participantId: 'participant-7', studyId: STUDY });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'certificate authority, which invitation links must carry',
    );
    expect(shownLink()).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Issue one-time enrollment link' }).disabled).toBe(
      true,
    );
    expect(screen.getByRole('alert').textContent).toContain('certificate authority');
    expect(screen.queryByText('Enter a participant ID to generate a QR code.')).toBeNull();
    expect(requests.mock.calls).toHaveLength(1);
  });
});
