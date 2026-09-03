import type { Locator } from '@playwright/test';

/** Fill the fail-closed participant policy required before a study can be created. */
export async function fillRequiredParticipantPolicy(dialog: Locator, suffix: string): Promise<void> {
  for (const [label, value] of [
    ['Responsible Institution', 'Chronicle synthetic E2E institution'],
    ['Server Operator', 'Chronicle synthetic E2E operator'],
    ['Research Contact', 'e2e@chronicle.test'],
    ['Study Purpose', 'Verify the Chronicle researcher and participant workflow.'],
    ['Expected Participation Duration', 'One synthetic browser session.'],
    ['Procedures', 'Exercise the configured study workflow with synthetic data.'],
    ['Foreseeable Risks', 'No human participation or real personal data is used.'],
    ['Expected Benefits', 'Deployment and workflow verification only.'],
    ['Data Use and Sharing', 'Synthetic results remain inside the isolated test deployment.'],
    ['Retention and Deletion', 'Delete the synthetic study after automated verification.'],
    ['Study Privacy Policy URL', 'https://research.example.org/privacy/e2e'],
    ['Withdrawal URL', 'https://research.example.org/withdraw/e2e'],
    ['Policy Version', `e2e-${suffix}`],
    ['Policy Effective At', '2026-08-19T12:00:00Z'],
  ] as const) {
    await dialog.getByLabel(label, { exact: false }).fill(value);
  }
}

/** Set a feature to a desired state without accidentally toggling an enabled default off. */
export async function setStudyFeature(dialog: Locator, label: string, selected: boolean): Promise<void> {
  const feature = dialog.getByRole('button', { exact: true, name: label });
  const currentlySelected = (await feature.getAttribute('aria-pressed')) === 'true';
  if (currentlySelected !== selected) await feature.click();
}
