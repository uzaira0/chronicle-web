import { afterEach, describe, expect, it, setSystemTime } from 'bun:test';

import {
  type ParticipantSessionContext,
  parseParticipantSessionContext,
  participantAccessCodeFromFragment,
  participantAccessCodeIssueUrl,
  participantAccessExchangeUrl,
  recoverParticipantSessionContext,
} from './participant-access';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const context = {
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
  formKind: 'APP_USAGE',
  participantId: 'p1',
  studyId: 's1',
} satisfies ParticipantSessionContext;

it('rejects malformed stored session expiry and unknown instrument kinds', () => {
  expect(parseParticipantSessionContext(context)).toEqual(context);
  for (const expiresAt of ['invalid', '']) expect(parseParticipantSessionContext({ ...context, expiresAt })).toBeNull();
  expect(parseParticipantSessionContext({ ...context, formKind: 'UNKNOWN_INSTRUMENT' })).toBeNull();
});

// The server decides whether its session is valid; a browser clock running ahead must not veto it.
it('accepts a server-issued session whose expiry the browser clock has already passed', () => {
  const serverNow = Date.now();
  const expiresAt = new Date(serverNow + 60_000).toISOString();
  setSystemTime(new Date(serverNow + 3_600_000));
  try {
    expect(parseParticipantSessionContext({ ...context, expiresAt })).toEqual({ ...context, expiresAt });
  } finally {
    setSystemTime();
  }
});

it('treats only denied credentials as an absent recovered session', async () => {
  for (const status of [401, 403]) {
    globalThis.fetch = (() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch;
    expect(await recoverParticipantSessionContext()).toBeNull();
  }
  for (const status of [429, 503]) {
    globalThis.fetch = (() => Promise.resolve(new Response(null, { status }))) as unknown as typeof fetch;
    await recoverParticipantSessionContext().then(
      () => {
        throw new Error('Expected session recovery to reject');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
      },
    );
  }
});

describe('participant access wire contract', () => {
  it('uses the public participant API for access-code exchange', () => {
    expect(participantAccessExchangeUrl()).toBe('/chronicle/v3/participant-access/exchange');
  });

  it('encodes access-code issuance path segments', () => {
    expect(participantAccessCodeIssueUrl('study/one', 'participant two')).toBe(
      '/chronicle/api/web/study/study%2Fone/participant/participant%20two/form-access-codes',
    );
  });

  it('reads participant access codes from fragments', () => {
    expect(participantAccessCodeFromFragment('#accessCode=one-time-code')).toBe('one-time-code');
  });

  it('does not interpret query-string text as a participant access code', () => {
    expect(participantAccessCodeFromFragment('?accessCode=leaked-code')).toBeNull();
  });
});
