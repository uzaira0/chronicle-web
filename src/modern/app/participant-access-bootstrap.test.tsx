import { afterEach, describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { ParticipantAccessBootstrap } from './participant-access-bootstrap';

const STUDY_ID = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';
const CONTEXT = {
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
  formKind: 'APP_USAGE',
  participantId: 'participant-7',
  studyId: STUDY_ID,
};
const originalFetch = globalThis.fetch;

function renderAt(accessCode: string) {
  render(
    <MemoryRouter initialEntries={[`/survey?studyId=${STUDY_ID}&participantId=participant-7#accessCode=${accessCode}`]}>
      <Routes>
        <Route
          element={
            <ParticipantAccessBootstrap>
              <p>form</p>
            </ParticipantAccessBootstrap>
          }
          path="survey"
        />
      </Routes>
    </MemoryRouter>,
  );
}

// production-readiness U1/U4: a dropped connection during the one-time access-code exchange
// shows a translated sentence (not the browser's "Failed to fetch") and a retry that re-runs
// the exchange with the in-memory code, since the address bar no longer holds it.
describe('ParticipantAccessBootstrap network failure', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
    window.sessionStorage.clear();
  });

  test('hides the raw fetch error and retries the exchange', async () => {
    const fetchMock = mock()
      .mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(CONTEXT), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderAt('network-blip-code');

    expect(await screen.findByText('Participant access could not be established.')).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('offers no retry for a spent or invalid link', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response('', { status: 410 }))) as unknown as typeof fetch;

    renderAt('spent-code');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
