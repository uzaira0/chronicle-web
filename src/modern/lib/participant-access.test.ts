import { describe, expect, it } from 'bun:test';

import {
  participantAccessCodeFromFragment,
  participantAccessCodeIssueUrl,
  participantAccessExchangeUrl,
} from './participant-access';

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
