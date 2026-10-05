import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { Participant } from '@/state/study-operations-api';
import { ParticipantInfoModal } from './participant-info-modal';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('ParticipantInfoModal transport errors', () => {
  test('shows a fixed actionable fallback instead of rejected fetch details', async () => {
    globalThis.fetch = mock(() => Promise.reject(new TypeError('W20_PARTICIPANT_NETWORK_SENTINEL'))) as unknown as typeof fetch;
    const participant: Participant = {
      candidate: { id: 'candidate-7' },
      participantId: 'participant-7',
      participantTags: [],
      participationStatus: 'ENROLLED',
    };

    render(<ParticipantInfoModal modules={[]} onClose={() => undefined} participant={participant} studyId="study-7" />);

    expect(await screen.findByText('Unable to issue participant links.')).toBeDefined();
    expect(screen.queryByText('W20_PARTICIPANT_NETWORK_SENTINEL')).toBeNull();
  });
});
