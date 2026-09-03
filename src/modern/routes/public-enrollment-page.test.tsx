import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';

import { PublicEnrollmentPage } from './public-enrollment-page';

const STUDY_ID = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';
const ACCESS_CODE = 'Abc_123-'.repeat(8);
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.bcm.chronicle';
const originalFetch = globalThis.fetch;

function previewResponse() {
  return {
    manifest: {
      collectionSettings: { settingsVersion: 7 },
      expiresAt: '2099-09-01T12:00:00Z',
      issuedAt: '2026-08-17T12:00:00Z',
      participantId: 'participant-7',
      participantPolicy: {
        consentDocumentUrl: 'https://public-study.example.org/consent',
        dataUseAndSharing: 'Only the approved research team may use the study records.',
        effectiveAt: '2026-08-01T00:00:00Z',
        expectedBenefits: 'This study may improve future research methods.',
        expectedDuration: 'Four weeks',
        foreseeableRisks: 'Privacy risks are described in the consent form.',
        privacyPolicyUrl: 'https://public-study.example.org/privacy',
        procedures: 'Keep Chronicle installed and answer the study prompts.',
        purpose: 'Understand daily technology use.',
        researchContact: 'Research Team, research@example.org',
        responsibleInstitution: 'Example Research Institute',
        retentionAndDeletion: 'Records follow the study retention schedule.',
        serverOperator: 'Example Research Institute IT',
        version: 'consent-7',
        withdrawalUrl: 'https://public-study.example.org/withdrawal',
      },
      schemaVersion: 1,
      serverOrigin: 'https://public-study.example.org',
      settingsVersion: 7,
      studyDescription: 'A study of daily technology use.',
      studyId: STUDY_ID,
      studyTitle: 'Daily Technology Study',
    },
    manifestDigest: 'a'.repeat(64),
  };
}

const INVALID_ANDROID_PREVIEW_MUTATIONS: Array<[string, (preview: ReturnType<typeof previewResponse>) => void]> = [
  ['expiry before issuance', (preview) => (preview.manifest.issuedAt = '2100-01-01T00:00:00Z')],
  [
    'nonpositive collection revision',
    (preview) => {
      preview.manifest.settingsVersion = 0;
      preview.manifest.collectionSettings.settingsVersion = 0;
    },
  ],
  ['mismatched collection revisions', (preview) => (preview.manifest.collectionSettings.settingsVersion = 8)],
  ['invalid policy effective date', (preview) => (preview.manifest.participantPolicy.effectiveAt = 'not-a-date')],
  [
    'policy effective date without offset',
    (preview) => (preview.manifest.participantPolicy.effectiveAt = '2026-08-01'),
  ],
  ['manifest issue time without offset', (preview) => (preview.manifest.issuedAt = '2026-08-17T12:00:00')],
  ['oversized policy version', (preview) => (preview.manifest.participantPolicy.version = 'v'.repeat(129))],
  ['oversized policy text', (preview) => (preview.manifest.participantPolicy.purpose = 'p'.repeat(8_001))],
];

describe('PublicEnrollmentPage', () => {
  beforeEach(() => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      `&participantId=participant-7#accessCode=${ACCESS_CODE}`;
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
  });

  afterEach(() => {
    mock.restore();
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
    window.location.href = 'https://public-study.example.org/';
  });

  test('loads and displays the authoritative server preview without putting the code in the URL', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(previewResponse()), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(await screen.findByRole('heading', { name: 'Daily Technology Study' })).toBeTruthy();
    expect(screen.getByText('Example Research Institute')).toBeTruthy();
    expect(screen.getByText('Example Research Institute IT')).toBeTruthy();
    expect(screen.getByText('https://public-study.example.org')).toBeTruthy();

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe(
      `https://public-study.example.org/chronicle/v4/study/${STUDY_ID}/participant/participant-7/enrollment-preview`,
    );
    expect(requestUrl).not.toContain(ACCESS_CODE);
    expect(new Headers(requestInit.headers).get('X-Chronicle-Enrollment-Code')).toBe(ACCESS_CODE);
    expect(requestInit.credentials).toBe('omit');
    expect(requestInit.redirect).toBe('error');
  });

  test('targets com.bcm.chronicle and keeps the Play fallback credential-free', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(previewResponse()), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    const openApp = await screen.findByRole('link', { name: 'Open Chronicle for Android' });
    const handoff = openApp.getAttribute('href') ?? '';
    expect(handoff).toContain('intent://enroll?');
    expect(handoff).toContain(`#accessCode=${ACCESS_CODE}#Intent;`);
    expect(handoff).toContain('scheme=chronicle;');
    expect(handoff).toContain('package=com.bcm.chronicle;');

    const fallback = /S\.browser_fallback_url=([^;]+);/.exec(handoff)?.[1];
    expect(fallback).toBeTruthy();
    expect(decodeURIComponent(fallback ?? '')).toBe(PLAY_URL);
    expect(decodeURIComponent(fallback ?? '')).not.toContain(ACCESS_CODE);

    const playLink = screen.getByRole('link', { name: 'Get Chronicle on Google Play' });
    expect(playLink.getAttribute('href')).toBe(PLAY_URL);
    expect(playLink.getAttribute('href')).not.toContain(ACCESS_CODE);
  });

  test('does not offer an app handoff when the preview identity does not match the invitation', async () => {
    const mismatched = previewResponse();
    mismatched.manifest.participantId = 'someone-else';
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mismatched), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't verify this study invitation/i)).toBeTruthy();
    });
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
  });

  test('accepts a valid authoritative preview whose optional short description is blank', async () => {
    const preview = previewResponse();
    preview.manifest.studyDescription = '';
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(preview), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(await screen.findByRole('heading', { name: 'Daily Technology Study' })).toBeTruthy();
    expect(screen.getByText(/did not provide a short description/i)).toBeTruthy();
  });

  test('rejects a credential in the query string without contacting the study server', () => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      '&participantId=participant-7&accessCode=query-secret';
    const fetchMock = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(screen.getByText(/credential must be in the URL fragment/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
  });

  test('rejects a fragment credential that the Android app cannot consume', () => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      '&participantId=participant-7#accessCode=short';
    const fetchMock = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(screen.getByText(/incomplete or invalid/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(
    INVALID_ANDROID_PREVIEW_MUTATIONS,
  )('does not offer a handoff for a preview Android rejects: %s', async (_name, mutatePreview) => {
    const preview = previewResponse();
    mutatePreview(preview);
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(preview), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/couldn't verify this study invitation/i)).toBeTruthy();
    });
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
  });
});
