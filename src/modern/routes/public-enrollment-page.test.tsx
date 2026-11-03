import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';
import { getHttpsEnrollmentLink } from '@/lib/participant-links';
import { TRIAL_CA_PARAMETER } from '@/test/trial-ca';

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
      withdrawalMode: 'ERASE',
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

  test.each([
    [
      'ERASE',
      'Withdrawing stops collection at once. Data already collected is kept or erased by the study team, according to this study’s withdrawal policy.',
    ],
    ['KEEP_PRIOR_DATA', 'Withdrawing stops collection; this study keeps data collected before withdrawal.'],
  ])('discloses %s before the participant continues enrollment', async (mode, disclosure) => {
    const preview = previewResponse();
    preview.manifest.withdrawalMode = mode;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(preview), { status: 200 })),
    ) as unknown as typeof fetch;
    render(<PublicEnrollmentPage />);
    expect(await screen.findByText(disclosure)).toBeTruthy();
  });

  // A pilot participant reads the disclosure in Spanish: the withdrawal mode, what Chronicle keeps
  // (consent evidence without automatic purge, IP addresses withheld), the operator, and the saved policy links.
  test.each([
    [
      'ERASE',
      'El equipo del estudio conserva o elimina los datos ya recopilados según la política de retiro de este estudio.',
    ],
    ['KEEP_PRIOR_DATA', 'este estudio conserva los datos recopilados antes del retiro.'],
  ])('discloses %s, retention and policy links in Spanish', async (mode, withdrawal) => {
    const preview = previewResponse();
    preview.manifest.withdrawalMode = mode;
    globalThis.fetch = mock(() => Promise.resolve(Response.json(preview))) as unknown as typeof fetch;
    try {
      render(
        <LanguageProvider initialSearch="?lang=es">
          <PublicEnrollmentPage />
        </LanguageProvider>,
      );
      expect(await screen.findByText(new RegExp(withdrawal))).toBeTruthy();
      const text = document.body.textContent ?? '';
      expect(text).toContain('Operador del servidor');
      expect(text).toContain('Example Research Institute IT');
      expect(text).toContain('Retención y eliminación');
      expect(text).toContain('La evidencia de consentimiento conserva el ID del participante');
      expect(text).toContain('sin eliminación automática');
      expect(text).toContain('Las direcciones IP de los participantes no se incluyen en los registros de auditoría');
      expect(text).toContain('copias de seguridad rotativas');
      for (const english of ['Withdrawing', 'without automatic purge', 'Server operator', 'Retention and deletion'])
        expect(text).not.toContain(english);
      expect(screen.getByRole('link', { name: /Política de privacidad del estudio/ }).getAttribute('href')).toBe(
        'https://public-study.example.org/privacy',
      );
      expect(screen.getByRole('link', { name: /Instrucciones para retirarse del estudio/ }).getAttribute('href')).toBe(
        'https://public-study.example.org/withdrawal',
      );
    } finally {
      render(<LanguageProvider initialSearch="?lang=en">{null}</LanguageProvider>);
    }
  });

  test('loads and displays the authoritative server preview without putting the code in the URL', async () => {
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(previewResponse()), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(await screen.findByRole('heading', { name: 'Daily Technology Study' })).toBeTruthy();
    expect(screen.getByText('Example Research Institute')).toBeTruthy();
    expect(screen.getByText('Example Research Institute IT')).toBeTruthy();
    expect(screen.getByText('https://public-study.example.org')).toBeTruthy();
    const disclosure = screen.getByText(/Participant IP addresses are withheld/).textContent;
    expect(disclosure).toContain('User-Agent');
    expect(disclosure).toContain('Staff requests may retain keyed IP fingerprints when configured');
    expect(disclosure).toContain('rotated backups');
    expect(disclosure).toContain('Consent evidence retains participant and random device IDs');
    expect(disclosure).toContain('versions, decisions and timestamps after participant or study erasure');
    expect(disclosure).toContain('without automatic purge');
    expect(disclosure).not.toContain('always records your IP address');

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
    expect(handoff).not.toContain('serverCa=');

    const fallback = /S\.browser_fallback_url=([^;]+);/.exec(handoff)?.[1];
    expect(fallback).toBeTruthy();
    expect(decodeURIComponent(fallback ?? '')).toBe(PLAY_URL);
    expect(decodeURIComponent(fallback ?? '')).not.toContain(ACCESS_CODE);

    const playLink = screen.getByRole('link', { name: 'Get Chronicle on Google Play' });
    expect(playLink.getAttribute('href')).toBe(PLAY_URL);
    expect(playLink.getAttribute('href')).not.toContain(ACCESS_CODE);
  });

  // The invitation the dashboard's QR/copy field carries (the production producer),
  // opened in the browser, hands Android exactly the study, participant, server, CA root and code, at both ends
  // of the code length and participant-id rules, on a public server and on a LAN trial server with its own CA.
  // With CHRONICLE_ENROLLMENT_HANDOFF_FIXTURE set, the produced links are written there for the Android consumer
  // test (Intent.parseUri) to read.
  test('the dashboard invitation reaches the Android handoff unchanged', async () => {
    const cases = [
      {
        accessCode: `${'Ab0_-'.repeat(6)}zz`,
        participantId: 'CL-001.a_b',
        serverCa: null,
        serverUrl: 'https://pilot-study.example.org',
        privateHost: false,
      },
      {
        accessCode: 'Z9_-'.repeat(64),
        participantId: `P${'x'.repeat(253)}.`,
        serverCa: TRIAL_CA_PARAMETER,
        serverUrl: 'https://192.168.10.20:8443',
        privateHost: true,
      },
    ];
    const produced: { invitation: string; handoff: string; expected: Record<string, string | null> }[] = [];
    for (const entry of cases) {
      Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', {
        allowPrivateServerUrl: entry.privateHost,
        serverUrl: entry.serverUrl,
      });
      const invitation = getHttpsEnrollmentLink(STUDY_ID, entry.participantId, {
        accessCode: entry.accessCode,
        serverCa: entry.serverCa,
      });
      const preview = previewResponse();
      preview.manifest.participantId = entry.participantId;
      preview.manifest.serverOrigin = entry.serverUrl;
      globalThis.fetch = mock(() => Promise.resolve(Response.json(preview))) as unknown as typeof fetch;
      window.location.href = invitation;
      const view = render(<PublicEnrollmentPage />);
      const handoff =
        (await screen.findByRole('link', { name: 'Open Chronicle for Android' })).getAttribute('href') ?? '';
      view.unmount();
      expect(window.location.hash).toBe('');

      const [address, fragment, intent] = handoff.split('#');
      expect(address?.startsWith('intent://enroll?')).toBe(true);
      const query = new URLSearchParams(address?.slice('intent://enroll?'.length));
      expect(Object.fromEntries(query)).toEqual({
        participantId: entry.participantId,
        serverUrl: entry.serverUrl,
        studyId: STUDY_ID,
        ...(entry.serverCa ? { serverCa: entry.serverCa } : {}),
      });
      expect(Object.fromEntries(new URLSearchParams(fragment))).toEqual({ accessCode: entry.accessCode });
      expect(intent?.startsWith('Intent;scheme=chronicle;package=com.bcm.chronicle;')).toBe(true);
      expect(intent?.endsWith(';end')).toBe(true);
      // The direct-link entry: the invitation itself names the same study, participant, CA and code.
      const direct = new URL(invitation);
      expect(direct.origin).toBe(entry.serverUrl);
      expect(direct.pathname).toBe('/chronicle/enroll');
      expect(direct.searchParams.get('participantId')).toBe(entry.participantId);
      expect(direct.searchParams.get('serverCa')).toBe(entry.serverCa);
      expect(new URLSearchParams(direct.hash.slice(1)).get('accessCode')).toBe(entry.accessCode);
      produced.push({
        invitation,
        handoff,
        expected: {
          accessCode: entry.accessCode,
          participantId: entry.participantId,
          serverCa: entry.serverCa,
          serverUrl: entry.serverUrl,
          studyId: STUDY_ID,
        },
      });
    }
    const out = process.env.CHRONICLE_ENROLLMENT_HANDOFF_FIXTURE;
    if (out) writeFileSync(out, `${JSON.stringify(produced, null, 2)}\n`);
  });

  test('hands the local trial CA root from the invitation to the app unchanged', async () => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      `&participantId=participant-7&serverCa=${TRIAL_CA_PARAMETER}#accessCode=${ACCESS_CODE}`;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(previewResponse()), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    const openApp = await screen.findByRole('link', { name: 'Open Chronicle for Android' });
    const handoff = openApp.getAttribute('href') ?? '';
    const query = new URLSearchParams(handoff.slice(handoff.indexOf('?') + 1, handoff.indexOf('#')));
    expect(query.get('serverCa')).toBe(TRIAL_CA_PARAMETER);
    expect(query.get('serverUrl')).toBe('https://public-study.example.org');
  });

  test.each([
    ['too short', 'AAAA'],
    ['not base64url', `${TRIAL_CA_PARAMETER.slice(0, 200)}+/=`],
    ['empty', ''],
    ['not DER', 'A'.repeat(120)],
    ['truncated certificate', TRIAL_CA_PARAMETER.slice(0, -8)],
  ])('rejects an invitation whose CA root parameter is %s', async (_label, serverCa) => {
    window.location.href =
      `https://public-study.example.org/chronicle/enroll?studyId=${STUDY_ID}` +
      `&participantId=participant-7&serverCa=${encodeURIComponent(serverCa)}#accessCode=${ACCESS_CODE}`;
    const fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(previewResponse()), { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(await screen.findByText(/incomplete or invalid/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('does not offer an app handoff when the preview identity does not match the invitation', async () => {
    const mismatched = previewResponse();
    mismatched.manifest.participantId = 'someone-else';
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mismatched), { status: 200 })),
    ) as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/study disclosure could not be verified/i)).toBeTruthy();
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

  // An operator who left the public server URL unset (or set it to a private address) gets a page that says so,
  // never a preview fetched from wherever the page happens to be served.
  test('a deployment without a valid public server says so without contacting any server', () => {
    Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', { serverUrl: 'https://10.0.0.5' });
    const fetchMock = mock(() => Promise.resolve(new Response('{}', { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<PublicEnrollmentPage />);

    expect(screen.getByText('This enrollment page does not have a valid public study server.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
    expect(window.location.hash).toBe('');
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

  test.each(INVALID_ANDROID_PREVIEW_MUTATIONS)(
    'does not offer a handoff for a preview Android rejects: %s',
    async (_name, mutatePreview) => {
      const preview = previewResponse();
      mutatePreview(preview);
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify(preview), { status: 200 })),
      ) as unknown as typeof fetch;

      render(<PublicEnrollmentPage />);

      await waitFor(() => {
        expect(screen.getByText(/study disclosure could not be verified/i)).toBeTruthy();
      });
      expect(screen.queryByRole('link', { name: 'Open Chronicle for Android' })).toBeNull();
    },
  );

  test.each([408, 429, 503])(
    'retries HTTP %s with the original invitation after clearing the address',
    async (status) => {
      const fetchMock = mock()
        .mockImplementationOnce(() => Promise.resolve(new Response('', { status })))
        .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(previewResponse()))));
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      render(<PublicEnrollmentPage />);
      expect(
        await screen.findByText('The study server is temporarily busy or unavailable. Try again shortly.'),
      ).toBeTruthy();
      expect(window.location.hash).toBe('');
      expect(screen.queryByText(/ask.*new link/i)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('heading', { name: 'Daily Technology Study' })).toBeTruthy();
      expect(
        new Headers((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get(
          'X-Chronicle-Enrollment-Code',
        ),
      ).toBe(ACCESS_CODE);
    },
  );

  test.each([
    [new TypeError('Failed to fetch'), 'Could not contact the study server. Check your connection and try again.'],
    [new DOMException('Request timed out', 'TimeoutError'), 'The study server did not respond in time. Try again.'],
  ])('keeps the invitation available after a transport failure (%s)', async (failure, message) => {
    const fetchMock = mock()
      .mockImplementationOnce(() => Promise.reject(failure))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(previewResponse()))));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(<PublicEnrollmentPage />);
    expect(await screen.findByText(message)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Daily Technology Study' })).toBeTruthy();
  });

  test.each([401, 410])('asks for a new link only for credential rejection (%s)', async (status) => {
    globalThis.fetch = mock(() => Promise.resolve(new Response('', { status }))) as unknown as typeof fetch;
    render(<PublicEnrollmentPage />);
    expect(await screen.findByText(/invitation is invalid, expired, or already used/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  test.each([
    [200, 'not-json', 'The study server returned an unreadable response. Contact your study team.'],
    [409, '', 'The study disclosure could not be verified. Ask your study team to check the study configuration.'],
    [403, '', 'Study access is unavailable. Ask your study team to check your participation.'],
  ])('separates response and configuration failures (%s)', async (status, body, message) => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
    render(<PublicEnrollmentPage />);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(/ask.*new link/i)).toBeNull();
  });
});
