import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

let dataCollectionQuery: Record<string, unknown> = {};
let limitsQuery: Record<string, unknown> = {};
let studySettingsQuery: Record<string, unknown> = {};

await mock.module('@/state/study-operations-api', () => ({
  useGetStudyDataCollectionSettingQuery: () => ({
    data: undefined,
    isError: false,
    isFetching: false,
    ...dataCollectionQuery,
  }),
  useGetStudyLimitsQuery: () => ({ data: undefined, isError: false, isFetching: false, ...limitsQuery }),
  useGetStudySettingsQuery: () => ({ data: {}, isError: false, isFetching: false, ...studySettingsQuery }),
}));

import { type StudyFormData, StudyFormDialog } from './study-form-dialog';

const POLICY = {
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
};

const EDIT_STUDY = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Existing study',
  contact: 'study-team@example.org',
  modules: { CHRONICLE_DATA_COLLECTION: {} },
  settings: {},
};

function fillParticipantPolicy() {
  const values: Record<string, string> = {
    'Responsible Institution': POLICY.responsibleInstitution,
    'Server Operator': POLICY.serverOperator,
    'Research Contact': POLICY.researchContact,
    'Study Purpose': POLICY.purpose,
    'Expected Participation Duration': POLICY.expectedDuration,
    Procedures: POLICY.procedures,
    'Foreseeable Risks': POLICY.foreseeableRisks,
    'Expected Benefits': POLICY.expectedBenefits,
    'Data Use and Sharing': POLICY.dataUseAndSharing,
    'Retention and Deletion': POLICY.retentionAndDeletion,
    'Study Privacy Policy URL': POLICY.privacyPolicyUrl,
    'Withdrawal URL': POLICY.withdrawalUrl,
    'Consent Document URL (optional)': POLICY.consentDocumentUrl,
    'Policy Version': POLICY.version,
    'Policy Effective At': POLICY.effectiveAt,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label.includes('(optional)') ? label : new RegExp(`^${label}`)), {
      target: { value },
    });
  }
}

afterEach(() => {
  cleanup();
  dataCollectionQuery = {};
  limitsQuery = {};
  studySettingsQuery = {};
});

describe('StudyFormDialog submission fence', () => {
  test('coalesces two synchronous submit clicks into one request', async () => {
    let resolveSubmission: (() => void) | undefined;
    const onSubmit = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));
    fireEvent.change(screen.getByLabelText(/^Study Name/), { target: { value: 'Single creation' } });
    fireEvent.change(screen.getByLabelText(/^Contact Email/), { target: { value: 'researcher@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Custom Surveys' }));
    fillParticipantPolicy();

    const submit = screen.getByRole('button', { name: 'Create Study' });
    act(() => {
      submit.click();
      submit.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmission?.();
      await Promise.resolve();
    });
  });
});

describe('StudyFormDialog participant policy', () => {
  test('exposes every policy field and identifies the study operator as responsible', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    for (const label of [
      'Responsible Institution',
      'Server Operator',
      'Research Contact',
      'Study Purpose',
      'Expected Participation Duration',
      'Procedures',
      'Foreseeable Risks',
      'Expected Benefits',
      'Data Use and Sharing',
      'Retention and Deletion',
      'Study Privacy Policy URL',
      'Withdrawal URL',
      'Consent Document URL (optional)',
      'Policy Version',
      'Policy Effective At',
    ]) {
      expect(screen.getByLabelText(label.includes('(optional)') ? label : new RegExp(`^${label}`))).toBeTruthy();
    }
    expect(
      screen.getByText(/responsible institution and server operator—not the Chronicle app publisher/),
    ).toBeTruthy();
    expect(screen.getByText(/server locks this policy after the first enrollment or device activity/)).toBeTruthy();
  });

  test('loads every saved field without changing the policy effectiveAt offset', () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));

    expect(screen.getByLabelText<HTMLInputElement>(/^Responsible Institution/).value).toBe(
      POLICY.responsibleInstitution,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Consent Document URL (optional)').value).toBe(
      POLICY.consentDocumentUrl,
    );
    expect(screen.getByLabelText<HTMLInputElement>(/^Policy Effective At/).value).toBe(POLICY.effectiveAt);
  });

  test('does not overwrite a local edit when a settings query refreshes in the background', () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    const view = render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));
    fireEvent.change(screen.getByLabelText(/^Study Purpose/), { target: { value: 'Unsaved local purpose' } });

    studySettingsQuery = {
      data: { ParticipantPolicy: { ...POLICY, purpose: 'Background refresh purpose' } },
    };
    view.rerender(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);

    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Study Purpose/).value).toBe('Unsaved local purpose');
  });
});

describe('StudyFormDialog Health Connect scope', () => {
  test('loads the exact subset, lets the researcher change it, and submits the selected wire ids', async () => {
    dataCollectionQuery = {
      data: {
        modules: {
          health_connect: { enabled: true, required: false, healthConnectRecordTypes: ['steps', 'sleep'] },
        },
      },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));

    expect(screen.getByLabelText<HTMLInputElement>('Steps').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Sleep sessions and stages').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Heart rate').checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Heart rate'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.healthConnectRecordTypes).toEqual(['steps', 'heart_rate', 'sleep']);
  });

  test('blocks saving and explains that an enabled module with empty scope collects nothing', () => {
    dataCollectionQuery = {
      data: { modules: { health_connect: { enabled: true, required: false, healthConnectRecordTypes: [] } } },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));

    expect(screen.getByText(/Select at least one record type or disable Health Connect/)).toBeTruthy();
    expect(screen.getByText(/With no record types selected, the app requests no Health Connect data/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save Changes' }).disabled).toBe(true);
  });

  test('shows and preserves a future record type that this web build cannot edit', async () => {
    dataCollectionQuery = {
      data: {
        modules: {
          health_connect: { enabled: true, required: false, healthConnectRecordTypes: ['steps', 'future_metric'] },
        },
      },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));

    expect(screen.getByText(/future_metric/)).toBeTruthy();
    expect(screen.getByText(/preserved when you save/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submissions[0]?.healthConnectRecordTypes).toEqual(['steps', 'future_metric']);
  });
});
