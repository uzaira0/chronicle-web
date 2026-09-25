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
    expect(screen.getByLabelText(/^Data Use and Sharing/).getAttribute('aria-describedby')).toBe(
      'participant-policy-dataUseAndSharing-hint',
    );
    expect(screen.getByText(/Also disclose what the platform always records/)).toBeTruthy();
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

describe('StudyFormDialog configuration export and import', () => {
  const CONFIG = {
    format: 'chronicle-study-config',
    version: 1,
    exportedAt: '2026-09-17T00:00:00Z',
    study: {
      contact: 'imported@example.org',
      dataRetentionDays: '400',
      description: 'Imported description',
      dutyCycleActiveSeconds: '30',
      dutyCyclePeriodSeconds: '300',
      features: ['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY'],
      group: 'imported-group',
      healthConnectRecordTypes: ['steps'],
      moduleRequired: { health_connect: true },
      moduleSettings: { device_settings: true, health_connect: true },
      moduleIntervalSeconds: { device_settings: '3600' },
      notificationsEnabled: true,
      participantPolicy: POLICY,
      participantLimit: '250',
      samplingRateHz: '5',
      selectedSensors: [],
      studyDurationDays: '180',
      title: 'Imported study',
      version: '2.0',
    },
  };

  async function importFile(text: string, name = 'config.json') {
    const input = screen.getByTestId<HTMLInputElement>('study-config-file');
    const file = new File([text], name, { type: 'application/json' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      // file.text() resolves on a later microtask than the change handler's first await.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  test('imports a configuration file into every field of the create form and submits it', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    await importFile(JSON.stringify(CONFIG));

    expect(screen.getByRole('status').textContent).toContain('config.json');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study Name/).value).toBe('Imported study');
    expect(screen.getByLabelText<HTMLInputElement>(/^Contact Email/).value).toBe('imported@example.org');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study Group/).value).toBe('imported-group');
    expect(screen.getByLabelText<HTMLInputElement>(/^Version/).value).toBe('2.0');
    expect(screen.getByLabelText<HTMLInputElement>('Participant Limit').value).toBe('250');
    expect(screen.getByLabelText<HTMLInputElement>('Study Duration (days)').value).toBe('180');
    expect(screen.getByLabelText<HTMLInputElement>('Data Retention (days)').value).toBe('400');
    expect(screen.getByLabelText<HTMLInputElement>('Enable daily notifications').checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Time Use Diary' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText<HTMLInputElement>(/^Responsible Institution/).value).toBe(
      POLICY.responsibleInstitution,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Steps').checked).toBe(true);
    expect((document.getElementById('interval-device_settings') as HTMLInputElement).value).toBe('3600');

    fireEvent.click(screen.getByRole('button', { name: 'Create Study' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.title).toBe('Imported study');
    expect(submissions[0]?.moduleRequired?.health_connect).toBe(true);
    expect(submissions[0]?.moduleSettings?.health_connect).toBe(true);
    expect(submissions[0]?.healthConnectRecordTypes).toEqual(['steps']);
    expect(submissions[0]?.participantPolicy?.version).toBe(POLICY.version);
  });

  test('shows every module in the state the save path will write, not Disabled by omission', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    // CONFIG names two modules; usage_events is not one of them, and its contract default
    // is enabled — the form must not claim it is off while the save path turns it on.
    await importFile(JSON.stringify(CONFIG));

    const usageEvents = screen.getByRole('group', { name: 'App Usage Events collection mode' });
    expect(usageEvents.querySelector<HTMLInputElement>('input[value="disabled"]')?.checked).toBe(false);
    expect(usageEvents.querySelector<HTMLInputElement>('input[value="optional"]')?.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Create Study' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submissions[0]?.moduleSettings?.usage_events).toBe(true);
  });

  test('does not import an unofferable feature or the legacy sensor fields the form cannot show', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    await importFile(
      JSON.stringify({
        ...CONFIG,
        study: {
          ...CONFIG.study,
          features: ['CHRONICLE_DATA_COLLECTION', 'ANDROID_SENSOR', 'IOS_SENSOR'],
          samplingRateHz: '100000',
          selectedSensors: ['accelerometer'],
        },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create Study' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.features).toEqual(['CHRONICLE_DATA_COLLECTION']);
    expect(submissions[0]?.samplingRateHz).toBe('5');
    expect(submissions[0]?.selectedSensors).toEqual([]);
  });

  test("keeps the edited study's participant policy and says so", async () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));

    await importFile(
      JSON.stringify({
        ...CONFIG,
        study: { ...CONFIG.study, participantPolicy: { ...POLICY, version: 'imported-policy' } },
      }),
    );

    expect(screen.getByLabelText<HTMLInputElement>(/^Policy Version/).value).toBe(POLICY.version);
    expect(screen.getByRole('status').textContent).toContain('participant policy');
  });

  test('refuses an oversized file without reading it into memory', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    const file = new File(['{}'], 'huge.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 2_000_000 });
    let read = false;
    file.text = () => {
      read = true;
      return Promise.resolve('{}');
    };
    await act(async () => {
      fireEvent.change(screen.getByTestId('study-config-file'), { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(read).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('too large');
  });

  test('reports an unreadable file in the dashboard language, not in browser engine English', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    const file = new File(['{}'], 'gone.json', { type: 'application/json' });
    file.text = () => Promise.reject(new Error('The requested file could not be read, typically due to permissions.'));
    await act(async () => {
      fireEvent.change(screen.getByTestId('study-config-file'), { target: { files: [file] } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole('alert').textContent).toBe('The file could not be loaded.');
  });

  test('offers exactly one keyboard-reachable import control and announces into a live region', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));

    const input = screen.getByTestId<HTMLInputElement>('study-config-file');
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-label')).toBeNull();
    // The live region exists before the import so a screen reader announces the change.
    expect(screen.getByRole('status').textContent).toBe('');
  });

  test('rejects a file that is not a study configuration and leaves the form untouched', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create New Study' }));
    fireEvent.change(screen.getByLabelText(/^Study Name/), { target: { value: 'Typed title' } });

    await importFile(JSON.stringify({ hello: 'world' }), 'notes.json');

    expect(screen.getByRole('alert').textContent).toContain('not a Chronicle study configuration');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study Name/).value).toBe('Typed title');
  });

  test('exports the current form state, unsaved edits included, as a study configuration file', async () => {
    const blobs: Blob[] = [];
    const names: string[] = [];
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const originalClick = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'click');
    URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return 'blob:study-config';
    };
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = function () {
      names.push(this.download);
    };
    try {
      studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
      limitsQuery = { data: { participantLimit: 40 } };
      render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit Study' }));
      fireEvent.change(screen.getByLabelText(/^Study Group/), { target: { value: 'unsaved-group' } });

      fireEvent.click(screen.getByRole('button', { name: 'Export configuration' }));

      expect(blobs).toHaveLength(1);
      expect(names[0]).toMatch(/^existing-study-config-\d{4}-\d{2}-\d{2}\.json$/);
      const [blob] = blobs;
      if (!blob) throw new Error('export produced no blob');
      const exported = JSON.parse(await blob.text()) as { study: StudyFormData; format: string };
      expect(exported.format).toBe('chronicle-study-config');
      expect(exported.study.title).toBe('Existing study');
      expect(exported.study.group).toBe('unsaved-group');
      expect(exported.study.participantLimit).toBe('40');
      expect(exported.study.participantPolicy?.responsibleInstitution).toBe(POLICY.responsibleInstitution);
      expect(exported.study).not.toHaveProperty('loadedParticipantPolicy');
    } finally {
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      if (originalClick) Object.defineProperty(HTMLAnchorElement.prototype, 'click', originalClick);
    }
  });
});
