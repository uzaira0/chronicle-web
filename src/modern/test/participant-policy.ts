import type { ParticipantPolicyForm } from '@/lib/participant-policy';

export const VALID_PARTICIPANT_POLICY: ParticipantPolicyForm = {
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
