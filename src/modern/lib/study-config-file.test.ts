import { describe, expect, it } from 'bun:test';

import type { StudyFormData } from '@/components/study-form-dialog';

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
  const perModule = <T>(value: (moduleId: string, index: number) => T) =>
    Object.fromEntries(COLLECTION_MODULES.map(({ value: id }, index) => [id, value(id, index)]));
  return {
    contact: 'lead@example.org',
    dataRetentionDays: '400',
    description: 'Portable config fixture',
    dutyCycleActiveSeconds: '45',
    dutyCyclePeriodSeconds: '600',
    features: ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE_SURVEYS', 'TIME_USE_DIARY'],
    group: 'cohort-b',
    healthConnectRecordTypes: ['steps', 'heart_rate', 'future_metric'],
    loadedModules: { some_future_module: { enabled: true } },
    loadedParticipantPolicy: { version: 'server-copy' },
    moduleDispositions: perModule((_, i) => (i % 2 ? 'hold_pending' : 'discard_and_stop')),
    moduleIntervalSeconds: perModule((_, i) => String(1000 + i)),
    moduleRequired: perModule((_, i) => i % 3 === 0),
    // An always-on module is enabled whatever the file says, so the fixture states the truth.
    moduleSettings: Object.fromEntries(
      COLLECTION_MODULES.map((module, index) => [module.value, module.alwaysOn ? true : index % 2 === 0]),
    ),
    notificationsEnabled: true,
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
    participantLimit: '250',
    samplingRateHz: '20',
    selectedIosSensors: ['accelerometer'],
    selectedSensors: ['accelerometer', 'gyroscope'],
    sensorDutyActive: perModule((_, i) => String(10 + i)),
    sensorDutyPeriod: perModule((_, i) => String(100 + i)),
    sensorRateHz: perModule((_, i) => String(1 + i)),
    interactionGridRows: '6',
    interactionGridCols: '5',
    interactionCaptureClicks: false,
    interactionCaptureScrolls: true,
    interactionCaptureExactPosition: false,
    studyDurationDays: '180',
    title: 'Portable study',
    version: '3.1',
  };
}

const ENVELOPE = { format: STUDY_CONFIG_FORMAT, version: STUDY_CONFIG_VERSION, exportedAt: '2026-09-17T00:00:00Z' };

const MINIMAL_STUDY = {
  contact: 'a@b.org',
  dataRetentionDays: '',
  description: '',
  features: ['CHRONICLE_DATA_COLLECTION'],
  group: '',
  notificationsEnabled: false,
  participantLimit: '',
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
    expect(parsed.study).not.toHaveProperty('loadedModules');
    expect(parsed.study).not.toHaveProperty('loadedParticipantPolicy');

    expect(parseStudyConfig(text)).toEqual(toPortableStudyConfig(form));
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
      loadedModules: { current_module: {} },
      loadedParticipantPolicy: undefined,
    };
    const applied = applyStudyConfig(current, imported);
    expect(applied.title).toBe('Portable study');
    expect(applied.loadedModules).toEqual({ current_module: {} });
    expect(applied.loadedParticipantPolicy).toBeUndefined();
    expect(toPortableStudyConfig(applied)).toEqual(toPortableStudyConfig(fullForm()));
  });

  it('fills every module map from the contract defaults, so the form shows what will be saved', () => {
    const partial = {
      ...ENVELOPE,
      study: {
        ...MINIMAL_STUDY,
        moduleSettings: { health_connect: true, not_a_module: true },
        moduleRequired: { health_connect: true },
        moduleIntervalSeconds: { device_settings: '3600' },
        sensorRateHz: { sensor_accelerometer: '50' },
      },
    };
    const parsed = parseStudyConfig(JSON.stringify(partial));
    const byModule = <T>(value: (module: (typeof COLLECTION_MODULES)[number]) => T) =>
      Object.fromEntries(COLLECTION_MODULES.map((module) => [module.value, value(module)]));
    expect(parsed.moduleSettings).toEqual(
      byModule((module) => Boolean(module.alwaysOn) || module.value === 'health_connect' || module.defaultEnabled),
    );
    expect(parsed.moduleRequired).toEqual(byModule((module) => module.value === 'health_connect'));
    expect(parsed.moduleIntervalSeconds).toEqual(
      byModule((module) => (module.value === 'device_settings' ? '3600' : DEFAULT_COLLECTION_INTERVAL_SECONDS)),
    );
    expect(parsed.sensorRateHz).toEqual(
      Object.fromEntries(
        COLLECTION_MODULES.filter((module) => module.sensorType).map((module) => [
          module.value,
          module.value === 'sensor_accelerometer' ? '50' : DEFAULT_SENSOR_RATE_HZ,
        ]),
      ),
    );
    expect(parsed.moduleSettings).not.toHaveProperty('not_a_module');
  });

  it('drops features the dialog does not offer and the legacy sensor fields it cannot edit', () => {
    const legacy = {
      ...ENVELOPE,
      study: {
        ...MINIMAL_STUDY,
        features: ['CHRONICLE_DATA_COLLECTION', 'ANDROID_SENSOR', 'IOS_SENSOR', 'BOGUS'],
        selectedSensors: ['accelerometer'],
        selectedIosSensors: ['deviceUsage'],
        samplingRateHz: '100000',
        dutyCycleActiveSeconds: '1',
        dutyCyclePeriodSeconds: '1',
        moduleDispositions: { sensor_accelerometer: 'discard_and_stop' },
      },
    };
    const parsed = parseStudyConfig(JSON.stringify(legacy));
    expect(parsed.features).toEqual(['CHRONICLE_DATA_COLLECTION']);
    for (const field of [
      'selectedSensors',
      'selectedIosSensors',
      'samplingRateHz',
      'dutyCycleActiveSeconds',
      'dutyCyclePeriodSeconds',
      'moduleDispositions',
    ]) {
      expect(parsed, field).not.toHaveProperty(field);
    }
    // ...and names each of them, plus an unknown module id, for the import status line.
    const withUnknownModule = { ...legacy, study: { ...legacy.study, moduleSettings: { not_a_module: true } } };
    expect(ignoredStudyConfigEntries(JSON.stringify(withUnknownModule)).sort()).toEqual(
      [
        'ANDROID_SENSOR',
        'BOGUS',
        'IOS_SENSOR',
        'dutyCycleActiveSeconds',
        'dutyCyclePeriodSeconds',
        'moduleDispositions',
        'not_a_module',
        'samplingRateHz',
        'selectedIosSensors',
        'selectedSensors',
      ].sort(),
    );
    expect(ignoredStudyConfigEntries(JSON.stringify({ ...ENVELOPE, study: MINIMAL_STUDY }))).toEqual([]);
  });

  it('keeps the open form’s legacy sensor configuration and dispositions across an import', () => {
    const imported = parseStudyConfig(JSON.stringify({ ...ENVELOPE, study: MINIMAL_STUDY }));
    const current: StudyFormData = {
      ...fullForm(),
      features: ['CHRONICLE_DATA_COLLECTION', 'ANDROID_SENSOR'],
      loadedParticipantPolicy: undefined,
    };
    const applied = applyStudyConfig(current, imported);
    expect(applied.features).toEqual(['CHRONICLE_DATA_COLLECTION', 'ANDROID_SENSOR']);
    expect(applied.selectedSensors).toEqual(current.selectedSensors);
    expect(applied.samplingRateHz).toBe('20');
    expect(applied.moduleDispositions).toEqual(current.moduleDispositions);
  });

  it("keeps the edited study's participant policy, which enrollment may have locked", () => {
    const imported = parseStudyConfig(serializeStudyConfig(fullForm()));
    const editing: StudyFormData = {
      ...fullForm(),
      participantPolicy: { ...EMPTY_PARTICIPANT_POLICY_FORM, version: 'target-policy' },
      loadedParticipantPolicy: { version: 'target-policy' },
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
    expect(parsed.moduleSettings?.usage_events).toBe(true);
  });

  it.each([
    ['not JSON', '{nope', /not valid JSON/],
    ['wrong format', JSON.stringify({ ...ENVELOPE, format: 'something-else', study: {} }), /not a Chronicle study/],
    ['newer version', JSON.stringify({ ...ENVELOPE, version: 99, study: {} }), /version 99 is not supported/],
    ['missing version', JSON.stringify({ format: STUDY_CONFIG_FORMAT, study: {} }), /"version" has the wrong type/],
    [
      'non-scalar version',
      JSON.stringify({ ...ENVELOPE, version: { major: 1 }, study: {} }),
      /"version" has the wrong type/,
    ],
    ['missing study', JSON.stringify({ ...ENVELOPE }), /"study" has the wrong type/],
    [
      'wrong field type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), title: 7 } }),
      /"title" has the wrong type/,
    ],
    [
      'wrong map value type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), moduleSettings: { usage_events: 'yes' } } }),
      /"moduleSettings" has the wrong type/,
    ],
    [
      'array element type',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), features: ['A', 1] } }),
      /"features" has the wrong type/,
    ],
    [
      'policy not an object',
      JSON.stringify({ ...ENVELOPE, study: { ...fullForm(), participantPolicy: 'x' } }),
      /"participantPolicy" has the wrong type/,
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
