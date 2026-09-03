import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
});
