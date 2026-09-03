import { afterEach, describe, expect, mock, test } from 'bun:test';
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

  test('serves /chronicle/enroll anonymously outside the researcher app providers', () => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      `&participantId=participant-7#accessCode=${ACCESS_CODE}`;
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    globalThis.fetch = mock(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    render(<ModernApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'Review your study invitation' })).toBeTruthy();
    expect(screen.queryByText('Researcher sign in')).toBeNull();
  });

  test('serves the stable reviewer path anonymously without adding it to participant navigation', () => {
    window.location.href = 'https://public-study.example.org/chronicle/reviewer';
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });

    render(<ModernApp />);

    expect(screen.getByRole('heading', { level: 1, name: 'Reviewer enrollment' })).toBeTruthy();
    expect(screen.queryByText('Researcher sign in')).toBeNull();
  });
});
