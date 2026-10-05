import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';

import { LanguageProvider } from '@/i18n';

import { RouteDocumentTitle } from './route-document-title';

describe('RouteDocumentTitle', () => {
  test('updates translated titles on navigation without exposing route or query identifiers', () => {
    render(
      <LanguageProvider initialSearch="">
        <MemoryRouter initialEntries={['/login?participantId=private-participant']}>
          <RouteDocumentTitle />
          <nav>
            <Link to="/studies/private-study/compliance?participantId=private-participant">Compliance</Link>
            <Link to="/questionnaire?studyId=private-study&participantId=private-participant">
              Questionnaire
            </Link>
            <Link to="/time-use-diary?studyId=private-study&participantId=private-participant">Diary</Link>
            <Link to="/participant?studyId=private-study&participantId=private-participant">Participant</Link>
          </nav>
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(document.title).toBe('Sign in to the dashboard | Chronicle');
    fireEvent.click(screen.getByRole('link', { name: 'Compliance' }));
    expect(document.title).toBe('Compliance | Chronicle');
    fireEvent.click(screen.getByRole('link', { name: 'Questionnaire' }));
    expect(document.title).toBe('Study Questionnaire | Chronicle');
    fireEvent.click(screen.getByRole('link', { name: 'Diary' }));
    expect(document.title).toBe('Time Use Diary | Chronicle');
    fireEvent.click(screen.getByRole('link', { name: 'Participant' }));
    expect(document.title).toBe('Participant access workspace | Chronicle');
    expect(document.title).not.toContain('private-study');
    expect(document.title).not.toContain('private-participant');
  });

  test('is attached to the application router while the static build title remains intact', () => {
    const router = readFileSync(new URL('./router.tsx', import.meta.url), 'utf-8');
    const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf-8');

    expect(router).toContain("import { RouteDocumentTitle } from '@/app/route-document-title';");
    expect(router).toMatch(/<RouteDocumentTitle\s*\/>/);
    expect(html).toContain('<title>Chronicle</title>');
  });
});
