import { afterEach, describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

import { ParticipantLandingCard } from '@/components/participant-landing-card';
import { storeParticipantSessionContext } from '@/lib/participant-access';

import { ParticipantShell } from './participant-shell';

const CONTEXT = {
  csrfToken: 'csrf',
  expiresAt: '2099-01-01T00:00:00Z',
  formKind: 'APP_USAGE' as const,
  participantId: 'participant-7',
  studyId: '28d661b8-a45a-41b6-aec4-ed9988fa28dc',
};

function renderShell(content = <p>form</p>) {
  render(
    <MemoryRouter initialEntries={['/survey']}>
      <Routes>
        <Route element={<ParticipantShell />}>
          <Route element={content} path="survey" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ParticipantShell policy footer', () => {
  afterEach(() => window.sessionStorage.clear());

  test('links the study privacy policy and withdrawal instructions on every participant form', () => {
    storeParticipantSessionContext({
      ...CONTEXT,
      privacyPolicyUrl: 'https://study.example.org/privacy',
      withdrawalUrl: 'https://study.example.org/withdrawal',
    });

    renderShell();

    expect(screen.getByRole('link', { name: /Study privacy policy/ }).getAttribute('href')).toBe(
      'https://study.example.org/privacy',
    );
    expect(screen.getByRole('link', { name: /Study withdrawal instructions/ }).getAttribute('href')).toBe(
      'https://study.example.org/withdrawal',
    );
  });

  test('drops links that are not https', () => {
    storeParticipantSessionContext({
      ...CONTEXT,
      privacyPolicyUrl: 'javascript:alert(1)',
      withdrawalUrl: null,
    });

    renderShell();

    expect(screen.queryByRole('link', { name: /Study privacy policy/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Study withdrawal instructions/ })).toBeNull();
  });

  test('provides a level-one brand heading followed by the participant page heading', () => {
    renderShell(
      <ParticipantLandingCard description="Choose a form." icon={null} title="Take the survey" />,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Chronicle' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Take the survey' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });
});
