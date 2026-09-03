import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';

const ACCESS_CODE = 'Abc_123-'.repeat(8);

// participant-links.ts has no module-level state. A single dynamic import suffices.
let participantLinks: typeof import('./participant-links');

describe('participant link helpers', () => {
  beforeEach(async () => {
    installBrowserEnv({ url: 'https://dashboard.internal.example:8081/chronicle/studies/abc' });
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', {
      serverUrl: 'https://public-study.example.org:8443/',
    });
    participantLinks = await import('./participant-links');
  });

  afterEach(() => {
    uninstallBrowserEnv();
  });

  it('getHttpsEnrollmentLink builds the public HTTPS landing link', () => {
    const link = participantLinks.getHttpsEnrollmentLink('study-1', 'participant-1', { accessCode: ACCESS_CODE });
    expect(link).toBe(
      'https://public-study.example.org:8443/chronicle/enroll?' +
        `studyId=study-1&participantId=participant-1#accessCode=${ACCESS_CODE}`,
    );
  });

  it('getHttpsEnrollmentLink URL-encodes special characters', () => {
    const link = participantLinks.getHttpsEnrollmentLink('study with spaces', 'p&1', { accessCode: ACCESS_CODE });
    expect(link).toContain('studyId=study+with+spaces');
    expect(link).toContain('participantId=p%261');
  });

  it('does not expose a raw custom-scheme enrollment link helper', () => {
    expect(Reflect.has(participantLinks, 'getEnrollmentLink')).toBe(false);
  });

  it('normalizes the deployment-configured public server to a root HTTPS origin', () => {
    expect(participantLinks.getDefaultEnrollmentServerUrl()).toBe('https://public-study.example.org:8443');
  });

  it('allows a private HTTPS origin only when the deployment explicitly marks a local trial', () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', {
      allowPrivateServerUrl: true,
      serverUrl: 'https://192.168.1.50:444',
    });

    expect(participantLinks.getDefaultEnrollmentServerUrl()).toBe('https://192.168.1.50:444');
  });

  it.each([
    undefined,
    '',
    'http://public-study.example.org',
    'https://user:password@public-study.example.org',
    'https://public-study.example.org/chronicle',
    'https://public-study.example.org?from=dashboard',
    'https://public-study.example.org#private-port',
    'https://localhost',
    'https://127.0.0.1',
    'https://10.20.30.40',
    'https://172.16.0.1',
    'https://192.168.1.1',
    'https://169.254.1.1',
    'https://192.0.2.1',
    'https://198.18.0.1',
    'https://198.51.100.1',
    'https://203.0.113.1',
    'https://224.0.0.1',
    'https://255.255.255.255',
    'https://[::1]',
    'https://[fd00::1]',
    'https://[fe80::1]',
    'https://public-study.example.org:8081',
  ])('rejects an absent or invalid runtime public server URL: %s', (serverUrl) => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl });
    expect(() => participantLinks.getDefaultEnrollmentServerUrl()).toThrow(/public HTTPS server URL/i);
  });

  it('getHttpsEnrollmentLink uses the public server and never the dashboard origin', () => {
    const link = participantLinks.getHttpsEnrollmentLink('s1', 'p1', { accessCode: ACCESS_CODE });
    expect(link).toBe(
      `https://public-study.example.org:8443/chronicle/enroll?studyId=s1&participantId=p1#accessCode=${ACCESS_CODE}`,
    );
    expect(link).not.toContain('dashboard.internal.example');
    expect(link).not.toContain('8081');
  });

  it('keeps the enrollment access code exclusively in the fragment', () => {
    const link = new URL(participantLinks.getHttpsEnrollmentLink('s1', 'p1', { accessCode: ACCESS_CODE }));
    expect(link.searchParams.has('accessCode')).toBe(false);
    expect(new URLSearchParams(link.hash.slice(1)).get('accessCode')).toBe(ACCESS_CODE);
  });

  it.each([
    'short',
    `${'a'.repeat(32)}/`,
    'a'.repeat(257),
    `${'a'.repeat(31)} `,
    `${'a'.repeat(32)}\n`,
  ])('rejects an access code Android cannot consume', (accessCode) => {
    expect(() => participantLinks.getHttpsEnrollmentLink('s1', 'p1', { accessCode })).toThrow(
      /valid one-time participant access code/i,
    );
  });

  it('accepts the Android credential length boundaries', () => {
    expect(() => participantLinks.getHttpsEnrollmentLink('s1', 'p1', { accessCode: 'a'.repeat(32) })).not.toThrow();
    expect(() => participantLinks.getHttpsEnrollmentLink('s1', 'p1', { accessCode: 'a'.repeat(256) })).not.toThrow();
  });

  it('getTimeUseDiaryLink builds a TUD link with day param', () => {
    const link = participantLinks.getTimeUseDiaryLink('s1', 'p1', 'yesterday', '2026-07-12', ACCESS_CODE);
    expect(link).toBe(
      'https://public-study.example.org:8443/chronicle/time-use-diary?' +
        `date=2026-07-12&day=yesterday&participantId=p1&studyId=s1#accessCode=${ACCESS_CODE}`,
    );
  });

  it('getTimeUseDiaryLink supports today period', () => {
    const link = participantLinks.getTimeUseDiaryLink('s1', 'p1', 'today', '2026-07-13', ACCESS_CODE);
    expect(link).toContain('day=today');
  });

  it('getAppUsageLink builds a survey link with a fragment-only access code', () => {
    const link = participantLinks.getAppUsageLink('s1', 'p1', '2026-07-13', ACCESS_CODE);
    expect(link).toBe(
      'https://public-study.example.org:8443/chronicle/survey?' +
        `date=2026-07-13&studyId=s1&participantId=p1#accessCode=${ACCESS_CODE}`,
    );
  });

  it('refuses to generate links when runtime configuration is missing instead of guessing from window.location', () => {
    Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
    expect(() => participantLinks.getHttpsEnrollmentLink('x', 'y', { accessCode: ACCESS_CODE })).toThrow(
      /public HTTPS server URL/i,
    );
  });
});
