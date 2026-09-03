import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { installBrowserEnv, uninstallBrowserEnv } from '../test/browser-env';

const ACCESS_CODE = 'Abc_123-'.repeat(8);
const ACCESS_CODE_CHARACTER = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_');

let importCtr = 0;
function nextId() {
  importCtr += 1;
  return importCtr;
}

/**
 * Property tests for participant link helpers.
 * The property checks use the same deployment-provided public origin required in production.
 */
describe('participant-links properties', () => {
  beforeEach(() => {
    installBrowserEnv({ url: 'https://dashboard.internal.example:8081/chronicle' });
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
  });

  afterEach(() => {
    uninstallBrowserEnv();
  });

  it('getHttpsEnrollmentLink always starts with the configured public HTTPS enrollment route', async () => {
    const { getHttpsEnrollmentLink } = (await import(
      `./participant-links.ts?pA=${nextId()}`
    )) as typeof import('./participant-links');
    fc.assert(
      fc.property(fc.string(), fc.string(), (studyId, participantId) => {
        expect(getHttpsEnrollmentLink(studyId, participantId, { accessCode: ACCESS_CODE })).toStartWith(
          'https://public-study.example.org/chronicle/enroll',
        );
      }),
    );
  });

  it('getHttpsEnrollmentLink always contains both studyId and participantId params', async () => {
    const { getHttpsEnrollmentLink } = (await import(
      `./participant-links.ts?pB=${nextId()}`
    )) as typeof import('./participant-links');
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (studyId, participantId) => {
        const link = getHttpsEnrollmentLink(studyId, participantId, { accessCode: ACCESS_CODE });
        expect(link).toContain('studyId=');
        expect(link).toContain('participantId=');
      }),
    );
  });

  it('getHttpsEnrollmentLink URL-encodes params that round-trip via URLSearchParams', async () => {
    const { getHttpsEnrollmentLink } = (await import(
      `./participant-links.ts?pC=${nextId()}`
    )) as typeof import('./participant-links');
    fc.assert(
      fc.property(fc.webSegment(), fc.webSegment(), (studyId, participantId) => {
        const link = getHttpsEnrollmentLink(studyId, participantId, { accessCode: ACCESS_CODE });
        // Extract the query string after the ?
        const queryString = (link.split('?')[1] ?? '').split('#')[0];
        const params = new URLSearchParams(queryString);
        expect(params.get('studyId')).toBe(studyId);
        expect(params.get('participantId')).toBe(participantId);
        expect(new URL(link).origin).toBe('https://public-study.example.org');
      }),
    );
  });

  it('keeps every Android-compatible access code out of the query string', async () => {
    const { getHttpsEnrollmentLink } = (await import(
      `./participant-links.ts?pD=${nextId()}`
    )) as typeof import('./participant-links');
    fc.assert(
      fc.property(
        fc.array(ACCESS_CODE_CHARACTER, { maxLength: 256, minLength: 32 }).map((characters) => characters.join('')),
        (accessCode) => {
          const link = getHttpsEnrollmentLink('study-1', 'participant-1', { accessCode });
          const [beforeFragment = '', fragment = ''] = link.split('#', 2);
          const query = beforeFragment.split('?')[1] ?? '';
          expect(new URLSearchParams(query).has('accessCode')).toBe(false);
          expect(new URLSearchParams(fragment).get('accessCode')).toBe(accessCode);
        },
      ),
    );
  });
});
