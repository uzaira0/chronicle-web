import { describe, expect, it } from 'bun:test';

import {
  buildStudyParticipantPolicy,
  EMPTY_PARTICIPANT_POLICY_FORM,
  participantPolicyToForm,
  validateParticipantPolicy,
} from './participant-policy';

const VALID_POLICY = {
  responsibleInstitution: ' Example Research Institute ',
  serverOperator: ' Example Hosting Cooperative ',
  researchContact: ' study-team@example.org ',
  purpose: ' Understand how daily routines relate to health. ',
  expectedDuration: ' Twelve weeks ',
  procedures: ' The app collects only the modules the participant approves. ',
  foreseeableRisks: ' Collected data may reveal sensitive daily patterns. ',
  expectedBenefits: ' There may be no direct benefit to participants. ',
  dataUseAndSharing: ' Approved researchers receive coded study data. ',
  retentionAndDeletion: ' Data is retained for seven years, then deleted. ',
  privacyPolicyUrl: ' https://research.example.org/privacy/study-a ',
  withdrawalUrl: ' https://research.example.org/withdraw/study-a ',
  consentDocumentUrl: ' https://research.example.org/consent/study-a.pdf ',
  version: ' consent-2026-08-17 ',
  effectiveAt: '2026-08-17T09:30:00-05:00',
};

describe('StudyParticipantPolicy form contract', () => {
  it('builds every field with the polymorphic discriminator and preserves the declared offset timestamp', () => {
    expect(buildStudyParticipantPolicy(VALID_POLICY)).toEqual({
      '@class': 'com.openlattice.chronicle.study.StudyParticipantPolicy',
      responsibleInstitution: 'Example Research Institute',
      serverOperator: 'Example Hosting Cooperative',
      researchContact: 'study-team@example.org',
      purpose: 'Understand how daily routines relate to health.',
      expectedDuration: 'Twelve weeks',
      procedures: 'The app collects only the modules the participant approves.',
      foreseeableRisks: 'Collected data may reveal sensitive daily patterns.',
      expectedBenefits: 'There may be no direct benefit to participants.',
      dataUseAndSharing: 'Approved researchers receive coded study data.',
      retentionAndDeletion: 'Data is retained for seven years, then deleted.',
      privacyPolicyUrl: 'https://research.example.org/privacy/study-a',
      withdrawalUrl: 'https://research.example.org/withdraw/study-a',
      consentDocumentUrl: 'https://research.example.org/consent/study-a.pdf',
      version: 'consent-2026-08-17',
      effectiveAt: '2026-08-17T09:30:00-05:00',
    });
  });

  it('clears optional consent-document metadata explicitly', () => {
    expect(buildStudyParticipantPolicy({ ...VALID_POLICY, consentDocumentUrl: '  ' }).consentDocumentUrl).toBeNull();
  });

  it('round-trips loaded values without changing an existing effectiveAt offset', () => {
    const loaded = buildStudyParticipantPolicy(VALID_POLICY);
    expect(participantPolicyToForm(loaded)).toEqual({
      responsibleInstitution: loaded.responsibleInstitution,
      serverOperator: loaded.serverOperator,
      researchContact: loaded.researchContact,
      purpose: loaded.purpose,
      expectedDuration: loaded.expectedDuration,
      procedures: loaded.procedures,
      foreseeableRisks: loaded.foreseeableRisks,
      expectedBenefits: loaded.expectedBenefits,
      dataUseAndSharing: loaded.dataUseAndSharing,
      retentionAndDeletion: loaded.retentionAndDeletion,
      privacyPolicyUrl: loaded.privacyPolicyUrl,
      withdrawalUrl: loaded.withdrawalUrl,
      consentDocumentUrl: loaded.consentDocumentUrl ?? '',
      version: loaded.version,
      effectiveAt: loaded.effectiveAt,
    });
    expect(participantPolicyToForm(loaded).effectiveAt).toBe('2026-08-17T09:30:00-05:00');
  });

  it('starts with no invented consent text or links', () => {
    expect(Object.values(EMPTY_PARTICIPANT_POLICY_FORM).every((value) => value === '')).toBe(true);
  });

  it.each([
    ['responsible institution', { responsibleInstitution: '   ' }, 'Responsible institution is required.'],
    ['purpose', { purpose: '' }, 'Purpose is required.'],
    ['policy version', { version: 'v'.repeat(129) }, 'Policy version must be at most 128 characters.'],
    ['required URL scheme', { privacyPolicyUrl: 'http://research.example.org/privacy' }, 'absolute HTTPS URL'],
    [
      'embedded URL credentials',
      { withdrawalUrl: 'https://user:password@research.example.org/withdraw' },
      'without embedded credentials',
    ],
    ['optional URL scheme', { consentDocumentUrl: 'file:///consent.pdf' }, 'absolute HTTPS URL'],
    ['offset date-time', { effectiveAt: '2026-08-17T09:30:00' }, 'RFC 3339 date and time with a UTC offset'],
    ['invalid date-time', { effectiveAt: '2026-02-30T09:30:00Z' }, 'valid RFC 3339 date and time'],
    ['maximum disclosure length', { procedures: 'x'.repeat(8_001) }, 'Procedures must be at most 8000 characters.'],
  ])('rejects invalid %s', (_label, override, expectedMessage) => {
    const errors = validateParticipantPolicy({ ...VALID_POLICY, ...override });
    expect(Object.values(errors).join(' ')).toContain(expectedMessage);
  });

  it('accepts the optional consent-document URL when blank and all required fields are valid', () => {
    expect(validateParticipantPolicy({ ...VALID_POLICY, consentDocumentUrl: '' })).toEqual({});
  });

  it('refuses to build a policy that the server would reject', () => {
    expect(() => buildStudyParticipantPolicy({ ...VALID_POLICY, dataUseAndSharing: '' })).toThrow(
      'Data use and sharing is required.',
    );
  });
});
