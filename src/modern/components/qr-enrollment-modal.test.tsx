import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ACCESS_CODE = 'Abc_123-'.repeat(8);
const originalFetch = globalThis.fetch;

import { QrEnrollmentModal } from './qr-enrollment-modal';

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

describe('QrEnrollmentModal public enrollment link', () => {
  test('generates only an HTTPS landing link with the one-time code isolated in the fragment', async () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    render(
      <QrEnrollmentModal
        onClose={() => undefined}
        participantId="participant-7"
        studyId="28d661b8-a45a-41b6-aec4-ed9988fa28dc"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
    const displayedLink = await screen.findByText((text) =>
      text.startsWith('https://public-study.example.org/chronicle/enroll'),
    );
    const link = new URL(displayedLink.textContent ?? '');

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
    render(<QrEnrollmentModal onClose={() => undefined} studyId="28d661b8-a45a-41b6-aec4-ed9988fa28dc" />);
    const input = screen.getByLabelText<HTMLInputElement>('Participant ID');

    fireEvent.change(input, { target: { value: 'participant-a' } });
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
    render(
      <QrEnrollmentModal
        onClose={() => undefined}
        participantId="participant-7"
        studyId="28d661b8-a45a-41b6-aec4-ed9988fa28dc"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
    expect(await screen.findByText('Unable to issue enrollment link.')).toBeDefined();
    expect(screen.queryByText('W20_QR_NETWORK_SENTINEL')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Issue one-time enrollment link' }));
    expect(
      await screen.findByText((text) => text.startsWith('https://public-study.example.org/chronicle/enroll')),
    ).toBeDefined();
    expect(calls).toBe(2);
  });
});
