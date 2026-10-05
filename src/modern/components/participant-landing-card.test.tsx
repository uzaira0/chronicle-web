import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { LanguageProvider } from '@/i18n';
import { storeParticipantSessionContext, type ParticipantFormKind } from '@/lib/participant-access';
afterEach(() => { window.sessionStorage.clear(); });
function session(formKind: ParticipantFormKind) { storeParticipantSessionContext({ csrfToken: 'fixture-csrf', expiresAt: new Date(Date.now() + 60_000).toISOString(), formKind, studyId: 's1', participantId: 'p1' }); }

import { ParticipantLandingCard } from './participant-landing-card';

describe('ParticipantLandingCard', () => {
  test('links to the participant dashboard once under the /chronicle basename, keeping the identity', () => {
    session('PORTAL');
    render(
      <LanguageProvider initialSearch="">
        <MemoryRouter basename="/chronicle" initialEntries={['/chronicle/survey?studyId=s1&participantId=p1']}>
          <ParticipantLandingCard description="d" icon={null} title="t" />
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe('/chronicle/participant?participantId=p1&studyId=s1');
  });
});

test('W10 form sessions cannot navigate into PORTAL authority; PORTAL can', () => {
  for (const kind of ['TIME_USE_DIARY', 'APP_USAGE', 'PORTAL'] as const) {
    session(kind);
    render(<LanguageProvider initialSearch=""><MemoryRouter initialEntries={['/survey?studyId=s1&participantId=p1']}><ParticipantLandingCard description="d" icon={null} title="t" /></MemoryRouter></LanguageProvider>);
    expect(screen.queryByRole('link') !== null).toBe(kind === 'PORTAL');
    cleanup();
  }
});
