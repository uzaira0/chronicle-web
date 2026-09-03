import { describe, expect, test } from 'bun:test';

import { statusLabel } from './status';
import { createTranslator } from './translator';

describe('statusLabel — server enums rendered as translated copy', () => {
  const { t } = createTranslator('en');

  test('slugs the wire enum into the status table', () => {
    expect(statusLabel(t, 'participation', 'NOT_ENROLLED')).toBe('Not enrolled');
    expect(statusLabel(t, 'participation', 'COLLECTION_COMPLETED')).toBe('Collection completed');
    expect(statusLabel(t, 'job', 'COMPLETED')).toBe('Completed');
    expect(statusLabel(t, 'backend', 'operational')).toBe('Operational');
  });

  test('handles hyphenated session/auth codes', () => {
    expect(statusLabel(t, 'session', 'awaiting-sso')).toBe('Awaiting SSO');
    expect(statusLabel(t, 'auth_mode', 'cookie-bootstrap')).toBe('Cookie bootstrap');
  });

  test('an enum no table knows falls back to the humanised wire value, never the key', () => {
    expect(statusLabel(t, 'participation', 'SOME_FUTURE_STATUS')).toBe('SOME FUTURE STATUS');
  });
});
