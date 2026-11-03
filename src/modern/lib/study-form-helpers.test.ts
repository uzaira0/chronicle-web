import { describe, expect, it } from 'bun:test';
import { ACTIVE_COLLECTION_MODULE_IDS as ACTIVE_MODULE_IDS, STUDY_FEATURES } from '@/generated/chronicle-contracts';
import type { StudyFormData } from '@/lib/study-form-model';
import { moduleDraftsWith } from '@/test/module-drafts';

import {
  buildDataCollectionSetting,
  buildStudyLimits,
  buildStudyPayload,
  daysToStudyDuration,
  healthConnectScopeMissing,
  invalidStudyLimitFields,
  studyDurationToDays,
  toggleHealthConnectRecordType,
} from './study-form-helpers';

// Minimal form factory for testing
function makeForm(overrides: Partial<StudyFormData> = {}): StudyFormData {
  return {
    contact: ' admin@example.com ',
    dataRetentionDays: '',
    description: ' A study description ',
    features: [] as string[],
    group: ' neuro ',
    modules: moduleDraftsWith(),
    studyDurationDays: '',
    title: ' My Study ',
    version: ' 1.0 ',
    ...overrides,
  };
}

describe('studyDurationToDays()', () => {
  it('converts years, months, and days to total days', () => {
    expect(studyDurationToDays({ years: 1, months: 2, days: 15 })).toBe(365 + 60 + 15);
  });

  it('returns 0 for all-zero duration', () => {
    expect(studyDurationToDays({ years: 0, months: 0, days: 0 })).toBe(0);
  });

  it('handles only years', () => {
    expect(studyDurationToDays({ years: 2, months: 0, days: 0 })).toBe(730);
  });

  it('handles only months', () => {
    expect(studyDurationToDays({ years: 0, months: 6, days: 0 })).toBe(180);
  });

  it('handles only days', () => {
    expect(studyDurationToDays({ years: 0, months: 0, days: 10 })).toBe(10);
  });
});

describe('daysToStudyDuration()', () => {
  it.each([0, 1, 29, 30, 360, 364, 365, 366, 440, 3650])('preserves %d exact days', (days) => {
    expect(daysToStudyDuration(days)).toEqual({ years: 0, months: 0, days });
  });
});

describe('buildStudyPayload()', () => {
  it.each(['', '0', '-1', '1.5', '15junk', 'NaN'])('rejects invalid enabled collection numbers: %s', (invalid) => {
    for (const modules of [
      moduleDraftsWith({ device_settings: { mode: 'optional', intervalSeconds: invalid } }),
      moduleDraftsWith({
        sensor_accelerometer: {
          mode: 'optional',
          sensorPolicy: { rateHz: invalid, dutyActive: '30', dutyPeriod: '300' },
        },
      }),
      moduleDraftsWith({
        interaction_events: {
          mode: 'optional',
          interaction: {
            gridRows: invalid,
            gridCols: '3',
            captureClicks: true,
            captureScrolls: true,
            captureElementPosition: true,
          },
        },
      }),
    ])
      expect(() =>
        buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], modules })),
      ).toThrow();
  });

  it('trims all string fields', () => {
    const payload = buildStudyPayload(makeForm());
    expect(payload.title).toBe('My Study');
    expect(payload.contact).toBe('admin@example.com');
    expect(payload.description).toBe('A study description');
    expect(payload.group).toBe('neuro');
    expect(payload.version).toBe('1.0');
  });

  it('creates modules map from features array', () => {
    const payload = buildStudyPayload(makeForm({ features: ['CHRONICLE_SURVEYS', 'TIME_USE_DIARY'] }));
    expect(payload.modules).toEqual({ CHRONICLE_SURVEYS: {}, TIME_USE_DIARY: {} });
  });

  it('creates empty modules map when no features', () => {
    const payload = buildStudyPayload(makeForm());
    expect(payload.modules).toEqual({});
  });
});

describe('buildDataCollectionSetting()', () => {
  it('keeps a zero active duty cycle and ignores incomplete disabled module fields', () => {
    const setting = buildDataCollectionSetting(
      makeForm({
        modules: moduleDraftsWith({
          sensor_accelerometer: { mode: 'optional', sensorPolicy: { rateHz: '5', dutyActive: '0', dutyPeriod: '300' } },
          device_settings: { mode: 'disabled', intervalSeconds: '' },
          interaction_events: { mode: 'disabled', interaction: { gridRows: '', gridCols: '' } },
        }),
      }),
    );
    expect(setting.modules.sensor_accelerometer?.sensorPolicy).toMatchObject({ dutyCycleActiveSeconds: 0 });
    expect(setting.modules.device_settings).not.toHaveProperty('collectionCadence');
    expect(setting.modules.interaction_events).not.toHaveProperty('interactionPolicy');
  });

  it('rejects an active duty cycle longer than its period', () => {
    expect(() =>
      buildDataCollectionSetting(
        makeForm({
          modules: moduleDraftsWith({
            sensor_accelerometer: { mode: 'optional', sensorPolicy: { dutyActive: '301', dutyPeriod: '300' } },
          }),
        }),
      ),
    ).toThrow(/cannot exceed/);
  });

  it('preserves module choices when CHRONICLE_DATA_COLLECTION is not a feature', () => {
    expect(
      buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_SURVEYS'] })).modules.usage_events?.enabled,
    ).toBe(true);
  });

  it('emits the @class marker and version 2 (carries the per-module required flag)', () => {
    const result = buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'] }));
    expect(result?.['@class']).toBe('com.openlattice.chronicle.collection.AndroidDataCollectionSetting');
    expect(result?.version).toBe(2);
  });

  it('includes every active module with explicit boolean enabled and required flags', () => {
    const result = buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'] }));
    const modules = result?.modules ?? {};
    expect(Object.keys(modules).sort()).toEqual([...ACTIVE_MODULE_IDS].sort());
    for (const id of ACTIVE_MODULE_IDS) {
      // enabled + required must always be sent — the backend CollectionModuleSetting has
      // no default for enabled; required defaults optional (false).
      expect(typeof modules[id]?.enabled).toBe('boolean');
      expect(typeof modules[id]?.required).toBe('boolean');
    }
  });

  it('defaults every module to optional (required=false) with the default draft', () => {
    const result = buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'] }));
    const modules = result?.modules ?? {};
    for (const id of ACTIVE_MODULE_IDS) {
      expect(modules[id]?.required).toBe(false);
    }
  });

  it('honors an explicit required flag for an enabled module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ usage_events: { mode: 'required' } }),
      }),
    );
    const usage = result?.modules?.usage_events as { enabled: boolean; required: boolean };
    expect(usage.enabled).toBe(true);
    expect(usage.required).toBe(true);
  });

  it('retains a required draft when the feature is off', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: [],
        modules: moduleDraftsWith({ battery_telemetry: { mode: 'required' } }),
      }),
    );
    const battery = result?.modules?.battery_telemetry as { enabled: boolean; required: boolean };
    expect(battery.enabled).toBe(true);
    expect(battery.required).toBe(true);
  });

  it('emits interaction_events policy capturing element bounds with legacy alias by default', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ interaction_events: { mode: 'optional' } }),
      }),
    );
    const policy = result?.modules?.interaction_events?.interactionPolicy as {
      gridRows: number;
      gridCols: number;
      captureClicks: boolean;
      captureScrolls: boolean;
      captureElementPosition: boolean;
    };
    expect(policy.gridRows).toBe(4);
    expect(policy.gridCols).toBe(3);
    expect(policy.captureElementPosition).toBe(true);
  });

  it('disables element bounds and legacy alias together', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          interaction_events: { interaction: { captureElementPosition: false }, mode: 'optional' },
        }),
      }),
    );
    const policy = result?.modules?.interaction_events?.interactionPolicy as {
      captureElementPosition: boolean;
    };
    expect(policy.captureElementPosition).toBe(false);
  });

  it('applies privacy-class defaults with the default draft', () => {
    const result = buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'] }));
    const modules = result?.modules ?? {};
    expect(modules.battery_telemetry?.enabled).toBe(true);
    expect(modules.usage_events?.enabled).toBe(true);
    // Privacy-sensitive modules (every per-sensor module + user_identification) default to off.
    expect(modules.sensor_accelerometer?.enabled).toBe(false);
    expect(modules.user_identification?.enabled).toBe(false);
  });

  it('honors explicit module mode overrides', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          battery_telemetry: { mode: 'disabled' },
          sensor_accelerometer: { mode: 'optional' },
        }),
      }),
    );
    const modules = result?.modules ?? {};
    expect(modules.battery_telemetry?.enabled).toBe(false);
    expect(modules.sensor_accelerometer?.enabled).toBe(true);
  });

  it('writes no disable disposition: disabling a module flushes what the phone already holds', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ battery_telemetry: { mode: 'disabled' } }),
      }),
    );
    expect(result?.modules?.battery_telemetry).not.toHaveProperty('disableDisposition');
  });

  it('attaches a per-sensor sensorPolicy (rate + duty) to an enabled sensor module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          sensor_accelerometer: {
            sensorPolicy: { rateHz: '10', dutyActive: '20', dutyPeriod: '200' },
            mode: 'optional',
          },
        }),
      }),
    );
    const accel = result?.modules?.sensor_accelerometer as {
      enabled: boolean;
      sensorPolicy?: {
        '@class': string;
        dutyCycleActiveSeconds: number;
        dutyCyclePeriodSeconds: number;
        samplingRateHz: number;
        sensors: string[];
      };
    };
    expect(accel.enabled).toBe(true);
    expect(accel.sensorPolicy?.['@class']).toBe('com.openlattice.chronicle.android.AndroidSensorSetting');
    expect(accel.sensorPolicy?.sensors).toEqual(['accelerometer']);
    expect(accel.sensorPolicy?.samplingRateHz).toBe(10);
    expect(accel.sensorPolicy?.dutyCycleActiveSeconds).toBe(20);
    expect(accel.sensorPolicy?.dutyCyclePeriodSeconds).toBe(200);
  });

  it('defaults a sensor module sensorPolicy to 5 Hz / 30 s / 300 s when unset', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ sensor_light: { mode: 'optional' } }),
      }),
    );
    const light = result?.modules?.sensor_light as {
      sensorPolicy?: { dutyCycleActiveSeconds: number; dutyCyclePeriodSeconds: number; samplingRateHz: number };
    };
    expect(light.sensorPolicy?.samplingRateHz).toBe(5);
    expect(light.sensorPolicy?.dutyCycleActiveSeconds).toBe(30);
    expect(light.sensorPolicy?.dutyCyclePeriodSeconds).toBe(300);
  });

  it('omits sensorPolicy on a disabled sensor module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ sensor_accelerometer: { mode: 'disabled' } }),
      }),
    );
    const accel = result?.modules?.sensor_accelerometer as { sensorPolicy?: unknown };
    expect(accel.sensorPolicy).toBeUndefined();
  });

  it('emits collectionCadence.intervalSeconds from the module draft for an interval-configurable enabled module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ connectivity_state: { intervalSeconds: '1800', mode: 'optional' } }),
      }),
    );
    const connectivity = result?.modules?.connectivity_state as { collectionCadence?: { intervalSeconds: number } };
    expect(connectivity.collectionCadence).toEqual({ intervalSeconds: 1800 });
  });

  it('defaults collectionCadence.intervalSeconds to 900 when unset for an interval-configurable module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ device_settings: { mode: 'optional' } }),
      }),
    );
    const deviceSettings = result?.modules?.device_settings as { collectionCadence?: { intervalSeconds: number } };
    expect(deviceSettings.collectionCadence?.intervalSeconds).toBe(900);
  });

  it('emits collectionCadence with NO @class key (CollectionCadence is a plain, non-polymorphic object)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ battery_telemetry: { intervalSeconds: '600', mode: 'optional' } }),
      }),
    );
    const battery = result?.modules?.battery_telemetry as { collectionCadence?: Record<string, unknown> };
    expect(battery.collectionCadence).toBeDefined();
    expect(Object.keys(battery.collectionCadence ?? {})).toEqual(['intervalSeconds']);
    expect('@class' in (battery.collectionCadence ?? {})).toBe(false);
    // jitterSeconds is intentionally not sent.
    expect('jitterSeconds' in (battery.collectionCadence ?? {})).toBe(false);
  });

  it('does NOT emit collectionCadence for a non-interval-configurable module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          usage_events: { intervalSeconds: '1200', mode: 'optional' },
          sensor_accelerometer: { intervalSeconds: '1200', mode: 'optional' },
        }),
        // Even if stale interval state is present, non-interval modules must not emit it.
      }),
    );
    const usage = result?.modules?.usage_events as { collectionCadence?: unknown };
    const accel = result?.modules?.sensor_accelerometer as { collectionCadence?: unknown };
    expect(usage.collectionCadence).toBeUndefined();
    expect(accel.collectionCadence).toBeUndefined();
  });

  it('preserves collectionCadence on a disabled interval-configurable module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({ connectivity_state: { mode: 'disabled' } }),
      }),
    );
    const connectivity = result?.modules?.connectivity_state as { collectionCadence?: unknown };
    expect(connectivity.collectionCadence).toEqual({ intervalSeconds: 900 });
  });

  it('persists only the exact selected Health Connect record types on the health_connect module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          health_connect: { healthConnectRecordTypes: ['steps', 'heart_rate', 'sleep'], mode: 'optional' },
        }),
      }),
    );
    expect(result?.modules?.health_connect?.healthConnectRecordTypes).toEqual(['steps', 'heart_rate', 'sleep']);
    expect(result?.modules?.usage_events?.healthConnectRecordTypes).toBeUndefined();
  });

  it('rejects an enabled Health Connect module with an empty record scope', () => {
    expect(() =>
      buildDataCollectionSetting(
        makeForm({
          features: ['CHRONICLE_DATA_COLLECTION'],
          modules: moduleDraftsWith({ health_connect: { healthConnectRecordTypes: [], mode: 'optional' } }),
        }),
      ),
    ).toThrow('Select at least one Health Connect record type');
  });

  it('clears a stale Health Connect scope when the module is disabled', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          health_connect: { healthConnectRecordTypes: ['steps', 'sleep'], mode: 'disabled' },
        }),
      }),
    );
    expect(result?.modules?.health_connect?.healthConnectRecordTypes).toEqual([]);
  });

  it('preserves a future server record type during an unrelated edit instead of silently dropping scope', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        modules: moduleDraftsWith({
          health_connect: { healthConnectRecordTypes: ['steps', 'future_metric'], mode: 'optional' },
        }),
      }),
    );
    expect(result?.modules?.health_connect?.healthConnectRecordTypes).toEqual(['steps', 'future_metric']);
  });
});

describe('buildStudyLimits()', () => {
  it('sends an empty body (an open-ended study) when all limits are empty', () => {
    expect(buildStudyLimits(makeForm())).toEqual({});
  });

  it('refuses partial or exponent numbers instead of reading a prefix of them', () => {
    const form = makeForm({ studyDurationDays: '12abc', dataRetentionDays: '1e3' });
    expect(invalidStudyLimitFields(form)).toEqual(['studyDurationDays', 'dataRetentionDays']);
    expect(buildStudyLimits(form)).toEqual({});
  });

  it('omits limits that are not whole days (the form refuses them before saving)', () => {
    expect(
      buildStudyLimits(
        makeForm({
          studyDurationDays: 'abc',
          dataRetentionDays: '0',
        }),
      ),
    ).toEqual({});
  });

  it('includes studyDuration as a duration object', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '400' }));
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 400 } });
  });

  it('includes dataRetentionDuration as a duration object', () => {
    const result = buildStudyLimits(makeForm({ dataRetentionDays: '90' }));
    expect(result).toEqual({ dataRetentionDuration: { years: 0, months: 0, days: 90 } });
  });

  it('includes all limits when all are set', () => {
    const result = buildStudyLimits(
      makeForm({
        studyDurationDays: '365',
        dataRetentionDays: '30',
      }),
    );
    expect(result).toEqual({
      studyDuration: { years: 0, months: 0, days: 365 },
      dataRetentionDuration: { years: 0, months: 0, days: 30 },
    });
  });
});

// === EXPANDED EXHAUSTIVE TESTS ===

describe('studyDurationToDays() — exhaustive parameterized', () => {
  const cases: [string, { days: number; months: number; years: number }, number][] = [
    ['1y 0m 0d', { years: 1, months: 0, days: 0 }, 365],
    ['0y 1m 0d', { years: 0, months: 1, days: 0 }, 30],
    ['0y 0m 1d', { years: 0, months: 0, days: 1 }, 1],
    ['2y 6m 15d', { years: 2, months: 6, days: 15 }, 925],
    ['0y 12m 0d', { years: 0, months: 12, days: 0 }, 360],
    ['10y 0m 0d', { years: 10, months: 0, days: 0 }, 3650],
    ['0y 0m 29d', { years: 0, months: 0, days: 29 }, 29],
    ['0y 0m 30d', { years: 0, months: 0, days: 30 }, 30],
    ['0y 0m 31d', { years: 0, months: 0, days: 31 }, 31],
    ['1y 1m 1d', { years: 1, months: 1, days: 1 }, 396],
    ['3y 0m 0d', { years: 3, months: 0, days: 0 }, 1095],
    ['0y 6m 0d', { years: 0, months: 6, days: 0 }, 180],
    ['0y 3m 0d', { years: 0, months: 3, days: 0 }, 90],
    ['5y 11m 29d', { years: 5, months: 11, days: 29 }, 2184],
    ['0y 0m 0d', { years: 0, months: 0, days: 0 }, 0],
    ['1y 11m 29d', { years: 1, months: 11, days: 29 }, 724],
    ['0y 2m 0d', { years: 0, months: 2, days: 0 }, 60],
    ['0y 0m 15d', { years: 0, months: 0, days: 15 }, 15],
    ['100y 0m 0d', { years: 100, months: 0, days: 0 }, 36500],
    ['0y 24m 0d', { years: 0, months: 24, days: 0 }, 720],
  ];

  it.each(cases)('%s => %d days', (_label, input, expected) => {
    expect(studyDurationToDays(input)).toBe(expected);
  });
});

describe('round-trip studyDurationToDays <=> daysToStudyDuration', () => {
  const canonicalDays = [
    0, 1, 15, 29, 30, 60, 90, 180, 365, 395, 400, 440, 500, 730, 1000, 1095, 1460, 1825, 2190, 3650,
  ];

  it.each(canonicalDays)('round-trip for %d days', (totalDays) => {
    const duration = daysToStudyDuration(totalDays);
    const backToDays = studyDurationToDays(duration);
    expect(backToDays).toBe(totalDays);
  });
});

describe('buildStudyPayload() — additional variations', () => {
  it('trims whitespace-only title to empty string', () => {
    const payload = buildStudyPayload(makeForm({ title: '   ' }));
    expect(payload.title).toBe('');
  });

  it('handles empty strings for all fields', () => {
    const payload = buildStudyPayload(
      makeForm({
        title: '',
        contact: '',
        description: '',
        group: '',
        version: '',
      }),
    );
    expect(payload.title).toBe('');
    expect(payload.contact).toBe('');
  });

  it('handles single feature', () => {
    const payload = buildStudyPayload(makeForm({ features: ['CHRONICLE_SURVEYS'] }));
    expect(payload.modules).toEqual({ CHRONICLE_SURVEYS: {} });
  });

  it('handles every current feature', () => {
    const features = [...STUDY_FEATURES];
    const payload = buildStudyPayload(makeForm({ features }));
    expect(Object.keys(payload.modules)).toHaveLength(features.length);
    for (const f of features) {
      expect(payload.modules[f]).toEqual({});
    }
  });

  it('preserves special characters in description', () => {
    const payload = buildStudyPayload(makeForm({ description: ' <b>HTML</b> & "quotes" ' }));
    expect(payload.description).toBe('<b>HTML</b> & "quotes"');
  });

  it('preserves unicode in title', () => {
    const payload = buildStudyPayload(makeForm({ title: ' Estudio Clinico ' }));
    expect(payload.title).toBe('Estudio Clinico');
  });

  it('trims tabs and newlines', () => {
    const payload = buildStudyPayload(makeForm({ title: '\tMy Study\n' }));
    expect(payload.title).toBe('My Study');
  });

  it('creates modules from duplicate features (last wins in object)', () => {
    const payload = buildStudyPayload(makeForm({ features: ['CHRONICLE_SURVEYS', 'CHRONICLE_SURVEYS'] }));
    expect(Object.keys(payload.modules)).toHaveLength(1);
    expect(payload.modules.CHRONICLE_SURVEYS).toEqual({});
  });

  it('contact with multiple spaces collapses correctly via trim', () => {
    const payload = buildStudyPayload(makeForm({ contact: '  user@example.com  ' }));
    expect(payload.contact).toBe('user@example.com');
  });

  it('version with leading/trailing whitespace is trimmed', () => {
    const payload = buildStudyPayload(makeForm({ version: '  2.0.0-beta  ' }));
    expect(payload.version).toBe('2.0.0-beta');
  });
});

describe('buildStudyLimits() — additional variations', () => {
  it.each(['', '60'])('recomputes data expiry when study duration changes to %s', (duration) => {
    const form = makeForm({
      studyDurationDays: duration,
      dataRetentionDays: '24',
      loadedLimits: {
        studyDurationDays: '12',
        dataRetentionDays: '24',
        studyEnds: '2026-11-03T00:00:00Z',
        studyDataExpires: '2026-11-27T00:00:00Z',
      },
    });
    expect(buildStudyLimits(form).studyDataExpires).toBeUndefined();
  });
  it('handles studyDurationDays: "1"', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '1' }));
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 1 } });
  });

  it('handles dataRetentionDays: "1"', () => {
    const result = buildStudyLimits(makeForm({ dataRetentionDays: '1' }));
    expect(result).toEqual({ dataRetentionDuration: { years: 0, months: 0, days: 1 } });
  });

  it('handles studyDurationDays: "3650" (10 years)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '3650' }));
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 3650 } });
  });

  it('omits a negative studyDurationDays', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '-30' }));
    expect(result).toEqual({});
  });

  it('omits a negative dataRetentionDays', () => {
    const result = buildStudyLimits(makeForm({ dataRetentionDays: '-90' }));
    expect(result).toEqual({});
  });

  it('handles mixed: only studyDurationDays valid', () => {
    const result = buildStudyLimits(
      makeForm({
        studyDurationDays: '60',
        dataRetentionDays: 'abc',
      }),
    );
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 60 } });
  });

  it('handles mixed: only dataRetentionDays valid', () => {
    const result = buildStudyLimits(
      makeForm({
        studyDurationDays: '0',
        dataRetentionDays: '365',
      }),
    );
    expect(result).toEqual({ dataRetentionDuration: { years: 0, months: 0, days: 365 } });
  });

  it('handles studyDurationDays: "366" (1 year + 1 day)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '366' }));
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 366 } });
  });

  it('handles studyDurationDays: "730" (2 years)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '730' }));
    expect(result).toEqual({ studyDuration: { years: 0, months: 0, days: 730 } });
  });
});

// `modules` is written whole, so a dashboard rebuilding it from its own COLLECTION_MODULES
// list would delete any module a newer server introduced.
describe('buildDataCollectionSetting() — unknown modules', () => {
  it('carries a module this build does not know about through untouched', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        loadedModules: { future_module: { enabled: true, required: true } },
      }),
    );
    expect(result?.modules.future_module).toEqual({ enabled: true, required: true });
  });

  it('lets the form win for a module it does know about', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        loadedModules: { usage_events: { enabled: false, stale: true } },
        modules: moduleDraftsWith({ usage_events: { mode: 'optional' } }),
      }),
    );
    expect(result?.modules.usage_events).toMatchObject({ enabled: true });
    expect(result?.modules.usage_events?.stale).toBeUndefined();
  });

  it('ignores non-object loaded entries', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], loadedModules: { junk: 'nope' } }),
    );
    expect(result?.modules.junk).toBeUndefined();
  });
});

describe('feature-off collection choices', () => {
  it('retains known and unknown choices so enabling the feature can resume them', () => {
    const form = makeForm({
      features: [],
      modules: moduleDraftsWith({ usage_events: { mode: 'required' }, sensor_light: { mode: 'optional' } }),
      loadedModules: { future_optional: { enabled: true, required: true } },
    });
    const off = buildDataCollectionSetting(form);
    const on = buildDataCollectionSetting({ ...form, features: ['CHRONICLE_DATA_COLLECTION'] });
    expect(off).toEqual(on);
    expect(off.modules.usage_events).toMatchObject({ enabled: true, required: true });
    expect(off.modules.sensor_light).toMatchObject({ enabled: true, required: false });
    expect(off.modules.future_optional).toMatchObject({ enabled: true, required: true });
    expect(off.modules.upload_telemetry?.enabled).toBe(true);
  });
});

it.each([
  [['sleep', 'steps', 'future_metric'], 'heart_rate', ['steps', 'heart_rate', 'sleep', 'future_metric']],
  [['sleep', 'steps', 'future_metric'], 'steps', ['sleep', 'future_metric']],
  [['steps', 'future_metric'], 'future_metric', ['steps']],
  [['steps', 'steps'], 'heart_rate', ['steps', 'heart_rate']],
] as [string[], string, string[]][])('toggles Health Connect scope %j with %s', (current, recordType, expected) => {
  const original = [...current];
  expect(toggleHealthConnectRecordType(current, recordType)).toEqual(expected);
  expect(current).toEqual(original);
});

it.each([
  ['optional', [], true],
  ['required', undefined, true],
  ['disabled', [], false],
  ['optional', ['future_metric'], false],
] as const)('checks Health Connect scope for %s with %j', (mode, selected, expected) => {
  const draft = moduleDraftsWith({
    health_connect: { mode, ...(selected ? { healthConnectRecordTypes: [...selected] } : {}) },
  }).health_connect;
  if (!selected) delete draft.healthConnectRecordTypes;
  expect(healthConnectScopeMissing(draft)).toBe(expected);
});
