import { expect, it, setSystemTime } from 'bun:test';

import { validateEnrollmentPreview } from './enrollment-preview';

const studyId = '11111111-1111-4111-8111-111111111111';
const invitation = { accessCode: 'a'.repeat(40), participantId: 'p1', studyId };
const origin = 'https://chronicle.example.org';

function payload(issuedAt: string, expiresAt: string) {
  return {
    manifest: {
      collectionSettings: { settingsVersion: 1 },
      expiresAt,
      issuedAt,
      participantId: 'p1',
      participantPolicy: {
        consentDocumentUrl: null,
        dataUseAndSharing: 'Shared with the study team.',
        effectiveAt: '2026-10-01T00:00:00Z',
        expectedBenefits: 'None.',
        expectedDuration: 'Two weeks.',
        foreseeableRisks: 'Minimal.',
        privacyPolicyUrl: 'https://chronicle.example.org/privacy',
        procedures: 'Install the app.',
        purpose: 'Study phone use.',
        researchContact: 'team@example.org',
        responsibleInstitution: 'Example University',
        retentionAndDeletion: 'Kept for the study.',
        serverOperator: 'Example University',
        version: '1',
        withdrawalUrl: 'https://chronicle.example.org/withdraw',
      },
      schemaVersion: 1,
      serverOrigin: origin,
      settingsVersion: 1,
      studyDescription: 'A study.',
      studyId,
      studyTitle: 'Study',
      withdrawalMode: 'ERASE',
    },
    manifestDigest: 'a'.repeat(64),
  };
}

// Server time 12:00, invitation expiry 12:02, browser clock 12:05. The server decides, so the preview opens.
it('opens a live invitation whose expiry the browser clock has already passed', () => {
  setSystemTime(new Date('2026-10-28T12:05:00Z'));
  try {
    const preview = validateEnrollmentPreview(
      payload('2026-10-28T11:00:00Z', '2026-10-28T12:02:00Z'),
      invitation,
      origin,
    );
    expect(preview.expiresAt).toBe('2026-10-28T12:02:00Z');
  } finally {
    setSystemTime();
  }
});

it('still rejects a manifest that expires before it was issued', () => {
  expect(() =>
    validateEnrollmentPreview(payload('2026-10-28T12:02:00Z', '2026-10-28T12:00:00Z'), invitation, origin),
  ).toThrow();
});

// The app shows these links to the participant before consent: a plain-HTTP link or one carrying a login could send
// the participant somewhere the study did not intend, so the preview refuses the manifest.
it.each([
  ['a plain-HTTP privacy policy', { privacyPolicyUrl: 'http://chronicle.example.org/privacy' }],
  ['a withdrawal link with a login', { withdrawalUrl: 'https://user:secret@chronicle.example.org/withdraw' }],
  ['a consent document behind a password', { consentDocumentUrl: 'https://:secret@chronicle.example.org/c.pdf' }],
])('rejects %s', (_name, override) => {
  const preview = payload('2026-10-28T11:00:00Z', '2099-10-28T12:00:00Z');
  Object.assign(preview.manifest.participantPolicy, override);
  expect(() => validateEnrollmentPreview(preview, invitation, origin)).toThrow('Invalid study policy URL');
});
