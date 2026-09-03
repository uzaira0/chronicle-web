import { describe, expect, it } from 'bun:test';

import {
  buildDataCollectionSetting,
  buildIosSensorSetting,
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
  daysToStudyDuration,
  studyDurationToDays,
} from './study-form-helpers';

// Minimal form factory for testing
function makeForm(overrides: Record<string, unknown> = {}) {
  return {
    contact: ' admin@example.com ',
    dataRetentionDays: '',
    description: ' A study description ',
    dutyCycleActiveSeconds: '30',
    dutyCyclePeriodSeconds: '300',
    features: [] as string[],
    group: ' neuro ',
    notificationsEnabled: false,
    participantLimit: '',
    samplingRateHz: '5',
    selectedIosSensors: [] as string[],
    selectedSensors: [] as string[],
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
  it('converts total days to years, months, days', () => {
    expect(daysToStudyDuration(440)).toEqual({ years: 1, months: 2, days: 15 });
  });

  it('returns all zeros for 0 days', () => {
    expect(daysToStudyDuration(0)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it('handles exact year boundary', () => {
    expect(daysToStudyDuration(365)).toEqual({ years: 1, months: 0, days: 0 });
  });

  it('handles days < 30 (no months)', () => {
    expect(daysToStudyDuration(29)).toEqual({ years: 0, months: 0, days: 29 });
  });

  it('round-trips with studyDurationToDays for canonical forms', () => {
    // Canonical: days < 30, months < ~12
    const original = { years: 2, months: 5, days: 20 };
    const totalDays = studyDurationToDays(original);
    expect(daysToStudyDuration(totalDays)).toEqual(original);
  });
});

describe('buildStudyPayload()', () => {
  it('trims all string fields', () => {
    const payload = buildStudyPayload(makeForm());
    expect(payload.title).toBe('My Study');
    expect(payload.contact).toBe('admin@example.com');
    expect(payload.description).toBe('A study description');
    expect(payload.group).toBe('neuro');
    expect(payload.version).toBe('1.0');
  });

  it('creates modules map from features array', () => {
    const payload = buildStudyPayload(makeForm({ features: ['ANDROID_SENSOR', 'TIME_USE_DIARY'] }));
    expect(payload.modules).toEqual({ ANDROID_SENSOR: {}, TIME_USE_DIARY: {} });
  });

  it('creates empty modules map when no features', () => {
    const payload = buildStudyPayload(makeForm());
    expect(payload.modules).toEqual({});
  });

  it('passes notificationsEnabled through', () => {
    expect(buildStudyPayload(makeForm({ notificationsEnabled: true })).notificationsEnabled).toBe(true);
    expect(buildStudyPayload(makeForm({ notificationsEnabled: false })).notificationsEnabled).toBe(false);
  });
});

describe('buildSensorSetting()', () => {
  it('returns null when ANDROID_SENSOR not in features', () => {
    expect(buildSensorSetting(makeForm({ features: ['TIME_USE_DIARY'] }))).toBeNull();
  });

  it('returns null when ANDROID_SENSOR is present but no sensors selected', () => {
    expect(buildSensorSetting(makeForm({ features: ['ANDROID_SENSOR'], selectedSensors: [] }))).toBeNull();
  });

  it('returns sensor setting with @class when sensors are selected', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER', 'GYROSCOPE'],
        samplingRateHz: '10',
        dutyCycleActiveSeconds: '60',
        dutyCyclePeriodSeconds: '600',
      }),
    );

    expect(result).toEqual({
      '@class': 'com.openlattice.chronicle.android.AndroidSensorSetting',
      sensors: ['ACCELEROMETER', 'GYROSCOPE'],
      samplingRateHz: 10,
      dutyCycleActiveSeconds: 60,
      dutyCyclePeriodSeconds: 600,
    });
  });

  it('defaults to 5 Hz when samplingRateHz is not a number', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: 'abc',
      }),
    );
    expect(result?.samplingRateHz).toBe(5);
  });

  it('defaults dutyCycleActiveSeconds to 30 when NaN', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        dutyCycleActiveSeconds: '',
      }),
    );
    expect(result?.dutyCycleActiveSeconds).toBe(30);
  });

  it('defaults dutyCyclePeriodSeconds to 300 when NaN', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        dutyCyclePeriodSeconds: '',
      }),
    );
    expect(result?.dutyCyclePeriodSeconds).toBe(300);
  });
});

describe('buildIosSensorSetting()', () => {
  it('returns null when IOS_SENSOR is not enabled during study creation', () => {
    expect(buildIosSensorSetting(makeForm())).toBeNull();
  });

  it('writes the polymorphic SensorSetting wrapper with selected sensors', () => {
    expect(
      buildIosSensorSetting(
        makeForm({
          features: ['IOS_SENSOR'],
          selectedIosSensors: ['accelerometer', 'pedometer', 'motionActivity'],
        }),
      ),
    ).toEqual(['com.openlattice.chronicle.sensorkit.SensorSetting', ['accelerometer', 'pedometer', 'motionActivity']]);
  });

  it('clears iOS sensors when the feature is disabled during study editing', () => {
    expect(buildIosSensorSetting(makeForm({ selectedIosSensors: ['pedometer'] }), true)).toEqual([
      'com.openlattice.chronicle.sensorkit.SensorSetting',
      [],
    ]);
  });
});

describe('buildDataCollectionSetting()', () => {
  const ACTIVE_MODULE_IDS = [
    'usage_events',
    'device_lifecycle',
    'user_identification',
    'upload_telemetry',
    'sensor_availability',
    'questionnaire',
    'battery_telemetry',
    'interaction_events',
    'in_app_activity_class',
    'audio_activity',
    'audio_content',
    'notification_activity',
    'ambient_audio',
    'sleep',
    'activity_recognition',
    'health_connect',
    'connectivity_state',
    'app_network_usage',
    'device_settings',
    'sensor_accelerometer',
    'sensor_gyroscope',
    'sensor_magnetometer',
    'sensor_gravity',
    'sensor_linear_acceleration',
    'sensor_rotation_vector',
    'sensor_step_counter',
    'sensor_light',
    'sensor_proximity',
    'sensor_significant_motion',
    'sensor_tilt_detector',
    'sensor_screen_orientation',
  ];

  it('returns null when CHRONICLE_DATA_COLLECTION is not a feature', () => {
    expect(buildDataCollectionSetting(makeForm({ features: ['ANDROID_SENSOR'] }))).toBeNull();
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

  it('defaults every module to optional (required=false) when moduleRequired is absent', () => {
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
        moduleSettings: { usage_events: true },
        moduleRequired: { usage_events: true },
      }),
    );
    const usage = result?.modules?.usage_events as { enabled: boolean; required: boolean };
    expect(usage.enabled).toBe(true);
    expect(usage.required).toBe(true);
  });

  it('forces required=false for a disabled module even if marked required (a disabled module is never required)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { battery_telemetry: false },
        moduleRequired: { battery_telemetry: true },
      }),
    );
    const battery = result?.modules?.battery_telemetry as { enabled: boolean; required: boolean };
    expect(battery.enabled).toBe(false);
    expect(battery.required).toBe(false);
  });

  it('emits interaction_events policy capturing element bounds with legacy alias by default', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { interaction_events: true } }),
    );
    const policy = result?.modules?.interaction_events?.interactionPolicy as {
      gridRows: number;
      gridCols: number;
      captureClicks: boolean;
      captureScrolls: boolean;
      captureExactPosition: boolean;
      captureElementPosition: boolean;
    };
    expect(policy.gridRows).toBe(4);
    expect(policy.gridCols).toBe(3);
    expect(policy.captureExactPosition).toBe(true);
    expect(policy.captureElementPosition).toBe(true);
  });

  it('disables element bounds and legacy alias together', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { interaction_events: true },
        interactionCaptureExactPosition: false,
      }),
    );
    const policy = result?.modules?.interaction_events?.interactionPolicy as {
      captureExactPosition: boolean;
      captureElementPosition: boolean;
    };
    expect(policy.captureExactPosition).toBe(false);
    expect(policy.captureElementPosition).toBe(false);
  });

  it('applies privacy-class defaults when moduleSettings is absent', () => {
    const result = buildDataCollectionSetting(makeForm({ features: ['CHRONICLE_DATA_COLLECTION'] }));
    const modules = result?.modules ?? {};
    expect(modules.battery_telemetry?.enabled).toBe(true);
    expect(modules.usage_events?.enabled).toBe(true);
    // Privacy-sensitive modules (every per-sensor module + user_identification) default to off.
    expect(modules.sensor_accelerometer?.enabled).toBe(false);
    expect(modules.user_identification?.enabled).toBe(false);
  });

  it('honors explicit moduleSettings overrides', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { battery_telemetry: false, sensor_accelerometer: true },
      }),
    );
    const modules = result?.modules ?? {};
    expect(modules.battery_telemetry?.enabled).toBe(false);
    expect(modules.sensor_accelerometer?.enabled).toBe(true);
  });

  it('attaches a default disableDisposition (flush_then_stop) to a disabled module', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { battery_telemetry: false } }),
    );
    const battery = result?.modules?.battery_telemetry as { disableDisposition?: string };
    expect(battery.disableDisposition).toBe('flush_then_stop');
  });

  it('omits disableDisposition on an enabled module (cleared on re-enable)', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { battery_telemetry: true } }),
    );
    const battery = result?.modules?.battery_telemetry as { disableDisposition?: string };
    expect(battery.disableDisposition).toBeUndefined();
  });

  it('honors an explicit disableDisposition for a disabled module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { battery_telemetry: false },
        moduleDispositions: { battery_telemetry: 'hold_pending' },
      }),
    );
    const battery = result?.modules?.battery_telemetry as { disableDisposition?: string };
    expect(battery.disableDisposition).toBe('hold_pending');
  });

  it('coerces a discard_and_stop to flush for shared-queue usage_events (cannot be honored)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { usage_events: false },
        // Stale/forced DISCARD for a shared-queue module: the device drains dataQueue
        // module-blind, so DISCARD is unkeepable — never emit it; coerce to no-loss.
        moduleDispositions: { usage_events: 'discard_and_stop' },
      }),
    );
    const usage = result?.modules?.usage_events as { disableDisposition?: string };
    expect(usage.disableDisposition).toBe('flush_then_stop');
  });

  it('still honors hold_pending for a shared-queue module (only discard is coerced)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { device_lifecycle: false },
        moduleDispositions: { device_lifecycle: 'hold_pending' },
      }),
    );
    const lifecycle = result?.modules?.device_lifecycle as { disableDisposition?: string };
    expect(lifecycle.disableDisposition).toBe('hold_pending');
  });

  it('keeps discard_and_stop for a dedicated-queue module (a per-sensor module)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { sensor_accelerometer: false },
        moduleDispositions: { sensor_accelerometer: 'discard_and_stop' },
      }),
    );
    const accel = result?.modules?.sensor_accelerometer as { disableDisposition?: string };
    expect(accel.disableDisposition).toBe('discard_and_stop');
  });

  it('attaches a per-sensor sensorPolicy (rate + duty) to an enabled sensor module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { sensor_accelerometer: true },
        sensorRateHz: { sensor_accelerometer: '10' },
        sensorDutyActive: { sensor_accelerometer: '20' },
        sensorDutyPeriod: { sensor_accelerometer: '200' },
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
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { sensor_light: true } }),
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
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { sensor_accelerometer: false } }),
    );
    const accel = result?.modules?.sensor_accelerometer as { sensorPolicy?: unknown };
    expect(accel.sensorPolicy).toBeUndefined();
  });

  it('emits collectionCadence.intervalSeconds from moduleIntervalSeconds for an interval-configurable enabled module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { connectivity_state: true },
        moduleIntervalSeconds: { connectivity_state: '1800' },
      }),
    );
    const connectivity = result?.modules?.connectivity_state as { collectionCadence?: { intervalSeconds: number } };
    expect(connectivity.collectionCadence).toEqual({ intervalSeconds: 1800 });
  });

  it('defaults collectionCadence.intervalSeconds to 900 when unset for an interval-configurable module', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { device_settings: true } }),
    );
    const deviceSettings = result?.modules?.device_settings as { collectionCadence?: { intervalSeconds: number } };
    expect(deviceSettings.collectionCadence?.intervalSeconds).toBe(900);
  });

  it('emits collectionCadence with NO @class key (CollectionCadence is a plain, non-polymorphic object)', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { battery_telemetry: true },
        moduleIntervalSeconds: { battery_telemetry: '600' },
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
        moduleSettings: { usage_events: true, sensor_accelerometer: true },
        // Even if stale interval state is present, non-interval modules must not emit it.
        moduleIntervalSeconds: { usage_events: '1200', sensor_accelerometer: '1200' },
      }),
    );
    const usage = result?.modules?.usage_events as { collectionCadence?: unknown };
    const accel = result?.modules?.sensor_accelerometer as { collectionCadence?: unknown };
    expect(usage.collectionCadence).toBeUndefined();
    expect(accel.collectionCadence).toBeUndefined();
  });

  it('omits collectionCadence on a disabled interval-configurable module', () => {
    const result = buildDataCollectionSetting(
      makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { connectivity_state: false } }),
    );
    const connectivity = result?.modules?.connectivity_state as { collectionCadence?: unknown };
    expect(connectivity.collectionCadence).toBeUndefined();
  });

  it('persists only the exact selected Health Connect record types on the health_connect module', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { health_connect: true },
        healthConnectRecordTypes: ['steps', 'heart_rate', 'sleep'],
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
          moduleSettings: { health_connect: true },
          healthConnectRecordTypes: [],
        }),
      ),
    ).toThrow('Select at least one Health Connect record type');
  });

  it('clears a stale Health Connect scope when the module is disabled', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { health_connect: false },
        healthConnectRecordTypes: ['steps', 'sleep'],
      }),
    );
    expect(result?.modules?.health_connect?.healthConnectRecordTypes).toEqual([]);
  });

  it('preserves a future server record type during an unrelated edit instead of silently dropping scope', () => {
    const result = buildDataCollectionSetting(
      makeForm({
        features: ['CHRONICLE_DATA_COLLECTION'],
        moduleSettings: { health_connect: true },
        healthConnectRecordTypes: ['steps', 'future_metric'],
      }),
    );
    expect(result?.modules?.health_connect?.healthConnectRecordTypes).toEqual(['steps', 'future_metric']);
  });
});

describe('buildStudyLimits()', () => {
  it('returns null when all limits are empty', () => {
    expect(buildStudyLimits(makeForm())).toBeNull();
  });

  it('returns null when all limits are zero or NaN', () => {
    expect(
      buildStudyLimits(
        makeForm({
          participantLimit: '0',
          studyDurationDays: 'abc',
          dataRetentionDays: '',
        }),
      ),
    ).toBeNull();
  });

  it('includes only participantLimit when set', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '50' }));
    expect(result).toEqual({ participantLimit: 50 });
  });

  it('includes studyDuration as a duration object', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '400' }));
    expect(result).toEqual({ studyDuration: { years: 1, months: 1, days: 5 } });
  });

  it('includes dataRetentionDuration as a duration object', () => {
    const result = buildStudyLimits(makeForm({ dataRetentionDays: '90' }));
    expect(result).toEqual({ dataRetentionDuration: { years: 0, months: 3, days: 0 } });
  });

  it('includes all limits when all are set', () => {
    const result = buildStudyLimits(
      makeForm({
        participantLimit: '100',
        studyDurationDays: '365',
        dataRetentionDays: '30',
      }),
    );
    expect(result).toEqual({
      participantLimit: 100,
      studyDuration: { years: 1, months: 0, days: 0 },
      dataRetentionDuration: { years: 0, months: 1, days: 0 },
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

describe('daysToStudyDuration() — exhaustive parameterized', () => {
  const cases: [number, { days: number; months: number; years: number }][] = [
    [0, { years: 0, months: 0, days: 0 }],
    [1, { years: 0, months: 0, days: 1 }],
    [29, { years: 0, months: 0, days: 29 }],
    [30, { years: 0, months: 1, days: 0 }],
    [31, { years: 0, months: 1, days: 1 }],
    [59, { years: 0, months: 1, days: 29 }],
    [60, { years: 0, months: 2, days: 0 }],
    [90, { years: 0, months: 3, days: 0 }],
    [180, { years: 0, months: 6, days: 0 }],
    [364, { years: 0, months: 12, days: 4 }],
    [365, { years: 1, months: 0, days: 0 }],
    [366, { years: 1, months: 0, days: 1 }],
    [395, { years: 1, months: 1, days: 0 }],
    [730, { years: 2, months: 0, days: 0 }],
    [1095, { years: 3, months: 0, days: 0 }],
    [3650, { years: 10, months: 0, days: 0 }],
    [400, { years: 1, months: 1, days: 5 }],
    [15, { years: 0, months: 0, days: 15 }],
    [150, { years: 0, months: 5, days: 0 }],
    [500, { years: 1, months: 4, days: 15 }],
  ];

  it.each(cases)('%d days => %o', (input, expected) => {
    expect(daysToStudyDuration(input)).toEqual(expected);
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

  it('handles all five features', () => {
    const features = [
      'ANDROID_SENSOR',
      'CHRONICLE_DATA_COLLECTION',
      'CHRONICLE_SURVEYS',
      'IOS_SENSOR',
      'TIME_USE_DIARY',
    ];
    const payload = buildStudyPayload(makeForm({ features }));
    expect(Object.keys(payload.modules)).toHaveLength(5);
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
    const payload = buildStudyPayload(makeForm({ features: ['ANDROID_SENSOR', 'ANDROID_SENSOR'] }));
    expect(Object.keys(payload.modules)).toHaveLength(1);
    expect(payload.modules.ANDROID_SENSOR).toEqual({});
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

describe('buildSensorSetting() — additional variations', () => {
  it('parses valid integer for samplingRateHz', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: '25',
      }),
    );
    expect(result?.samplingRateHz).toBe(25);
  });

  it('parses string with leading zeros', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: '005',
      }),
    );
    expect(result?.samplingRateHz).toBe(5);
  });

  it('defaults samplingRateHz for empty string', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: '',
      }),
    );
    expect(result?.samplingRateHz).toBe(5);
  });

  it('returns null when features is empty', () => {
    expect(buildSensorSetting(makeForm({ features: [], selectedSensors: ['ACCELEROMETER'] }))).toBeNull();
  });

  it('returns null when features has non-sensor types only', () => {
    expect(
      buildSensorSetting(
        makeForm({ features: ['TIME_USE_DIARY', 'CHRONICLE_SURVEYS'], selectedSensors: ['ACCELEROMETER'] }),
      ),
    ).toBeNull();
  });

  it('includes all selected sensors', () => {
    const sensors = ['ACCELEROMETER', 'GYROSCOPE', 'MAGNETOMETER'];
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: sensors,
      }),
    );
    expect(result?.sensors).toEqual(sensors);
  });

  it('always includes @class field', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
      }),
    );
    expect(result?.['@class']).toBe('com.openlattice.chronicle.android.AndroidSensorSetting');
  });

  it('handles very large duty cycle values', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        dutyCycleActiveSeconds: '999999',
        dutyCyclePeriodSeconds: '999999',
      }),
    );
    expect(result?.dutyCycleActiveSeconds).toBe(999999);
    expect(result?.dutyCyclePeriodSeconds).toBe(999999);
  });

  it('handles "0" as valid parsed integer for sampling rate', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: '0',
      }),
    );
    // parseInt('0') = 0, 0 || 5 = 5
    expect(result?.samplingRateHz).toBe(5);
  });

  it('handles decimal string for duty cycle', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        dutyCycleActiveSeconds: '45.7',
      }),
    );
    // parseInt('45.7') = 45
    expect(result?.dutyCycleActiveSeconds).toBe(45);
  });

  it('handles negative string for sampling rate', () => {
    const result = buildSensorSetting(
      makeForm({
        features: ['ANDROID_SENSOR'],
        selectedSensors: ['ACCELEROMETER'],
        samplingRateHz: '-10',
      }),
    );
    expect(result?.samplingRateHz).toBe(-10);
  });
});

describe('buildStudyLimits() — additional variations', () => {
  it('returns null for negative participantLimit', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '-5' }));
    expect(result).toBeNull();
  });

  it('handles decimal string for participantLimit', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '50.7' }));
    expect(result).toEqual({ participantLimit: 50 });
  });

  it('handles very large participantLimit', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '999999' }));
    expect(result).toEqual({ participantLimit: 999999 });
  });

  it('handles "1" as minimum valid limit', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '1' }));
    expect(result).toEqual({ participantLimit: 1 });
  });

  it('handles whitespace-only string as NaN', () => {
    const result = buildStudyLimits(makeForm({ participantLimit: '  ' }));
    expect(result).toBeNull();
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
    expect(result).toEqual({ studyDuration: { years: 10, months: 0, days: 0 } });
  });

  it('handles negative studyDurationDays (returns null)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '-30' }));
    expect(result).toBeNull();
  });

  it('handles negative dataRetentionDays (returns null)', () => {
    const result = buildStudyLimits(makeForm({ dataRetentionDays: '-90' }));
    expect(result).toBeNull();
  });

  it('handles mixed: only participantLimit valid, others NaN', () => {
    const result = buildStudyLimits(
      makeForm({
        participantLimit: '25',
        studyDurationDays: 'xyz',
        dataRetentionDays: '',
      }),
    );
    expect(result).toEqual({ participantLimit: 25 });
  });

  it('handles mixed: only studyDurationDays valid', () => {
    const result = buildStudyLimits(
      makeForm({
        participantLimit: '',
        studyDurationDays: '60',
        dataRetentionDays: 'abc',
      }),
    );
    expect(result).toEqual({ studyDuration: { years: 0, months: 2, days: 0 } });
  });

  it('handles mixed: only dataRetentionDays valid', () => {
    const result = buildStudyLimits(
      makeForm({
        participantLimit: '0',
        studyDurationDays: '0',
        dataRetentionDays: '365',
      }),
    );
    expect(result).toEqual({ dataRetentionDuration: { years: 1, months: 0, days: 0 } });
  });

  it('handles studyDurationDays: "366" (1 year + 1 day)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '366' }));
    expect(result).toEqual({ studyDuration: { years: 1, months: 0, days: 1 } });
  });

  it('handles studyDurationDays: "730" (2 years)', () => {
    const result = buildStudyLimits(makeForm({ studyDurationDays: '730' }));
    expect(result).toEqual({ studyDuration: { years: 2, months: 0, days: 0 } });
  });
});
