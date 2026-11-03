import { describe, expect, it } from 'bun:test';
import { ENROLLMENT_LOCKED_SETTING_FIELDS } from '@/generated/chronicle-contracts';
import type { StudyFormData } from '@/lib/study-form-model';
import { moduleDraftsWith } from '@/test/module-drafts';

import { EMPTY_PARTICIPANT_POLICY_FORM } from './participant-policy';
import {
  applyStudyConfig,
  ignoredStudyConfigEntries,
  keepsCurrentParticipantPolicy,
  parseStudyConfig,
  STUDY_CONFIG_FORMAT,
  STUDY_CONFIG_VERSION,
  serializeStudyConfig,
  studyConfigFileName,
  toPortableStudyConfig,
} from './study-config-file';
import { COLLECTION_MODULES, DEFAULT_COLLECTION_INTERVAL_SECONDS, DEFAULT_SENSOR_RATE_HZ } from './study-constants';

// Every field the study form dialog edits, all set to non-default values so a dropped or
// defaulted field cannot pass as a round trip. Typed `Required` on purpose: a new
// StudyFormData field breaks this fixture until it is either carried by the file format or
// listed as deliberately excluded.
function fullForm(): Required<StudyFormData> {
  const modules = moduleDraftsWith({
    health_connect: { healthConnectRecordTypes: ['steps', 'heart_rate', 'future_metric'] },
    interaction_events: {
      interaction: {
        gridRows: '6',
        gridCols: '5',
        captureClicks: false,
        captureScrolls: true,
        captureElementPosition: false,
      },
    },
  });
  COLLECTION_MODULES.forEach((module, i) => {
    const draft = modules[module.value];
    draft.mode = module.alwaysOn || i % 2 === 0 ? (i % 3 === 0 ? 'required' : 'optional') : 'disabled';
    draft.intervalSeconds = String(1000 + i);
    if (draft.sensorPolicy)
      draft.sensorPolicy = { rateHz: String(1 + i), dutyActive: String(10 + i), dutyPeriod: String(100 + i) };
  });
  return {
    appUsageFrequency: 'HOURLY',
    loadedAppUsageFrequency: 'DAILY',
    contact: 'lead@example.org',
    dataRetentionDays: '400',
    description: 'Portable config fixture',
    features: ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE_SURVEYS', 'TIME_USE_DIARY'],
    group: 'cohort-b',
    loadedLimits: { dataRetentionDays: '90', studyDurationDays: '365' },
    loadedModules: { some_future_module: { enabled: true } },
    loadedParticipantPolicy: { version: 'server-copy' },
    loadedSettingLocks: [],
    loadedWithdrawalMode: 'ERASE',
    loadedTimeZone: 'UTC',
    loadedTimeUseDiary: { timeZone: 'UTC', maxEntries: 12 },
    modules,
    withdrawalMode: 'KEEP_PRIOR_DATA',
    timeZone: 'America/Santiago',
    participantPolicy: {
      ...EMPTY_PARTICIPANT_POLICY_FORM,
      responsibleInstitution: 'Example Institute',
      serverOperator: 'Example Operator',
      researchContact: 'team@example.org',
      purpose: 'Purpose',
      expectedDuration: 'Twelve weeks',
      procedures: 'Procedures',
      foreseeableRisks: 'Risks',
      expectedBenefits: 'Benefits',
      dataUseAndSharing: 'Sharing',
      retentionAndDeletion: 'Retention',
      privacyPolicyUrl: 'https://research.example.org/privacy',
      withdrawalUrl: 'https://research.example.org/withdraw',
      consentDocumentUrl: 'https://research.example.org/consent.pdf',
      version: 'consent-2',
      effectiveAt: '2026-08-17T09:30:00-05:00',
    },
    studyDurationDays: '180',
    title: 'Portable study',
    version: '3.1',
  };
}

const ENVELOPE = { format: STUDY_CONFIG_FORMAT, version: STUDY_CONFIG_VERSION, exportedAt: '2026-09-17T00:00:00Z' };

const MINIMAL_STUDY = {
  modules: {},
  contact: 'a@b.org',
  dataRetentionDays: '',
  description: '',
  features: ['CHRONICLE_DATA_COLLECTION'],
  group: '',
  studyDurationDays: '',
  title: 'Minimal',
  version: '',
};

describe('study configuration file', () => {
  it('round-trips every form field the modal edits, minus the loaded* carry-through', () => {
    const form = fullForm();
    const text = serializeStudyConfig(form, new Date('2026-09-17T12:00:00Z'));
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed.format).toBe(STUDY_CONFIG_FORMAT);
    expect(parsed.version).toBe(STUDY_CONFIG_VERSION);
    expect(parsed.exportedAt).toBe('2026-09-17T12:00:00.000Z');
    expect(parsed.study).not.toHaveProperty('loadedLimits');
    expect(parsed.study).not.toHaveProperty('loadedModules');
    expect(parsed.study).not.toHaveProperty('loadedParticipantPolicy');
    expect(parsed.study).not.toHaveProperty('loadedWithdrawalMode');
    expect(parsed.study).not.toHaveProperty('loadedTimeZone');
    expect(parsed.study).not.toHaveProperty('loadedTimeUseDiary');
    expect((parsed.study as Record<string, unknown>).modules).toEqual(toPortableStudyConfig(form).modules);

    expect(parseStudyConfig(text)).toEqual(toPortableStudyConfig(form));
  });

  it('requires the current module draft map instead of accepting removed flat maps', () => {
    const { modules: _modules, ...study } = MINIMAL_STUDY;
    expect(() => parseStudyConfig(JSON.stringify({ ...ENVELOPE, study }))).toThrow(/modules/);
  });

  it('parses back exactly the field set it exports, so no form field is silently dropped', () => {
    const form = fullForm();
    const exported = Object.keys(toPortableStudyConfig(form)).sort();
    const imported = Object.keys(parseStudyConfig(serializeStudyConfig(form))).sort();
    expect(imported).toEqual(exported);
  });

  it("applying an import keeps the edited study's loaded* fields and replaces everything else", () => {
    const imported = parseStudyConfig(serializeStudyConfig(fullForm()));
    const current: StudyFormData = {
      ...fullForm(),
      title: 'Current title',
      loadedLimits: { dataRetentionDays: '', studyDurationDays: '' },
      loadedModules: { current_module: {} },
      loadedParticipantPolicy: undefined,
    };
    const applied = applyStudyConfig(current, imported);
    expect(applied.loadedLimits).toEqual({ dataRetentionDays: '', studyDurationDays: '' });
    expect(applied.title).toBe('Portable study');
    expect(applied.loadedModules).toEqual({ current_module: {} });
    expect(applied.loadedParticipantPolicy).toBeUndefined();
    expect(applied.loadedWithdrawalMode).toBe(current.loadedWithdrawalMode);
    expect(applied.loadedTimeZone).toBe(current.loadedTimeZone);
    expect(applied.loadedTimeUseDiary).toEqual(current.loadedTimeUseDiary);
    expect(toPortableStudyConfig(applied)).toEqual(toPortableStudyConfig(fullForm()));
  });

  it('fills every module map from the contract defaults, so the form shows what will be saved', () => {
    const partial = {
      ...ENVELOPE,
      study: {
        ...MINIMAL_STUDY,
        modules: {
          ...moduleDraftsWith({
            health_connect: { mode: 'required' },
            device_settings: { intervalSeconds: '3600' },
            sensor_accelerometer: { sensorPolicy: { rateHz: '50', dutyActive: '60', dutyPeriod: '3600' } },
          }),
          not_a_module: {},
        },
      },
    };
    const parsed = parseStudyConfig(JSON.stringify(partial));
    const byModule = <T>(value: (module: (typeof COLLECTION_MODULES)[number]) => T) =>
      Object.fromEntries(COLLECTION_MODULES.map((module) => [module.value, value(module)]));
    expect(byModule((module) => parsed.modules[module.value].mode !== 'disabled')).toEqual({
      ...byModule((module) => Boolean(module.alwaysOn) || module.defaultEnabled),
      health_connect: true,
    });
    expect(parsed.modules.health_connect.mode).toBe('required');
    expect(byModule((module) => parsed.modules[module.value].intervalSeconds)).toEqual({
      ...byModule(() => DEFAULT_COLLECTION_INTERVAL_SECONDS),
      device_settings: '3600',
    });
    expect(byModule((module) => parsed.modules[module.value].sensorPolicy?.rateHz)).toEqual({
      ...byModule((module) => (module.sensorType ? DEFAULT_SENSOR_RATE_HZ : undefined)),
      sensor_accelerometer: '50',
    });
    expect(parsed.modules).not.toHaveProperty('not_a_module');
  });

  it('drops features the dialog does not offer and names ignored fields', () => {
    const unsupported = {
      ...ENVELOPE,
      study: {
        ...MINIMAL_STUDY,
        features: ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE', 'BOGUS'],
        moduleDispositions: { sensor_accelerometer: 'discard_and_stop' },
      },
    };
    const parsed = parseStudyConfig(JSON.stringify(unsupported));
    expect(parsed.features).toEqual(['CHRONICLE_DATA_COLLECTION']);
    // ...and names each of them, plus an unknown module id, for the import status line.
    const withUnknownModule = { ...unsupported, study: { ...unsupported.study, modules: { not_a_module: {} } } };
    expect(ignoredStudyConfigEntries(JSON.stringify(withUnknownModule)).sort()).toEqual(
      ['CHRONICLE', 'BOGUS', 'moduleDispositions', 'not_a_module'].sort(),
    );
    expect(ignoredStudyConfigEntries(JSON.stringify({ ...ENVELOPE, study: MINIMAL_STUDY }))).toEqual([]);
  });

  it('keeps target features the dialog does not offer', () => {
    const imported = parseStudyConfig(JSON.stringify({ ...ENVELOPE, study: MINIMAL_STUDY }));
    const current: StudyFormData = {
      ...fullForm(),
      features: ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE'],
      loadedParticipantPolicy: undefined,
    };
    const applied = applyStudyConfig(current, imported);
    expect(applied.features).toEqual(['CHRONICLE_DATA_COLLECTION', 'CHRONICLE']);
  });

  it("keeps the edited study's participant policy, which enrollment may have locked", () => {
    const imported = parseStudyConfig(serializeStudyConfig(fullForm()));
    const editing: StudyFormData = {
      ...fullForm(),
      participantPolicy: { ...EMPTY_PARTICIPANT_POLICY_FORM, version: 'target-policy' },
      loadedParticipantPolicy: { version: 'target-policy' },
      loadedSettingLocks: ['ParticipantPolicy'],
    };
    expect(keepsCurrentParticipantPolicy(editing)).toBe(true);
    expect(applyStudyConfig(editing, imported).participantPolicy?.version).toBe('target-policy');

    const creating: StudyFormData = { ...fullForm(), loadedParticipantPolicy: undefined };
    expect(keepsCurrentParticipantPolicy(creating)).toBe(false);
    expect(applyStudyConfig(creating, imported).participantPolicy?.version).toBe('consent-2');
  });

  it('accepts a minimal file and fills the optional fields with an empty policy', () => {
    const parsed = parseStudyConfig(JSON.stringify({ ...ENVELOPE, study: MINIMAL_STUDY }));
    expect(parsed.title).toBe('Minimal');
    expect(parsed.participantPolicy).toEqual(EMPTY_PARTICIPANT_POLICY_FORM);
    expect(parsed.modules.usage_events.mode).toBe('optional');
  });

  it.each([
    ['not JSON', '{nope', /not valid JSON/],
    ['wrong format', JSON.stringify({ ...ENVELOPE, format: 'something-else', study: {} }), /not a Chronicle study/],
    ['newer version', JSON.stringify({ ...ENVELOPE, version: 99, study: {} }), /version 99 is not supported/],
    ['missing version', JSON.stringify({ format: STUDY_CONFIG_FORMAT, study: {} }), /“version” has the wrong type/],
    [
      'non-scalar version',
      JSON.stringify({ ...ENVELOPE, version: { major: 1 }, study: {} }),
      /“version” has the wrong type/,
    ],
    ['missing study', JSON.stringify({ ...ENVELOPE }), /“study” has the wrong type/],
    [
      'wrong field type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), title: 7 } }),
      /“title” has the wrong type/,
    ],
    [
      'wrong module draft type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), modules: { usage_events: { mode: 'yes' } } } }),
      /“modules.usage_events” has the wrong type/,
    ],
    [
      'array element type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), features: ['A', 1] } }),
      /“features” has the wrong type/,
    ],
    [
      'policy not an object',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), participantPolicy: 'x' } }),
      /“participantPolicy” has the wrong type/,
    ],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseStudyConfig(text)).toThrow(message);
  });

  it('rejects a file over the size cap before parsing it', () => {
    expect(() => parseStudyConfig('x'.repeat(1_000_001))).toThrow(/too large/);
  });

  it('names the download after the title and export day, in any script', () => {
    const day = new Date('2026-09-17T23:59:00Z');
    expect(studyConfigFileName('  Sleep / Quality: Study!  ', day)).toBe('sleep-quality-study-config-2026-09-17.json');
    expect(studyConfigFileName('', day)).toBe('study-config-2026-09-17.json');
    expect(studyConfigFileName('Estudio de sueño — niños', day)).toBe('estudio-de-sueno-ninos-config-2026-09-17.json');
    expect(studyConfigFileName('睡眠研究', day)).toBe('睡眠研究-config-2026-09-17.json');
  });
});

it('imports an unlocked withdrawal policy even when the study already has a saved participant policy', () => {
  const current = fullForm();
  const imported = toPortableStudyConfig({ ...current, withdrawalMode: 'ERASE' });
  expect(applyStudyConfig(current, imported).withdrawalMode).toBe(imported.withdrawalMode);
});

it('preserves every generated enrollment-locked setting on import', () => {
  const current = {
    ...fullForm(),
    loadedSettingLocks: Object.keys(ENROLLMENT_LOCKED_SETTING_FIELDS) as StudyFormData['loadedSettingLocks'],
  };
  const imported = toPortableStudyConfig({
    ...current,
    withdrawalMode: 'ERASE',
    participantPolicy: EMPTY_PARTICIPANT_POLICY_FORM,
  });
  const applied = applyStudyConfig(current, imported);
  for (const field of Object.values(ENROLLMENT_LOCKED_SETTING_FIELDS)) expect(applied[field]).toEqual(current[field]);
});

it('an older file that names a per-module disable disposition imports without it', () => {
  const legacy = JSON.parse(serializeStudyConfig(fullForm())) as {
    study: { modules: { battery_telemetry: Record<string, unknown> } };
  };
  legacy.study.modules.battery_telemetry.disposition = 'discard_and_stop';
  const imported = parseStudyConfig(JSON.stringify(legacy));
  expect(imported.modules.battery_telemetry).not.toHaveProperty('disposition');
  expect(imported.modules.battery_telemetry).toEqual(
    parseStudyConfig(serializeStudyConfig(fullForm())).modules.battery_telemetry,
  );
});
