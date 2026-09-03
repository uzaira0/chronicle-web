import { describe, expect, it } from 'bun:test';

import {
  ACTIVE_COLLECTION_MODULE_IDS,
  ANDROID_SENSOR_MAPPINGS,
  COLLECTION_DATA_DISPOSITIONS,
  COLLECTION_MODULE_IDS as CONTRACT_COLLECTION_MODULE_IDS,
  IOS_SENSOR_TYPES as CONTRACT_IOS_SENSOR_TYPES,
  STUDY_FEATURES as CONTRACT_STUDY_FEATURES,
  INACTIVE_COLLECTION_MODULE_IDS,
  PARTICIPANT_DATA_TYPES,
} from '../generated/chronicle-contracts';
import {
  ANDROID_SENSOR_TYPES,
  COLLECTION_DISPOSITIONS,
  COLLECTION_MODULE_GROUP_ORDER,
  COLLECTION_MODULES,
  DEFAULT_COLLECTION_INTERVAL_SECONDS,
  dispositionsForModule,
  INTERVAL_CONFIGURABLE_MODULES,
  IOS_SENSOR_TYPES,
  SENSOR_MODULE_IDS,
  SHARED_QUEUE_MODULES,
  STUDY_FEATURES,
  type StudyModule,
} from './study-constants';

describe('dispositionsForModule', () => {
  it('omits discard_and_stop for shared-queue modules (cannot be honored on the device)', () => {
    for (const moduleId of SHARED_QUEUE_MODULES) {
      const values = dispositionsForModule(moduleId).map((d) => d.value);
      expect(values).not.toContain('discard_and_stop');
      expect(values).toContain('flush_then_stop');
      expect(values).toContain('hold_pending');
    }
  });

  it('offers all dispositions for a dedicated-queue module (a per-sensor module)', () => {
    expect(dispositionsForModule('sensor_accelerometer')).toEqual(COLLECTION_DISPOSITIONS);
    expect(dispositionsForModule('sensor_accelerometer').map((d) => d.value)).toContain('discard_and_stop');
  });

  it('SHARED_QUEUE_MODULES is exactly the two dataQueue-backed modules', () => {
    expect([...SHARED_QUEUE_MODULES].sort()).toEqual(['device_lifecycle', 'usage_events']);
  });
});

describe('generated contract coverage (tranche 4)', () => {
  it('mirrors every participant export category from chronicle-models', () => {
    expect(PARTICIPANT_DATA_TYPES).toEqual([
      'UsageEvents',
      'Preprocessed',
      'AppUsageSurvey',
      'IOSSensor',
      'AndroidSensor',
      'SensorAvailability',
      'BatteryTelemetry',
      'InteractionEvents',
      'AudioActivity',
      'AudioContent',
      'NotificationActivity',
      'SleepEvents',
      'ActivityRecognition',
      'HealthMetrics',
      'ConnectivityState',
      'AppNetworkUsage',
      'DeviceSettings',
    ]);
  });

  it('every active generated module id has exactly one descriptor with a non-empty label and description', () => {
    const byId = new Map(COLLECTION_MODULES.map((module) => [module.value as string, module]));
    expect(byId.size).toBe(COLLECTION_MODULES.length); // no duplicate descriptors
    for (const moduleId of ACTIVE_COLLECTION_MODULE_IDS) {
      const descriptor = byId.get(moduleId);
      expect(descriptor).toBeDefined();
      expect(descriptor?.label.trim().length).toBeGreaterThan(0);
      expect(descriptor?.description.trim().length).toBeGreaterThan(0);
    }
    // And nothing beyond the active set is offered.
    expect(COLLECTION_MODULES).toHaveLength(ACTIVE_COLLECTION_MODULE_IDS.length);
  });

  it('no descriptor exists for inactive/retired module ids', () => {
    const offered = new Set<string>(COLLECTION_MODULES.map((module) => module.value));
    for (const moduleId of INACTIVE_COLLECTION_MODULE_IDS) {
      expect(offered.has(moduleId)).toBe(false);
    }
  });

  it('descriptor defaultEnabled mirrors the generated active defaults', () => {
    // Derived by construction, asserted anyway so a join regression cannot slip through.
    const enabledByDefault = COLLECTION_MODULES.filter((m) => m.defaultEnabled).map((m) => m.value as string);
    expect(enabledByDefault.sort()).toEqual(
      [
        'usage_events',
        'device_lifecycle',
        'upload_telemetry',
        'sensor_availability',
        'questionnaire',
        'battery_telemetry',
      ].sort(),
    );
  });

  it('every offered STUDY_FEATURES value is a generated StudyFeature with a non-empty label', () => {
    const contractFeatures = new Set<string>(CONTRACT_STUDY_FEATURES);
    for (const feature of STUDY_FEATURES) {
      expect(contractFeatures.has(feature.value)).toBe(true);
      expect(feature.label.trim().length).toBeGreaterThan(0);
    }
    // The generated features NOT offered are the legacy/server-side ones, on purpose.
    const offered = new Set<string>(STUDY_FEATURES.map((f) => f.value));
    const notOffered = CONTRACT_STUDY_FEATURES.filter((value) => !offered.has(value)).sort();
    // ANDROID_SENSOR and IOS_SENSOR joined this list when the legacy sensor pickers were
    // removed in favour of the per-sensor collection modules.
    expect(notOffered).toEqual([
      'ANDROID_SENSOR',
      'APP_USAGE',
      'APP_USAGE_SURVEY',
      'ARCHIVE',
      'CHRONICLE',
      'IOS_SENSOR',
    ]);
  });

  it('ANDROID_SENSOR_TYPES covers every active generated sensor mapping in displayOrder with non-empty labels', () => {
    const expected = ANDROID_SENSOR_MAPPINGS.filter((mapping) => mapping.active)
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((mapping) => mapping.androidSensorType);
    expect(ANDROID_SENSOR_TYPES.map((sensor) => sensor.value)).toEqual(expected);
    for (const sensor of ANDROID_SENSOR_TYPES) {
      expect(sensor.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('COLLECTION_MODULES renders per-sensor modules in the generated displayOrder', () => {
    const expected = ANDROID_SENSOR_MAPPINGS.filter((mapping) => mapping.active)
      .slice()
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((mapping) => mapping.collectionModuleId);
    const rendered = COLLECTION_MODULES.filter((m) => m.sensorType).map((m) => m.value);
    expect(rendered).toEqual(expected);
  });

  it('COLLECTION_DISPOSITIONS covers every generated disposition, in order, with non-empty labels and descriptions', () => {
    expect(COLLECTION_DISPOSITIONS.map((d) => d.value)).toEqual([...COLLECTION_DATA_DISPOSITIONS]);
    for (const disposition of COLLECTION_DISPOSITIONS) {
      expect(disposition.label.trim().length).toBeGreaterThan(0);
      expect(disposition.description.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('IOS_SENSOR_TYPES', () => {
  it('offers only generated iOS sensor values with labels', () => {
    expect(IOS_SENSOR_TYPES.every(({ value }) => CONTRACT_IOS_SENSOR_TYPES.includes(value))).toBe(true);
    expect(IOS_SENSOR_TYPES.every(({ label }) => label.trim().length > 0)).toBe(true);
  });

  it('offers exactly the active non-SensorKit motion streams', () => {
    expect(IOS_SENSOR_TYPES.map(({ value }) => value)).toEqual(['accelerometer', 'pedometer', 'motionActivity']);
  });
});

describe('COLLECTION_MODULES LinkML contract alignment', () => {
  it('offers only module ids present in the generated LinkML contract', () => {
    const contractIds = new Set<string>(CONTRACT_COLLECTION_MODULE_IDS);
    for (const module of COLLECTION_MODULES) {
      expect(contractIds.has(module.value)).toBe(true);
    }
  });

  it('does not offer reserved or retired backend module ids as study toggles', () => {
    type ContractCollectionModuleId = (typeof CONTRACT_COLLECTION_MODULE_IDS)[number];
    const offeredIds: ReadonlySet<string> = new Set(COLLECTION_MODULES.map((module) => module.value));
    const reservedOrRetired: ReadonlyArray<ContractCollectionModuleId> = [
      'sensor_samsung_grip_wifi',
      'sensor_samsung_motion',
      'time_use_diary',
      'app_inventory',
      'gaze_tracking',
      'interaction_content',
      'location',
      'communication_log',
      'hardware_sensors',
    ];

    for (const moduleId of reservedOrRetired) {
      expect(CONTRACT_COLLECTION_MODULE_IDS).toContain(moduleId);
      expect(offeredIds.has(moduleId)).toBe(false);
    }
  });
});

describe('STUDY_FEATURES', () => {
  it('has exactly 3 entries', () => {
    expect(STUDY_FEATURES).toHaveLength(3);
  });

  it('is a ReadonlyArray (typed as readonly)', () => {
    // ReadonlyArray is a TypeScript compile-time constraint, not a runtime freeze
    // Verify the array exists and has the expected structure
    expect(Array.isArray(STUDY_FEATURES)).toBe(true);
  });

  const expectedFeatures: { label: string; value: StudyModule }[] = [
    { label: 'Data Collection', value: 'CHRONICLE_DATA_COLLECTION' },
    { label: 'Custom Surveys', value: 'CHRONICLE_SURVEYS' },
    { label: 'Time Use Diary', value: 'TIME_USE_DIARY' },
  ];

  describe('each entry has non-empty label and value', () => {
    it.each(expectedFeatures)('$value has label "$label"', ({ label, value }) => {
      const entry = STUDY_FEATURES.find((f) => f.value === value);
      expect(entry).toBeDefined();
      expect(entry?.label).toBe(label);
      expect(entry?.label.length).toBeGreaterThan(0);
      expect(entry?.value.length).toBeGreaterThan(0);
    });
  });

  describe('each entry value matches StudyModule type', () => {
    const validModules: StudyModule[] = ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE_SURVEYS', 'TIME_USE_DIARY'];

    it.each(validModules)('"%s" is present in STUDY_FEATURES', (moduleValue) => {
      const found = STUDY_FEATURES.some((f) => f.value === moduleValue);
      expect(found).toBe(true);
    });
  });

  it('has no duplicate values', () => {
    const values = STUDY_FEATURES.map((f) => f.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has no duplicate labels', () => {
    const labels = STUDY_FEATURES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('values are all UPPER_SNAKE_CASE', () => {
    for (const feature of STUDY_FEATURES) {
      expect(feature.value).toMatch(/^[A-Z][A-Z_]+$/);
    }
  });

  it('labels are all non-empty trimmed strings', () => {
    for (const feature of STUDY_FEATURES) {
      expect(feature.label.trim()).toBe(feature.label);
      expect(feature.label.length).toBeGreaterThan(0);
    }
  });
});

describe('ANDROID_SENSOR_TYPES', () => {
  it('has exactly 12 entries (2 Samsung vendor sensors retired)', () => {
    expect(ANDROID_SENSOR_TYPES).toHaveLength(12);
  });

  it('is a ReadonlyArray (typed as readonly)', () => {
    // ReadonlyArray is a TypeScript compile-time constraint, not a runtime freeze
    expect(Array.isArray(ANDROID_SENSOR_TYPES)).toBe(true);
  });

  const expectedSensors = [
    { label: 'Accelerometer', value: 'accelerometer' },
    { label: 'Gyroscope', value: 'gyroscope' },
    { label: 'Magnetometer', value: 'magnetometer' },
    { label: 'Gravity', value: 'gravity' },
    { label: 'Linear Acceleration', value: 'linearAcceleration' },
    { label: 'Rotation Vector', value: 'rotationVector' },
    { label: 'Step Counter', value: 'stepCounter' },
    { label: 'Light', value: 'light' },
    { label: 'Proximity', value: 'proximity' },
    { label: 'Significant Motion', value: 'significantMotion' },
    { label: 'Tilt Detector', value: 'tiltDetector' },
    { label: 'Screen Orientation', value: 'screenOrientation' },
  ];

  describe('each entry has non-empty label and value', () => {
    it.each(expectedSensors)('$value has label "$label"', ({ label, value }) => {
      const entry = ANDROID_SENSOR_TYPES.find((s) => s.value === value);
      expect(entry).toBeDefined();
      expect(entry?.label).toBe(label);
      expect(entry?.label.length).toBeGreaterThan(0);
      expect(entry?.value.length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate values', () => {
    const values = ANDROID_SENSOR_TYPES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has no duplicate labels', () => {
    const labels = ANDROID_SENSOR_TYPES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  const knownSensorValues = [
    'accelerometer',
    'gyroscope',
    'magnetometer',
    'gravity',
    'linearAcceleration',
    'rotationVector',
    'stepCounter',
    'light',
    'proximity',
    'significantMotion',
    'tiltDetector',
    'screenOrientation',
  ];

  describe('known sensor values are all present', () => {
    it.each(knownSensorValues)('"%s" is present', (sensorValue) => {
      const found = ANDROID_SENSOR_TYPES.some((s) => s.value === sensorValue);
      expect(found).toBe(true);
    });
  });

  describe('each sensor value is camelCase', () => {
    it.each(ANDROID_SENSOR_TYPES.map((s) => s.value))('"%s" is camelCase', (value) => {
      // camelCase: starts with lowercase, no underscores, no spaces, no hyphens
      expect(value).toMatch(/^[a-z][a-zA-Z]*$/);
    });
  });

  it('labels are all non-empty trimmed strings', () => {
    for (const sensor of ANDROID_SENSOR_TYPES) {
      expect(sensor.label.trim()).toBe(sensor.label);
      expect(sensor.label.length).toBeGreaterThan(0);
    }
  });
});

describe('COLLECTION_MODULES grouping', () => {
  it('every descriptor has a group that is in COLLECTION_MODULE_GROUP_ORDER', () => {
    const groups = new Set(COLLECTION_MODULE_GROUP_ORDER);
    for (const module of COLLECTION_MODULES) {
      expect(typeof module.group).toBe('string');
      expect(module.group.length).toBeGreaterThan(0);
      expect(groups.has(module.group)).toBe(true);
    }
  });

  it('every module belongs to exactly one group and the union of groups equals all module ids', () => {
    const allModuleIds = COLLECTION_MODULES.map((m) => m.value).sort();
    const unioned: string[] = [];
    for (const group of COLLECTION_MODULE_GROUP_ORDER) {
      for (const module of COLLECTION_MODULES.filter((m) => m.group === group)) {
        unioned.push(module.value);
      }
    }
    // Exactly one group per module => no duplicates and same count as the descriptor list.
    expect(new Set(unioned).size).toBe(unioned.length);
    expect(unioned.sort()).toEqual(allModuleIds);
  });

  it('COLLECTION_MODULE_GROUP_ORDER has no duplicates and every group is non-empty', () => {
    expect(new Set(COLLECTION_MODULE_GROUP_ORDER).size).toBe(COLLECTION_MODULE_GROUP_ORDER.length);
    for (const group of COLLECTION_MODULE_GROUP_ORDER) {
      expect(group.length).toBeGreaterThan(0);
    }
  });

  it('every per-sensor module is in the "Hardware Sensors" group', () => {
    for (const module of COLLECTION_MODULES) {
      if (module.sensorType) {
        expect(module.group).toBe('Hardware Sensors');
      }
    }
    // And the Hardware Sensors group is exactly the per-sensor modules.
    const hardwareGroup = COLLECTION_MODULES.filter((m) => m.group === 'Hardware Sensors').map((m) => m.value);
    expect([...hardwareGroup].sort()).toEqual([...SENSOR_MODULE_IDS].sort());
  });
});

describe('INTERVAL_CONFIGURABLE_MODULES', () => {
  it('is exactly the five pull/periodic modules', () => {
    expect([...INTERVAL_CONFIGURABLE_MODULES].map(String).sort()).toEqual(
      ['app_network_usage', 'battery_telemetry', 'connectivity_state', 'device_settings', 'health_connect'].sort(),
    );
  });

  it('every interval-configurable module id is a real (non-sensor) collection module', () => {
    const ids = new Set(COLLECTION_MODULES.map((m) => m.value));
    for (const moduleId of INTERVAL_CONFIGURABLE_MODULES) {
      expect(ids.has(moduleId)).toBe(true);
      expect(SENSOR_MODULE_IDS.has(moduleId)).toBe(false);
    }
  });

  it('DEFAULT_COLLECTION_INTERVAL_SECONDS is the 15-min floor as a string', () => {
    expect(DEFAULT_COLLECTION_INTERVAL_SECONDS).toBe('900');
  });
});
