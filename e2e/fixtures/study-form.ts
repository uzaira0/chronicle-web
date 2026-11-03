import type { Locator, Page } from '@playwright/test';

import { EMPTY_PARTICIPANT_POLICY_FORM, type ParticipantPolicyForm } from '../../src/modern/lib/participant-policy';

export const PILOT_MODULES: ReadonlySet<string> = new Set([
  'usage_events',
  'in_app_activity_class',
  'device_lifecycle',
  'user_identification',
  'upload_telemetry',
  'sensor_availability',
  'battery_telemetry',
]);

function policyFields(
  suffix: string,
): Record<Exclude<keyof ParticipantPolicyForm, 'consentDocumentUrl'>, { label: string; value: string }> {
  return {
    responsibleInstitution: { label: 'Responsible institution', value: 'Chronicle synthetic E2E institution' },
    serverOperator: { label: 'Server operator', value: 'Chronicle synthetic E2E operator' },
    researchContact: { label: 'Research contact', value: 'e2e@chronicle.test' },
    purpose: { label: 'Study purpose', value: 'Verify the Chronicle researcher and participant workflow.' },
    expectedDuration: { label: 'Expected participation duration', value: 'One synthetic browser session.' },
    procedures: { label: 'Procedures', value: 'Exercise the configured study workflow with synthetic data.' },
    foreseeableRisks: { label: 'Foreseeable risks', value: 'No human participation or real personal data is used.' },
    expectedBenefits: { label: 'Expected benefits', value: 'Deployment and workflow verification only.' },
    dataUseAndSharing: {
      label: 'Data use and sharing',
      value: 'Synthetic results remain inside the isolated test deployment.',
    },
    retentionAndDeletion: {
      label: 'Retention and deletion',
      value: 'Delete the synthetic study after automated verification.',
    },
    privacyPolicyUrl: { label: 'Study privacy policy URL', value: 'https://research.example.org/privacy/e2e' },
    withdrawalUrl: { label: 'Withdrawal URL', value: 'https://research.example.org/withdraw/e2e' },
    version: { label: 'Policy version', value: `e2e-${suffix}` },
    effectiveAt: { label: 'Policy effective at', value: '2026-08-19T12:00:00Z' },
  };
}

export function participantPolicyFixture(suffix: string): ParticipantPolicyForm {
  return {
    ...EMPTY_PARTICIPANT_POLICY_FORM,
    ...Object.fromEntries(Object.entries(policyFields(suffix)).map(([field, { value }]) => [field, value])),
  };
}

/** Fill the same policy used by the API fixture before issuing enrollment invitations. */
export async function fillRequiredParticipantPolicy(dialog: Locator, suffix: string): Promise<void> {
  for (const { label, value } of Object.values(policyFields(suffix))) {
    await dialog.getByLabel(label, { exact: false }).fill(value);
  }
}

/** Set a feature to a desired state without accidentally toggling an enabled default off. */
export async function setStudyFeature(dialog: Locator, label: string, selected: boolean): Promise<void> {
  const feature = dialog.getByRole('button', { exact: true, name: label });
  const currentlySelected = (await feature.getAttribute('aria-pressed')) === 'true';
  if (currentlySelected !== selected) await feature.click();
}

/** The studies page header's create action; an empty catalog repeats it inside its status panel. */
export function headerCreateStudyButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Create new study', exact: true }).first();
}
