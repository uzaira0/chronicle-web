import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { store } from '@/state/store';
import { studyOperationsApi } from '@/state/study-operations-api';
import { installRelativeRequest } from '@/test/http-fixtures';
import { ModernApp } from './modern-app';

// Each survey URL the Android reminder tap opened (SurveyReminderTapJourneyTest writes
// them to $CHRONICLE_ANDROID_SURVEY_DIR/opened-urls.txt) is loaded into the shipped app, so the page's own route,
// access bootstrap and survey route read the study, participant and access code. Run by scripts/local-ci.sh
// android-replay; skipped when the variable is unset, and failing when it is set but the file is missing or empty.
const surveyDir = process.env.CHRONICLE_ANDROID_SURVEY_DIR;
const STUDY_ID = '00000000-0000-0000-0000-000000000001';
const PARTICIPANT_ID = 'participant-001';
const ACCESS_CODES = ['CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC1', 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC2'];
const originalFetch = globalThis.fetch;

type Seen = { exchanged: string[]; frequency: string[]; days: string[][] };

/** The participant server: it answers a code for the study and participant the Android test minted it for. */
function participantServer(seen: Seen): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/chronicle/v3/participant-access/exchange') {
      seen.exchanged.push(((await request.json()) as { accessCode: string }).accessCode);
      return Response.json({
        csrfToken: 'csrf',
        expiresAt: '2099-01-01T00:00:00Z',
        formKind: 'APP_USAGE',
        participantId: PARTICIPANT_ID,
        studyId: STUDY_ID,
      });
    }
    const frequency = path.match(/^\/chronicle\/v3\/survey\/([^/]+)\/app-usage-frequency$/);
    if (frequency?.[1]) {
      seen.frequency.push(decodeURIComponent(frequency[1]));
      return Response.json({ appUsageFrequency: 'DAILY' });
    }
    const days = path.match(/^\/chronicle\/v3\/survey\/([^/]+)\/participant\/([^/]+)\/app-usage\/days$/);
    if (days?.[1] && days[2]) {
      seen.days.push([decodeURIComponent(days[1]), decodeURIComponent(days[2])]);
      return Response.json({ days: [], timeZone: 'America/Santiago', today: '2026-10-30' });
    }
    return new Response('', { status: 404 });
  }) as typeof fetch;
}

describe('Android survey reminder replay', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
    store.dispatch(studyOperationsApi.util.resetApiState());
    window.location.href = 'https://localhost/';
  });

  test.skipIf(surveyDir === undefined)(
    'every opened reminder URL reaches the survey with its study, participant and code',
    async () => {
      const urls = readFileSync(join(surveyDir ?? '', 'opened-urls.txt'), 'utf8')
        .split('\n')
        .filter(Boolean);
      expect(urls).toHaveLength(ACCESS_CODES.length);
      const restoreRequest = installRelativeRequest();
      try {
        for (const [index, value] of urls.entries()) {
          const seen: Seen = { days: [], exchanged: [], frequency: [] };
          globalThis.fetch = participantServer(seen);
          window.location.href = value;
          const view = render(<ModernApp />);
          try {
            await waitFor(() => expect(seen.days).toHaveLength(1), { timeout: 10_000 });

            expect(seen.exchanged).toEqual(ACCESS_CODES.slice(index, index + 1));
            expect(seen.frequency).toEqual([STUDY_ID]);
            expect(seen.days).toEqual([[STUDY_ID, PARTICIPANT_ID]]);
            expect(window.location.hash).not.toContain('accessCode');
          } finally {
            view.unmount();
          }
          store.dispatch(studyOperationsApi.util.resetApiState());
          window.sessionStorage.clear();
        }
      } finally {
        restoreRequest();
      }
    },
    60_000,
  );
});
