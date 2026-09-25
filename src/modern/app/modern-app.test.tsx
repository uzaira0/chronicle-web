import { afterEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';

import { ModernApp } from './modern-app';

const STUDY_ID = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';
const ACCESS_CODE = 'Abc_123-'.repeat(8);
const originalFetch = globalThis.fetch;

describe('ModernApp public routes', () => {
  afterEach(() => {
    mock.restore();
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
    window.location.href = 'https://public-study.example.org/';
  });

  test('serves /chronicle/enroll anonymously outside the researcher app providers', async () => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      `&participantId=participant-7#accessCode=${ACCESS_CODE}`;
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    globalThis.fetch = mock(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    render(<ModernApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Review your study invitation' })).toBeTruthy();
    expect(screen.queryByText('Researcher sign in')).toBeNull();
  });

  test('serves the stable reviewer path anonymously without adding it to participant navigation', async () => {
    window.location.href = 'https://public-study.example.org/chronicle/reviewer';
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });

    render(<ModernApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Reviewer enrollment' })).toBeTruthy();
    expect(screen.queryByText('Researcher sign in')).toBeNull();
  });

  // production-readiness F3: the participant /enroll page must not download the researcher
  // dashboard (store, RTK Query, router), and dashboard visits must not download the public
  // enrollment pages. A static import here puts them all in the entry chunk.
  test('loads each surface through a dynamic import, never a static one', () => {
    const source = readFileSync(new URL('./modern-app.tsx', import.meta.url), 'utf-8');
    for (const module of [
      '@/app/providers',
      '@/app/router',
      '@/routes/public-enrollment-page',
      '@/routes/reviewer-enrollment-page',
    ]) {
      expect(source).not.toMatch(new RegExp(`^import [^;]*from '${module}'`, 'm'));
      expect(source).toContain(`import('${module}')`);
    }
  });
});
