import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import tailwindcss from '@tailwindcss/postcss';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import postcss from 'postcss';
import { WITHDRAWAL_MODE } from '@/generated/chronicle-contracts';
import { buildTimeUseDiarySetting, buildWithdrawalSetting } from '@/lib/study-form-helpers';
import { moduleDraftsWith } from '@/test/module-drafts';

let dataCollectionQuery: Record<string, unknown> = {};
let limitsQuery: Record<string, unknown> = {};
let studySettingsQuery: Record<string, unknown> = {};
let settingLocks: string[] = [];

// mock.module is process-wide: spread the real module, and fake the hooks only while this file runs.
const realStudyOperationsApi = await import('@/state/study-operations-api');
const {
  useGetStudySettingLocksQuery: realSettingLocksQuery,
  useGetStudySummaryQuery: realDataCollectionQuery,
  useGetStudyLimitsQuery: realLimitsQuery,
  useGetStudySettingsQuery: realStudySettingsQuery,
} = realStudyOperationsApi;
let faking = true;
afterAll(() => {
  faking = false;
});
const idle = { data: undefined, isError: false, isFetching: false };

await mock.module('@/state/study-operations-api', () => ({
  ...realStudyOperationsApi,
  useGetStudySettingLocksQuery: (...args: Parameters<typeof realSettingLocksQuery>) =>
    faking ? { ...idle, data: settingLocks } : realSettingLocksQuery(...args),
  useGetStudySummaryQuery: (...args: Parameters<typeof realDataCollectionQuery>) =>
    faking
      ? { ...idle, ...dataCollectionQuery, data: { settings: { DataCollection: dataCollectionQuery.data } } }
      : realDataCollectionQuery(...args),
  useGetStudyLimitsQuery: (...args: Parameters<typeof realLimitsQuery>) =>
    faking ? { ...idle, ...limitsQuery } : realLimitsQuery(...args),
  useGetStudySettingsQuery: (...args: Parameters<typeof realStudySettingsQuery>) =>
    faking ? { ...idle, data: {}, ...studySettingsQuery } : realStudySettingsQuery(...args),
}));

import { leaveIsBlocked } from '@/test/browser-env';
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
    'Responsible institution': POLICY.responsibleInstitution,
    'Server operator': POLICY.serverOperator,
    'Research contact': POLICY.researchContact,
    'Study purpose': POLICY.purpose,
    'Expected participation duration': POLICY.expectedDuration,
    Procedures: POLICY.procedures,
    'Foreseeable risks': POLICY.foreseeableRisks,
    'Expected benefits': POLICY.expectedBenefits,
    'Data use and sharing': POLICY.dataUseAndSharing,
    'Retention and deletion': POLICY.retentionAndDeletion,
    'Study privacy policy URL': POLICY.privacyPolicyUrl,
    'Withdrawal URL': POLICY.withdrawalUrl,
    'Consent document URL (optional)': POLICY.consentDocumentUrl,
    'Policy version': POLICY.version,
    'Policy effective at': POLICY.effectiveAt,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label.includes('(optional)') ? label : new RegExp(`^${label}`)), {
      target: { value },
    });
  }
}

function restoreOwn(target: object, key: string, original: PropertyDescriptor | undefined) {
  if (original) Object.defineProperty(target, key, original);
  else Reflect.deleteProperty(target, key);
}

afterEach(() => {
  cleanup();
  dataCollectionQuery = {};
  limitsQuery = {};
  studySettingsQuery = {};
  settingLocks = [];
});

test('asks before a reload once the open form holds edits', () => {
  render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
  expect(leaveIsBlocked()).toBe(false);
  fireEvent.change(screen.getByLabelText(/Study name/), { target: { value: 'Draft study' } });
  expect(leaveIsBlocked()).toBe(true);
});

test('code fields keep literal spelling and example placeholders follow the input convention', () => {
  render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
  for (const label of [/^Study time zone/, /^Version/, /^Policy version/]) {
    expect(screen.getByLabelText(label).getAttribute('spellcheck')).toBe('false');
  }
  for (const example of [
    '365',
    '730',
    '1.0',
    'researcher@university.edu',
    'https://research.example.org/consent/study.pdf',
    'consent-2026-08-17',
    '2026-08-17T09:30:00-05:00',
  ]) {
    expect(screen.getByPlaceholderText(`${example}…`)).toBeTruthy();
  }
});

test('collection module radios show an inset focus ring on their labels during keyboard navigation', async () => {
  const started = process.hrtime.bigint();
  const stages: unknown[] = [];
  const trace = (stage: string, detail: unknown = null) => {
    stages.push({ stage, elapsedMs: Number(process.hrtime.bigint() - started) / 1e6, detail });
    const directory = resolve('build/operator-test-runs/L08-focus');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'trace.json'), JSON.stringify(stages, null, 2));
  };
  render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
  const group = screen.getByRole('group', { name: 'App Usage Events collection mode' });
  if (!group) throw new Error('Collection module radio group was not rendered.');
  trace('rendered', group.outerHTML);
  const stylesheet = resolve('src/modern/styles/index.css');
  // Tailwind carries a second PostCSS version whose declaration types differ from the app's.
  const { css } = await postcss([tailwindcss() as unknown as postcss.AcceptedPlugin]).process(
    readFileSync(stylesheet, 'utf8'),
    { from: stylesheet },
  );
  trace('css compiled');
  const browser = await chromium.launch({ headless: true });
  trace('browser launched');
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<style>${css}</style><button>Before modules</button>${group.outerHTML}`);
    trace('page ready');
    await page.getByRole('button', { name: 'Before modules' }).focus();
    await page.keyboard.press('Tab');
    trace(
      'keyboard navigation complete',
      await page.evaluate(() => ({
        active: document.activeElement?.outerHTML,
        hasFocus: document.hasFocus(),
        radios: Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'), (input) => ({
          disabled: input.disabled,
          checked: input.checked,
          tabIndex: input.tabIndex,
          html: input.outerHTML,
        })),
      })),
    );
    const focusedRadio = page.locator('input[type="radio"]:focus');
    expect(await focusedRadio.count()).toBe(1);
    const name = await focusedRadio.getAttribute('name');
    expect(name).toBeTruthy();
    const radios = page.locator(`input[type="radio"][name="${name}"]`);
    expect(await radios.count()).toBeGreaterThan(1);
    const indicators: string[] = [];
    for (let index = 0; index < (await radios.count()); index += 1) {
      // Native radios keep one tab stop per group and move with arrow keys.
      const indicator = await page.locator('input:focus').evaluate((input) => {
        const label = input.closest('label');
        if (!label) throw new Error('Focused radio has no visible label.');
        return { value: (input as HTMLInputElement).value, shadow: getComputedStyle(label).boxShadow };
      });
      expect(await page.locator('input:focus').getAttribute('type')).toBe('radio');
      expect(indicator.shadow).not.toBe('none');
      expect(indicator.shadow).toContain('inset');
      indicators.push(indicator.value);
      await page.keyboard.press('ArrowRight');
    }
    expect(new Set(indicators).size).toBe(await radios.count());
    await page.screenshot({ path: resolve('build/operator-test-runs/L08-focus/radio-label-focus.png') });
  } finally {
    await browser.close();
  }
}, 20_000);

describe('StudyFormDialog submission fence', () => {
  test('defaults new studies to keeping prior data', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    expect(screen.getByLabelText<HTMLSelectElement>('Participant withdrawal').value).toBe(
      WITHDRAWAL_MODE.KEEP_PRIOR_DATA,
    );
  });

  test("defaults a new study's time zone to the researcher's browser zone, shown and editable", () => {
    // The browser's zone, as Intl reports it; set here so the test does not depend on the machine's zone.
    const prototype = Intl.DateTimeFormat.prototype;
    const resolvedOptions = Reflect.get(prototype, 'resolvedOptions');
    Reflect.set(prototype, 'resolvedOptions', function (this: Intl.DateTimeFormat) {
      return { ...resolvedOptions.call(this), timeZone: 'Asia/Tokyo' };
    });
    try {
      render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
      fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
      const field = screen.getByLabelText<HTMLInputElement>('Study time zone (IANA)');
      expect(field.value).toBe('Asia/Tokyo');
      fireEvent.change(field, { target: { value: 'America/Santiago' } });
      expect(field.value).toBe('America/Santiago');
    } finally {
      Reflect.set(prototype, 'resolvedOptions', resolvedOptions);
    }
  });

  test('defaults existing studies without a withdrawal setting to keeping prior data', () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" study={EDIT_STUDY} onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    expect(screen.getByLabelText<HTMLSelectElement>('Participant withdrawal').value).toBe(
      WITHDRAWAL_MODE.KEEP_PRIOR_DATA,
    );
  });

  test('rejects an invalid study time zone before saving', async () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="edit" study={EDIT_STUDY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    const timeZone = screen.getByLabelText('Study time zone (IANA)');
    fireEvent.change(timeZone, { target: { value: 'Invalid/Zone' } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(timeZone);
    expect(screen.getByText('Enter a valid IANA time zone, such as America/Santiago.')).toBeTruthy();
  });

  // The server stores study limits as whole days; a fraction or zero typed into the number box is refused at the
  // field instead of being rounded or sent.
  test.each([
    ['Study duration (days)', '1.5'],
    ['Data retention (days)', '0'],
  ])('rejects %s of %s before saving and focuses it', async (label, value) => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="edit" study={EDIT_STUDY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(screen.getByText('Enter a whole number of days, or leave it empty.')).toBeTruthy();
  });

  test('rejects an empty enabled sampling rate and focuses its field before any save', async () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    dataCollectionQuery = {
      data: {
        modules: {
          sensor_accelerometer: {
            enabled: true,
            sensorPolicy: { samplingRateHz: 5, dutyCycleActiveSeconds: 30, dutyCyclePeriodSeconds: 300 },
          },
        },
      },
    };
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="edit" study={EDIT_STUDY} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    const rate = screen.getByLabelText(/sampling rate/i);
    fireEvent.change(rate, { target: { value: '' } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rate);
    expect(screen.getByText(/sampling rate.*whole number/i)).toBeTruthy();
  });

  test.each([WITHDRAWAL_MODE.KEEP_PRIOR_DATA, WITHDRAWAL_MODE.ERASE])(
    'loads and saves withdrawal mode %s with the study time zone',
    async (mode) => {
      const priorMode = mode === WITHDRAWAL_MODE.ERASE ? WITHDRAWAL_MODE.KEEP_PRIOR_DATA : WITHDRAWAL_MODE.ERASE;
      const diary = { timeZone: 'UTC', clockFormat: 24, enableChangesForOhioStateUniversity: true };
      studySettingsQuery = {
        data: { ParticipantPolicy: POLICY, Withdrawal: { mode: priorMode }, TimeUseDiary: diary },
      };
      const submissions: StudyFormData[] = [];
      render(
        <StudyFormDialog
          mode="edit"
          study={EDIT_STUDY}
          onSubmit={(form) => {
            submissions.push(form);
            return Promise.resolve();
          }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
      const setting = screen.getByLabelText<HTMLSelectElement>('Participant withdrawal');
      expect(setting.value).toBe(priorMode);
      fireEvent.change(setting, { target: { value: mode } });
      fireEvent.change(screen.getByLabelText('Study time zone (IANA)'), { target: { value: 'America/Santiago' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(submissions).toHaveLength(1);
      const form = submissions[0];
      if (!form) throw new Error('Study settings were not submitted.');
      expect(buildWithdrawalSetting(form)?.mode).toBe(mode);
      expect(buildTimeUseDiarySetting(form)).toMatchObject({ ...diary, timeZone: 'America/Santiago' });
    },
  );

  test('coalesces two synchronous submit clicks into one request', async () => {
    let resolveSubmission: (() => void) | undefined;
    const onSubmit = mock(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmission = resolve;
        }),
    );

    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Single creation' } });
    fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'researcher@example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Custom surveys' }));
    fillParticipantPolicy();

    const submit = screen.getByRole('button', { name: 'Create study' });
    act(() => {
      submit.click();
      submit.click();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Every control of the submitted snapshot is fenced, not only the first field.
    const form = screen.getByLabelText(/^Study name/).closest('form');
    if (!form) throw new Error('Study form was not rendered.');
    // A control is disabled by its own attribute or by a disabled fieldset outside that fieldset's legend
    // (the DOM test environment does not apply fieldset inheritance to :disabled).
    const disabledFieldsets = [...form.querySelectorAll('fieldset[disabled]')];
    const fenced = (control: Element) =>
      (control as HTMLInputElement).disabled ||
      disabledFieldsets.some(
        (fieldset) =>
          fieldset !== control &&
          fieldset.contains(control) &&
          !fieldset.querySelector(':scope > legend')?.contains(control),
      );
    const controls = [...form.elements];
    expect(controls.length).toBeGreaterThan(20);
    expect(controls.filter((control) => !fenced(control)).map((control) => control.outerHTML)).toEqual([]);
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByRole('heading', { name: 'Discard unsaved study changes?' })).toBeNull();
    // A reload while the save is pending would lose the draft if that save then fails.
    expect(leaveIsBlocked()).toBe(true);

    await act(async () => {
      resolveSubmission?.();
      await Promise.resolve();
    });
  });
});

describe('StudyFormDialog unsaved changes', () => {
  test('Escape keeps a dirty draft open until the researcher confirms discard', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    const title = screen.getByLabelText<HTMLInputElement>(/^Study name/);
    fireEvent.change(title, { target: { value: 'Unsaved draft' } });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(screen.getByRole('heading', { name: 'Discard unsaved study changes?' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Unsaved draft');
    fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }));
    expect(screen.queryByRole('heading', { name: 'Discard unsaved study changes?' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Unsaved draft');

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText(/^Study name/)).toBeNull();
  });

  test('outside dismissal also asks before discarding a dirty draft', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Outside-click draft' } });

    const overlay = Array.from(document.querySelectorAll('[data-state="open"]')).find((element) =>
      element.classList.contains('bg-overlay/55'),
    );
    expect(overlay).toBeTruthy();
    if (!overlay) throw new Error('Study dialog overlay was not rendered.');
    // Radix installs its document-level outside-pointer listener on the next task.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Primary outside dismissal follows the completed click, not the initial press.
    fireEvent.pointerDown(overlay, { button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true });
    fireEvent.mouseDown(overlay, { button: 0, buttons: 1 });
    fireEvent.pointerUp(overlay, { button: 0, buttons: 0, pointerType: 'mouse', isPrimary: true });
    fireEvent.mouseUp(overlay, { button: 0, buttons: 0 });
    fireEvent.click(overlay, { button: 0 });

    expect(screen.getByRole('heading', { name: 'Discard unsaved study changes?' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Outside-click draft');
  });

  test('a clean study form still closes on Escape', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByLabelText(/^Study name/)).toBeNull();
  });
});

describe('StudyFormDialog participant policy', () => {
  test('announces a failed save once while retaining entered study details', async () => {
    const onSubmit = mock(() => Promise.reject(new Error('The study could not be saved.')));
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Retained draft' } });
    fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'researcher@example.org' } });
    fillParticipantPolicy();
    fireEvent.click(screen.getByRole('button', { name: 'Create study' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('The study could not be saved.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Retained draft');
  });

  test('explains invalid email and missing policy fields, focuses the first error, then saves corrected values', async () => {
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Clear requirements' } });
    fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'not-an-email' } });

    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Create study' });
    expect(save.disabled).toBe(false);
    await act(() => fireEvent.click(save));

    expect(document.activeElement).toBe(screen.getByLabelText(/^Contact email/));
    expect(
      screen.getByText('Enter a valid contact email address.', { selector: 'p#study-contact-error' }),
    ).toBeTruthy();
    const institution = screen.getByLabelText(/^Responsible institution/);
    expect(document.getElementById(institution.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Responsible institution is required.',
    );
    expect(screen.getByText('Fix the highlighted fields before saving.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Responsible institution is required.' }));
    expect(document.activeElement).toBe(institution);

    fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'researcher@example.org' } });
    fillParticipantPolicy();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create study' })));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('researcher chooses app usage survey frequency', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    const frequency = screen.getByLabelText<HTMLSelectElement>('App usage survey frequency');
    expect(frequency.value).toBe('DAILY');
    fireEvent.change(frequency, { target: { value: 'HOURLY' } });
    expect(frequency.value).toBe('HOURLY');
  });

  test('exposes every policy field and identifies the study operator as responsible', () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    for (const label of [
      'Responsible institution',
      'Server operator',
      'Research contact',
      'Study purpose',
      'Expected participation duration',
      'Procedures',
      'Foreseeable risks',
      'Expected benefits',
      'Data use and sharing',
      'Retention and deletion',
      'Study privacy policy URL',
      'Withdrawal URL',
      'Consent document URL (optional)',
      'Policy version',
      'Policy effective at',
    ]) {
      expect(screen.getByLabelText(label.includes('(optional)') ? label : new RegExp(`^${label}`))).toBeTruthy();
    }
    expect(
      screen.getByText(/responsible institution and server operator—not the Chronicle app publisher/),
    ).toBeTruthy();
    expect(screen.getByText(/server locks this policy after the first enrollment or device activity/)).toBeTruthy();
    const dataUseHint = screen.getByLabelText(/^Data use and sharing/).getAttribute('aria-describedby');
    expect(document.getElementById(dataUseHint ?? '')?.textContent).toContain(
      'Also disclose what the platform retains',
    );
    const disclosure = screen.getByText(/Also disclose what the platform retains/).textContent;
    expect(disclosure).toContain('Participant IP addresses are withheld');
    expect(disclosure).toContain('User-Agent');
    expect(disclosure).toContain(
      'staff requests retain keyed IP fingerprints by default unless the operator disables them',
    );
    expect(disclosure).toContain('rotated backups');
  });

  test('loads every saved field without changing the policy effectiveAt offset', () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));

    expect(screen.getByLabelText<HTMLInputElement>(/^Responsible institution/).value).toBe(
      POLICY.responsibleInstitution,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Consent document URL (optional)').value).toBe(
      POLICY.consentDocumentUrl,
    );
    expect(screen.getByLabelText<HTMLInputElement>(/^Policy effective at/).value).toBe(POLICY.effectiveAt);
  });

  test('does not overwrite a local edit when a settings query refreshes in the background', () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    const view = render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    fireEvent.change(screen.getByLabelText(/^Study purpose/), { target: { value: 'Unsaved local purpose' } });

    studySettingsQuery = {
      data: { ParticipantPolicy: { ...POLICY, purpose: 'Background refresh purpose' } },
    };
    view.rerender(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);

    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Study purpose/).value).toBe('Unsaved local purpose');
  });

  // Each change keeps every earlier edit, and Save submits all of them.
  test('typing into every settings field keeps the earlier edits and saves them all', async () => {
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const submissions: StudyFormData[] = [];
    render(
      <StudyFormDialog
        mode="edit"
        study={EDIT_STUDY}
        onSubmit={(form) => {
          submissions.push(form);
          return Promise.resolve();
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    const edits: [RegExp | string, string][] = [
      [/^Study name/, 'Edited title'],
      [/^Description/, 'Edited description'],
      [/^Study group/, 'Edited group'],
      [/^Version/, '2'],
      [/^Contact email/, 'edited@example.org'],
      [/^Responsible institution/, 'Edited institution'],
      [/^Server operator/, 'Edited operator'],
      [/^Research contact/, 'edited-contact@example.org'],
      [/^Study purpose/, 'Edited purpose'],
      [/^Expected participation duration/, 'Edited duration'],
      [/^Procedures/, 'Edited procedures'],
      [/^Foreseeable risks/, 'Edited risks'],
      [/^Expected benefits/, 'Edited benefits'],
      [/^Data use and sharing/, 'Edited sharing'],
      [/^Retention and deletion/, 'Edited retention'],
      [/^Study privacy policy URL/, 'https://research.example.org/privacy/edited'],
      [/^Withdrawal URL/, 'https://research.example.org/withdraw/edited'],
      ['Consent document URL (optional)', 'https://research.example.org/consent/edited.pdf'],
      [/^Policy version/, 'consent-edited'],
      [/^Policy effective at/, '2026-09-01T08:00:00-03:00'],
      ['Study duration (days)', '45'],
      ['Data retention (days)', '90'],
      ['Study time zone (IANA)', 'America/Santiago'],
    ];
    const field = (label: RegExp | string) => screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label);
    for (const [label, value] of edits) fireEvent.change(field(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('App usage survey frequency'), { target: { value: 'HOURLY' } });
    expect(edits.map(([label]) => field(label).value)).toEqual(edits.map(([, value]) => value));

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      title: 'Edited title',
      description: 'Edited description',
      group: 'Edited group',
      version: '2',
      contact: 'edited@example.org',
      studyDurationDays: '45',
      dataRetentionDays: '90',
      timeZone: 'America/Santiago',
      appUsageFrequency: 'HOURLY',
      participantPolicy: {
        responsibleInstitution: 'Edited institution',
        serverOperator: 'Edited operator',
        researchContact: 'edited-contact@example.org',
        purpose: 'Edited purpose',
        expectedDuration: 'Edited duration',
        procedures: 'Edited procedures',
        foreseeableRisks: 'Edited risks',
        expectedBenefits: 'Edited benefits',
        dataUseAndSharing: 'Edited sharing',
        retentionAndDeletion: 'Edited retention',
        privacyPolicyUrl: 'https://research.example.org/privacy/edited',
        withdrawalUrl: 'https://research.example.org/withdraw/edited',
        consentDocumentUrl: 'https://research.example.org/consent/edited.pdf',
        version: 'consent-edited',
        effectiveAt: '2026-09-01T08:00:00-03:00',
      },
    });
  });
});

describe('StudyFormDialog legacy iOS sensors', () => {});

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
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));

    expect(screen.getByLabelText<HTMLInputElement>('Steps').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Sleep sessions and stages').checked).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Heart rate').checked).toBe(false);
    fireEvent.click(screen.getByLabelText('Heart rate'));
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

    expect(onSubmit).not.toHaveBeenCalled();
    const confirmation = screen.getByRole('dialog', { name: 'Save with unsupported Play Store modules?' });
    expect(within(confirmation).getByText('Health Connect')).toBeTruthy();
    expect(within(confirmation).queryByText('App Usage Events')).toBeNull();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Save anyway' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.modules.health_connect.healthConnectRecordTypes).toEqual(['steps', 'heart_rate', 'sleep']);
  });

  test('canceling the Play Store warning keeps the draft open without saving', async () => {
    dataCollectionQuery = {
      data: { modules: { health_connect: { enabled: true, healthConnectRecordTypes: ['steps'] } } },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Retained draft' } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));

    const confirmation = screen.getByRole('dialog', { name: 'Save with unsupported Play Store modules?' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Save with unsupported Play Store modules?' })).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Retained draft');
    expect(screen.getByLabelText<HTMLInputElement>('Steps').checked).toBe(true);
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    expect(screen.getByRole('dialog', { name: 'Save with unsupported Play Store modules?' })).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('turning off data collection saves without a Play Store warning', async () => {
    dataCollectionQuery = {
      data: { modules: { health_connect: { enabled: true, healthConnectRecordTypes: ['steps'] } } },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    const onSubmit = mock(() => Promise.resolve());
    render(<StudyFormDialog mode="edit" onSubmit={onSubmit} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
    fireEvent.click(screen.getByRole('button', { name: 'Data collection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Custom surveys' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('dialog', { name: 'Save with unsupported Play Store modules?' })).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  test('blocks saving and explains that an enabled module with empty scope collects nothing', async () => {
    dataCollectionQuery = {
      data: { modules: { health_connect: { enabled: true, required: false, healthConnectRecordTypes: [] } } },
    };
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));

    expect(screen.getByText(/Select at least one record type or disable Health Connect/)).toBeTruthy();
    expect(screen.getByText(/With no record types selected, the app requests no Health Connect data/)).toBeTruthy();
    const save = screen.getByRole<HTMLButtonElement>('button', { name: 'Save changes' });
    expect(save.disabled).toBe(false);
    await act(() => fireEvent.click(save));
    expect(screen.getByText('Fix the highlighted fields before saving.')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));

    expect(screen.getByText(/future_metric/)).toBeTruthy();
    expect(screen.getByText(/preserved when you save/)).toBeTruthy();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Save changes' })));
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submissions[0]?.modules.health_connect.healthConnectRecordTypes).toEqual(['steps', 'future_metric']);
  });
});

const CONFIG = {
  format: 'chronicle-study-config',
  version: 1,
  exportedAt: '2026-09-17T00:00:00Z',
  study: {
    contact: 'imported@example.org',
    dataRetentionDays: '400',
    description: 'Imported description',
    features: ['CHRONICLE_DATA_COLLECTION', 'TIME_USE_DIARY'],
    group: 'imported-group',
    modules: moduleDraftsWith({
      health_connect: { mode: 'required', healthConnectRecordTypes: ['steps'] },
      device_settings: { mode: 'optional', intervalSeconds: '3600' },
    }),
    participantPolicy: POLICY,
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
describe('StudyFormDialog configuration export and import', () => {
  test('imports a configuration file into every field of the create form and submits it', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    await importFile(JSON.stringify(CONFIG));

    expect(screen.getByRole('status').textContent).toContain('config.json');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Imported study');
    expect(screen.getByLabelText<HTMLInputElement>(/^Contact email/).value).toBe('imported@example.org');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study group/).value).toBe('imported-group');
    expect(screen.getByLabelText<HTMLInputElement>(/^Version/).value).toBe('2.0');
    expect(screen.getByLabelText<HTMLInputElement>('Study duration (days)').value).toBe('180');
    expect(screen.getByLabelText<HTMLInputElement>('Data retention (days)').value).toBe('400');
    expect(screen.getByRole('button', { name: 'Time use diary' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText<HTMLInputElement>(/^Responsible institution/).value).toBe(
      POLICY.responsibleInstitution,
    );
    expect(screen.getByLabelText<HTMLInputElement>('Steps').checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('[id$="-interval-device_settings"]')?.value).toBe('3600');

    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create study' })));
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.title).toBe('Imported study');
    expect(submissions[0]?.modules.health_connect.mode).toBe('required');
    expect(submissions[0]?.modules.health_connect.healthConnectRecordTypes).toEqual(['steps']);
    expect(submissions[0]?.participantPolicy?.version).toBe(POLICY.version);
  });

  test('shows every module in the state the save path will write, not Disabled by omission', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    // CONFIG names two modules; usage_events is not one of them, and its contract default
    // is enabled — the form must not claim it is off while the save path turns it on.
    await importFile(JSON.stringify(CONFIG));

    const usageEvents = screen.getByRole('group', { name: 'App Usage Events collection mode' });
    expect(usageEvents.querySelector<HTMLInputElement>('input[value="disabled"]')?.checked).toBe(false);
    expect(usageEvents.querySelector<HTMLInputElement>('input[value="optional"]')?.checked).toBe(true);

    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create study' })));
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(submissions[0]?.modules.usage_events.mode).toBe('optional');
  });

  test('does not import a feature the form cannot show', async () => {
    const submissions: StudyFormData[] = [];
    const onSubmit = mock((form: StudyFormData) => {
      submissions.push(form);
      return Promise.resolve();
    });
    render(<StudyFormDialog mode="create" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    await importFile(
      JSON.stringify({
        ...CONFIG,
        study: {
          ...CONFIG.study,
          features: ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE'],
        },
      }),
    );

    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create study' })));
    fireEvent.click(screen.getByRole('button', { name: 'Save anyway' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(submissions[0]?.features).toEqual(['CHRONICLE_DATA_COLLECTION']);
  });

  test("keeps the edited study's participant policy and says so", async () => {
    settingLocks = ['ParticipantPolicy'];
    studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
    render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));

    await importFile(
      JSON.stringify({
        ...CONFIG,
        study: { ...CONFIG.study, participantPolicy: { ...POLICY, version: 'imported-policy' } },
      }),
    );

    expect(screen.getByLabelText<HTMLInputElement>(/^Policy version/).value).toBe(POLICY.version);
    expect(screen.getByRole('status').textContent).toContain('participant policy');
  });

  test('refuses an oversized file without reading it into memory', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));

    const input = screen.getByTestId<HTMLInputElement>('study-config-file');
    expect(input.hidden).toBe(true);
    // The live region exists before the import so a screen reader announces the change.
    expect(screen.getByRole('status').textContent).toBe('');
  });

  test('rejects a file that is not a study configuration and leaves the form untouched', async () => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Typed title' } });

    await importFile(JSON.stringify({ hello: 'world' }), 'notes.json');

    expect(screen.getByRole('alert').textContent).toContain('not a Chronicle study configuration');
    expect(screen.getByLabelText<HTMLInputElement>(/^Study name/).value).toBe('Typed title');
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
      limitsQuery = { data: { studyDuration: { days: 40, months: 0, years: 0 } } };
      render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
      fireEvent.change(screen.getByLabelText(/^Study group/), { target: { value: 'unsaved-group' } });

      fireEvent.click(screen.getByRole('button', { name: 'Export configuration' }));

      expect(blobs).toHaveLength(1);
      expect(names[0]).toMatch(/^existing-study-config-\d{4}-\d{2}-\d{2}\.json$/);
      const [blob] = blobs;
      if (!blob) throw new Error('export produced no blob');
      const exported = JSON.parse(await blob.text()) as { study: StudyFormData; format: string };
      expect(exported.format).toBe('chronicle-study-config');
      expect(exported.study.title).toBe('Existing study');
      expect(exported.study.group).toBe('unsaved-group');
      expect(exported.study.studyDurationDays).toBe('40');
      expect(exported.study.participantPolicy?.responsibleInstitution).toBe(POLICY.responsibleInstitution);
      expect(exported.study).not.toHaveProperty('loadedParticipantPolicy');
    } finally {
      // A stub over an inherited member (anchor click lives on HTMLElement) is deleted, not left behind.
      restoreOwn(URL, 'createObjectURL', originalCreateObjectURL);
      restoreOwn(URL, 'revokeObjectURL', originalRevokeObjectURL);
      restoreOwn(HTMLAnchorElement.prototype, 'click', originalClick);
    }
  });
});

test('enrollment locks disable the generated policy controls', async () => {
  const { ENROLLMENT_LOCKED_SETTING_FIELDS } = await import('@/generated/chronicle-contracts');
  settingLocks = Object.keys(ENROLLMENT_LOCKED_SETTING_FIELDS);
  studySettingsQuery = { data: { ParticipantPolicy: POLICY } };
  render(<StudyFormDialog mode="edit" onSubmit={mock(() => Promise.resolve())} study={EDIT_STUDY} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit study' }));
  const controls = {
    ParticipantPolicy: screen.getByLabelText(/^Policy version/),
    Withdrawal: screen.getByRole('combobox', { name: 'Participant withdrawal' }),
  };
  for (const setting of Object.keys(ENROLLMENT_LOCKED_SETTING_FIELDS)) {
    const control = controls[setting as keyof typeof controls] as HTMLInputElement;
    expect(control.disabled || control.closest('fieldset[disabled]') !== null).toBe(true);
  }
});

test.each(['Policy version', 'Policy effective at'])(
  'validation focuses %s by its stable field name',
  async (label) => {
    render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
    fireEvent.change(screen.getByLabelText(/^Study name/), { target: { value: 'Pilot' } });
    fireEvent.change(screen.getByLabelText(/^Contact email/), { target: { value: 'study@example.org' } });
    fillParticipantPolicy();
    const field = screen.getByLabelText<HTMLInputElement>(new RegExp(`^${label}`));
    fireEvent.change(field, { target: { value: '' } });
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Create study' })));
    expect(document.activeElement).toBe(field);
    // The validation summary link for this field also moves focus to it.
    field.blur();
    const summary = screen.getByText('Fix the highlighted fields before saving.').closest('[role="alert"]');
    const links = within(summary as HTMLElement).getAllByRole('button');
    expect(links).toHaveLength(1);
    fireEvent.click(links[0] as HTMLElement);
    expect(document.activeElement).toBe(field);
  },
);

test('non-consent-gated modules advertise enablement without a participant decline promise', () => {
  render(<StudyFormDialog mode="create" onSubmit={mock(() => Promise.resolve())} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create new study' }));
  const control = within(screen.getByRole('group', { name: 'Sensor Availability collection mode' }));
  expect(control.queryByRole('radio', { name: 'Optional' })).toBeNull();
  expect(control.getByRole('radio', { name: 'Enabled' })).toBeTruthy();
});
