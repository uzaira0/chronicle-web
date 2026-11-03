import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { ReviewerEnrollmentPage } from './reviewer-enrollment-page';

const STUDY_ID = '28d661b8-a45a-41b6-aec4-ed9988fa28dc';
const ENROLLMENT_CODE = 'Review_1-'.repeat(7);
const REVIEWER_SECRET = 'Reusable_reviewer_secret-2026-08-17';
const originalFetch = globalThis.fetch;

function reviewerResponse() {
  return {
    enrollmentCode: ENROLLMENT_CODE,
    preview: {
      manifest: {
        collectionSettings: { settingsVersion: 7 },
        expiresAt: '2099-09-01T12:00:00Z',
        issuedAt: '2026-08-17T12:00:00Z',
        participantId: 'play-reviewer',
        participantPolicy: {
          consentDocumentUrl: null,
          dataUseAndSharing: 'Only the approved research team may use the study records.',
          effectiveAt: '2026-08-01T00:00:00Z',
          expectedBenefits: 'There may be no direct benefit.',
          expectedDuration: 'One review session',
          foreseeableRisks: 'Privacy risks are described here.',
          privacyPolicyUrl: 'https://public-study.example.org/privacy',
          procedures: 'Review the app enrollment and data controls.',
          purpose: 'Google Play review.',
          researchContact: 'review@example.org',
          responsibleInstitution: 'Example Research Institute',
          retentionAndDeletion: 'Synthetic reviewer records are deleted after review.',
          serverOperator: 'Example Research Institute IT',
          version: 'review-1',
          withdrawalUrl: 'https://public-study.example.org/withdrawal',
        },
        schemaVersion: 1,
        serverOrigin: 'https://public-study.example.org',
        settingsVersion: 7,
        studyDescription: 'Synthetic study data for store review.',
        studyId: STUDY_ID,
        studyTitle: 'Chronicle Reviewer Study',
        withdrawalMode: 'ERASE',
      },
      manifestDigest: 'a'.repeat(64),
    },
  };
}

describe('ReviewerEnrollmentPage', () => {
  beforeEach(() => {
    window.location.href = 'https://public-study.example.org/chronicle/reviewer';
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://public-study.example.org' });
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    mock.restore();
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test('an incomplete secret can be submitted and gets an inline correction with focus', () => {
    const fetchMock = mock(() => Promise.resolve(Response.json({})));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ReviewerEnrollmentPage />);
    const input = screen.getByLabelText('Reviewer secret');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Verify reviewer enrollment' });
    expect(submit.disabled).toBe(false);
    fireEvent.change(input, { target: { value: 'short' } });
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toContain('32');
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('keeps the reusable secret in memory and exchanges it for a validated package-targeted handoff', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(reviewerResponse()), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ReviewerEnrollmentPage />);

    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reviewer secret'), { target: { value: REVIEWER_SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer enrollment' }));

    expect(await screen.findByRole('heading', { name: 'Chronicle Reviewer Study' })).toBeTruthy();
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestUrl).toBe('/chronicle/v4/mobile/reviewer-enrollment');
    expect(new Headers(requestInit.headers).get('X-Chronicle-Reviewer-Secret')).toBe(REVIEWER_SECRET);
    expect(requestInit.body).toBeUndefined();
    expect(requestInit.cache).toBe('no-store');
    expect(requestInit.credentials).toBe('omit');
    expect(requestInit.redirect).toBe('error');
    expect(requestInit.referrerPolicy).toBe('no-referrer');
    expect(window.location.href).not.toContain(REVIEWER_SECRET);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(REVIEWER_SECRET);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(REVIEWER_SECRET);

    const handoff = screen.getByRole('link', { name: 'Open Chronicle for Android' }).getAttribute('href') ?? '';
    expect(handoff).toContain(`#accessCode=${ENROLLMENT_CODE}#Intent;`);
    expect(handoff).toContain('package=com.bcm.chronicle;');
    const fallback = decodeURIComponent(/S\.browser_fallback_url=([^;]+);/.exec(handoff)?.[1] ?? '');
    expect(fallback).toBe('https://play.google.com/store/apps/details?id=com.bcm.chronicle');
    expect(fallback).not.toContain(ENROLLMENT_CODE);
  });

  // The reviewer secret is reusable: a copy of this page served from any other origin (a dashboard host, a mirror)
  // must refuse to send it anywhere, even to the configured server.
  test.each([
    'https://dashboard.public-study.example.org/chronicle/reviewer',
    'https://public-study.example.org:8443/chronicle/reviewer',
  ])('a page served from %s never sends the reviewer secret', async (pageUrl) => {
    window.location.href = pageUrl;
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(reviewerResponse()))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ReviewerEnrollmentPage />);
    fireEvent.change(screen.getByLabelText('Reviewer secret'), { target: { value: REVIEWER_SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer enrollment' }));
    expect(await screen.findByText('This page is not running on the configured public study server.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
  });

  test.each([429, 503, 'transport'])('retains the cleared secret for retry after %s', async (failure) => {
    const fetchMock = mock()
      .mockImplementationOnce(() =>
        typeof failure === 'number'
          ? Promise.resolve(new Response('', { status: failure }))
          : Promise.reject(new TypeError('Failed to fetch')),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(reviewerResponse()))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<ReviewerEnrollmentPage />);
    fireEvent.change(screen.getByLabelText('Reviewer secret'), { target: { value: REVIEWER_SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer enrollment' }));
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByLabelText('Reviewer secret')).toHaveProperty('value', '');
    expect(screen.queryByText(/check the reviewer secret/i)).toBeNull();
    expect(
      screen.getByText(
        typeof failure === 'number'
          ? 'The reviewer enrollment server is temporarily busy or unavailable. Try again shortly.'
          : 'Could not contact the reviewer enrollment server. Check your connection and try again.',
      ),
    ).toBeTruthy();
    fireEvent.click(retry);
    expect(await screen.findByRole('heading', { name: 'Chronicle Reviewer Study' })).toBeTruthy();
    expect(
      new Headers((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get(
        'X-Chronicle-Reviewer-Secret',
      ),
    ).toBe(REVIEWER_SECRET);
  });

  test.each([
    [401, '', 'The reviewer enrollment could not be verified. Check the reviewer secret and try again.'],
    [403, '', 'Reviewer enrollment is unavailable. Ask the operator to check the reviewer study and participant.'],
    [404, '', 'Reviewer enrollment is unavailable. Ask the operator to check the reviewer study and participant.'],
    [409, '', 'Reviewer enrollment is unavailable. Ask the operator to check the reviewer study and participant.'],
    [200, 'not-json', 'The reviewer enrollment server returned an unreadable response. Contact the operator.'],
    [
      200,
      '{}',
      'The reviewer study disclosure could not be verified. Ask the operator to check the study configuration.',
    ],
    [
      200,
      'null',
      'The reviewer study disclosure could not be verified. Ask the operator to check the study configuration.',
    ],
  ])('shows the established cause for HTTP %s', async (status, body, message) => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
    render(<ReviewerEnrollmentPage />);
    fireEvent.change(screen.getByLabelText('Reviewer secret'), { target: { value: REVIEWER_SECRET } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify reviewer enrollment' }));
    expect(await screen.findByText(message)).toBeTruthy();
    if (body === 'not-json') expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    else expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
