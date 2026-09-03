// Canonical domain value sets (module ids, dispositions, feature ids, sensor types and
// their ordering/defaults) come from the generated LinkML contract module. This file owns
// ONLY web presentation: labels, descriptions, grouping, and which values the UI offers.
import {
  type ActiveCollectionModuleId,
  ANDROID_SENSOR_MAPPINGS,
  type AndroidSensorType,
  COLLECTION_DATA_DISPOSITIONS,
  COLLECTION_MODULE_CONTRACTS,
  type CollectionDataDisposition as ContractCollectionDataDisposition,
  type IosSensorType,
  type StudyFeature,
} from '@/generated/chronicle-contracts';

// The study features the web UI offers as toggles. Web-owned selection (presentation),
// but every literal must be a generated StudyFeature — `satisfies` breaks the build if
// the contract renames or drops one.
// ANDROID_SENSOR and IOS_SENSOR are deliberately absent. Both wrote a legacy
// SensorSetting whose job is now done by the per-sensor CollectionModuleId modules
// under CHRONICLE_DATA_COLLECTION, which carry their own rate and duty cycle and are
// consented individually. Offering them alongside the modules gave the form two
// competing sensor pickers. The feature values still exist in the contract, so
// studies that already carry them keep deserializing.
const OFFERED_STUDY_FEATURES = [
  'CHRONICLE_DATA_COLLECTION',
  'CHRONICLE_SURVEYS',
  'TIME_USE_DIARY',
] as const satisfies readonly StudyFeature[];

export type StudyModule = (typeof OFFERED_STUDY_FEATURES)[number];

// Web-owned labels for the offered study features (exhaustive by construction).
// "Data Collection", not "Android Data Collection": the DataCollection setting is
// read by both platforms, each realizing the modules it can.
const STUDY_FEATURE_LABELS: Record<StudyModule, string> = {
  CHRONICLE_DATA_COLLECTION: 'Data Collection',
  CHRONICLE_SURVEYS: 'Custom Surveys',
  TIME_USE_DIARY: 'Time Use Diary',
};

export const STUDY_FEATURES: ReadonlyArray<{ label: string; value: StudyModule }> = OFFERED_STUDY_FEATURES.map(
  (value) => ({ label: STUDY_FEATURE_LABELS[value], value }),
);

// Stable HealthConnectRecordType wire ids from chronicle-models. The web owns only
// presentation labels; the values sent to the server stay lowercase snake_case.
export const HEALTH_CONNECT_RECORD_TYPES = [
  { label: 'Steps', value: 'steps' },
  { label: 'Distance', value: 'distance' },
  { label: 'Heart rate', value: 'heart_rate' },
  { label: 'Total calories burned', value: 'total_calories_burned' },
  { label: 'Active calories burned', value: 'active_calories_burned' },
  { label: 'Floors climbed', value: 'floors_climbed' },
  { label: 'Resting heart rate', value: 'resting_heart_rate' },
  { label: 'Oxygen saturation', value: 'oxygen_saturation' },
  { label: 'Respiratory rate', value: 'respiratory_rate' },
  { label: 'Sleep sessions and stages', value: 'sleep' },
  { label: 'Exercise sessions', value: 'exercise' },
  { label: 'Heart-rate variability', value: 'heart_rate_variability' },
  { label: 'Body temperature', value: 'body_temperature' },
  { label: 'Skin temperature', value: 'skin_temperature' },
] as const;

export type HealthConnectRecordType = (typeof HEALTH_CONNECT_RECORD_TYPES)[number]['value'];

const HEALTH_CONNECT_RECORD_TYPE_LABELS = new Map<string, string>(
  HEALTH_CONNECT_RECORD_TYPES.map(({ label, value }) => [value, label]),
);

export function isKnownHealthConnectRecordType(value: string): value is HealthConnectRecordType {
  return HEALTH_CONNECT_RECORD_TYPE_LABELS.has(value);
}

export function healthConnectRecordTypeLabel(value: string): string {
  return (
    HEALTH_CONNECT_RECORD_TYPE_LABELS.get(value) ??
    value
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

// Active data collection module ids — the generated ActiveCollectionModuleId union from
// chronicle-models. Each is the stable lowercase snake_case wire id used as a key in
// AndroidDataCollectionSetting.modules; never a raw display string. Reserved/retired ids
// (Samsung vendor sensors, hardware_sensors umbrella, location, …) are excluded from this
// selectable union by the contract itself (legacy persisted keys still arrive via the
// generated API types and are simply not rendered as toggles).
export type CollectionModuleId = ActiveCollectionModuleId;

export type CollectionModuleDescriptor = {
  defaultEnabled: boolean;
  description: string;
  // The collapsible signal group this module is rendered under in the study form
  // (one of COLLECTION_MODULE_GROUP_ORDER). Every descriptor belongs to exactly one group.
  group: string;
  label: string;
  privacyClass: string;
  value: CollectionModuleId;
  // For a per-sensor hardware module: the AndroidSensorType (camelCase) this module
  // collects. Present only on the sensor_* modules; drives their per-sensor rate/duty UI
  // and the sensorPolicy written for them.
  sensorType?: AndroidSensorType;
};

// The collapsible group labels, in render order, for the study form's data-collection
// section. Every CollectionModuleDescriptor.group is one of these.
export const COLLECTION_MODULE_GROUP_ORDER: ReadonlyArray<string> = [
  'Usage & Behavior',
  'Audio',
  'Device State',
  'Health',
  'Diagnostics & Capability',
  'Hardware Sensors',
];

// Web-owned presentation for each active module: label, description, group, and the
// human-readable privacy class string. Canonical facts (defaultEnabled, android sensor
// mapping) are joined in from the generated contract below — never hand-written here.
// Order is the render order within the study form (relevance order for the per-sensor
// modules, mirroring the generated ANDROID_SENSOR_MAPPINGS displayOrder).
const COLLECTION_MODULE_PRESENTATION = [
  {
    value: 'usage_events',
    label: 'App Usage Events',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description: 'Foreground app usage and interaction events.',
  },
  {
    value: 'device_lifecycle',
    label: 'Device Lifecycle',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description: 'Power, boot, and shutdown lifecycle events.',
  },
  {
    value: 'user_identification',
    label: 'User Identification',
    group: 'Diagnostics & Capability',
    privacyClass: 'Local participant label',
    description: 'On-device participant labelling for shared devices.',
  },
  {
    value: 'upload_telemetry',
    label: 'Upload Telemetry',
    group: 'Diagnostics & Capability',
    privacyClass: 'Operational diagnostics',
    description: 'Upload success/failure diagnostics (no participant content).',
  },
  {
    value: 'sensor_availability',
    label: 'Sensor Availability',
    group: 'Diagnostics & Capability',
    privacyClass: 'Device capability',
    description: 'Which sensors the device hardware exposes.',
  },
  {
    value: 'questionnaire',
    label: 'Questionnaire',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description: 'Scheduling of questionnaire deep-link notifications.',
  },
  {
    value: 'battery_telemetry',
    label: 'Battery Telemetry',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description: 'Battery level, charging state, and power events.',
  },
  {
    value: 'interaction_events',
    label: 'Interaction Events',
    group: 'Usage & Behavior',
    privacyClass: 'Interaction metadata',
    description:
      'Where taps and scrolls land (screen-region grid + element role), via an Accessibility service. Content-free — never the text of what you tap.',
  },
  {
    value: 'in_app_activity_class',
    label: 'In-App Activity',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Which screen within an app is open (the app activity/screen name), added to the app-usage log at the same resolution. Opt-in. Content-free — the screen name, never on-screen text.',
  },
  {
    value: 'audio_activity',
    label: 'Audio Status',
    group: 'Audio',
    privacyClass: 'Behavioral metadata',
    description:
      'Which app is producing audio, plus playback state, headphone/output route, and volume. Mic-free — never any audio content or microphone capture.',
  },
  {
    value: 'audio_content',
    label: 'Audio Metadata',
    group: 'Audio',
    privacyClass: 'Media content',
    description:
      "The playing track's title, artist, and album from the active media session. Opt-in — track metadata only, never the audio itself.",
  },
  {
    value: 'notification_activity',
    label: 'Notification Activity',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Per-app notification counts and categories (posted/removed). Content-free — never the text or title of a notification.',
  },
  {
    value: 'ambient_audio',
    label: 'Ambient Sound Type',
    group: 'Audio',
    privacyClass: 'Ambient audio context',
    description:
      'The type of sound in the environment (music, speech, television…) classified on the device in short microphone windows. Labels only — the audio itself is discarded on-device and never recorded, stored, or uploaded. iOS only.',
  },
  {
    value: 'sleep',
    label: 'Sleep',
    group: 'Health',
    privacyClass: 'Health metrics',
    description:
      "Sleep periods and confidence from Android's on-device Sleep API. Content-free and mic-free — a sleep label plus coarse light/motion levels, never raw sensor data.",
  },
  {
    value: 'activity_recognition',
    label: 'Activity Recognition',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      "The detected activity (still, walking, running, in-vehicle…) from Android's on-device classifier. Content-free — an activity label plus confidence, never raw sensors or location.",
  },
  {
    value: 'health_connect',
    label: 'Health Connect',
    group: 'Health',
    privacyClass: 'Health metrics',
    description:
      'Health metrics (steps, distance, heart rate…) the participant’s own apps/wearables have written to the system Health Connect store. Read-only; nothing is written back.',
  },
  {
    value: 'connectivity_state',
    label: 'Connectivity State',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description:
      'Network transport (Wi-Fi/cellular) plus metered/validated flags. No SSID, BSSID, IP, or cell identifiers — never a location proxy.',
  },
  {
    value: 'app_network_usage',
    label: 'App Network Usage',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Per-app data volume (bytes sent/received) over time buckets. Volume counts only — never payloads, destinations, domains, or URLs.',
  },
  {
    value: 'device_settings',
    label: 'Device Settings',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description:
      'A snapshot of device toggles (dark mode, font scale, Do-Not-Disturb, battery saver, thermal state…). Content-free and identity-free — how the device is configured, never what the participant does.',
  },
  // Per-sensor hardware modules — each is required/optional/unavailable with its own
  // sampling rate + duty cycle (per-sensor consent redesign). All physical telemetry,
  // default off (opt-in only). Declaration order here is NOT the render order: the
  // sensor tail of COLLECTION_MODULES is sorted by the generated
  // ANDROID_SENSOR_MAPPINGS.displayOrder below, so a chronicle-models reorder
  // propagates without touching this file.
  {
    value: 'sensor_accelerometer',
    label: 'Accelerometer',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Device motion and acceleration along three axes.',
  },
  {
    value: 'sensor_light',
    label: 'Light Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The ambient light level around the device.',
  },
  {
    value: 'sensor_proximity',
    label: 'Proximity Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Whether something is near the screen.',
  },
  {
    value: 'sensor_screen_orientation',
    label: 'Screen Orientation',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The screen orientation (portrait or landscape).',
  },
  {
    value: 'sensor_step_counter',
    label: 'Step Counter',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The number of steps taken.',
  },
  {
    value: 'sensor_gyroscope',
    label: 'Gyroscope',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Rotation and angular velocity.',
  },
  {
    value: 'sensor_magnetometer',
    label: 'Magnetometer',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Magnetic field and compass heading.',
  },
  {
    value: 'sensor_gravity',
    label: 'Gravity Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The direction and magnitude of gravity.',
  },
  {
    value: 'sensor_linear_acceleration',
    label: 'Linear Acceleration',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Acceleration with gravity removed.',
  },
  {
    value: 'sensor_rotation_vector',
    label: 'Rotation Vector',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: "The device's orientation in space.",
  },
  {
    value: 'sensor_significant_motion',
    label: 'Significant Motion',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'When the device undergoes significant motion.',
  },
  {
    value: 'sensor_tilt_detector',
    label: 'Tilt Detector',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'When the device is tilted.',
  },
] as const satisfies ReadonlyArray<{
  description: string;
  group: string;
  label: string;
  privacyClass: string;
  value: CollectionModuleId;
}>;

// Compile-time exhaustiveness: every active module id in the generated contract must have
// a presentation entry above (and, being typed CollectionModuleId, no retired id can appear).
type PresentedModuleId = (typeof COLLECTION_MODULE_PRESENTATION)[number]['value'];
type AssertNever<T extends never> = T;
export type _EveryActiveModuleHasPresentation = AssertNever<Exclude<ActiveCollectionModuleId, PresentedModuleId>>;

const CONTRACT_BY_MODULE_ID = new Map(COLLECTION_MODULE_CONTRACTS.map((contract) => [contract.id, contract]));

const SENSOR_TYPE_BY_MODULE_ID = new Map<string, AndroidSensorType>(
  ANDROID_SENSOR_MAPPINGS.filter((mapping) => mapping.active).map((mapping) => [
    mapping.collectionModuleId,
    mapping.androidSensorType,
  ]),
);

const SENSOR_DISPLAY_ORDER = new Map<string, number>(
  ANDROID_SENSOR_MAPPINGS.filter((mapping) => mapping.active).map((mapping) => [
    mapping.collectionModuleId,
    mapping.displayOrder,
  ]),
);

// Render order: non-sensor modules in declaration order, then the per-sensor modules
// sorted by the generated displayOrder — the contract owns sensor relevance order.
const ORDERED_PRESENTATION = [
  ...COLLECTION_MODULE_PRESENTATION.filter((presentation) => !SENSOR_DISPLAY_ORDER.has(presentation.value)),
  ...COLLECTION_MODULE_PRESENTATION.filter((presentation) => SENSOR_DISPLAY_ORDER.has(presentation.value)).sort(
    (left, right) => (SENSOR_DISPLAY_ORDER.get(left.value) ?? 0) - (SENSOR_DISPLAY_ORDER.get(right.value) ?? 0),
  ),
];

// Per-module descriptors for the study form's data-collection toggles: web presentation
// joined with the generated contract facts. `defaultEnabled` and `sensorType` come from
// chronicle-models via the generated module — they are never hand-written here.
export const COLLECTION_MODULES: ReadonlyArray<CollectionModuleDescriptor> = ORDERED_PRESENTATION.map(
  (presentation) => {
    const contract = CONTRACT_BY_MODULE_ID.get(presentation.value);
    if (!contract) {
      throw new Error(`[study-constants] no generated contract for collection module '${presentation.value}'`);
    }
    const sensorType = SENSOR_TYPE_BY_MODULE_ID.get(presentation.value);
    return {
      ...presentation,
      defaultEnabled: contract.activeDefaultEnabled,
      ...(sensorType ? { sensorType } : {}),
    };
  },
);

// Per-sensor module ids (every COLLECTION_MODULES entry that carries a sensorType).
export const SENSOR_MODULE_IDS: ReadonlySet<CollectionModuleId> = new Set<CollectionModuleId>(
  COLLECTION_MODULES.filter((m) => m.sensorType).map((m) => m.value),
);

// Default per-sensor sampling policy (mirrors the model's AndroidSensorSetting defaults).
export const DEFAULT_SENSOR_RATE_HZ = '5';
export const DEFAULT_SENSOR_DUTY_ACTIVE = '30';
export const DEFAULT_SENSOR_DUTY_PERIOD = '300';

// The pull/periodic modules whose collection interval (CollectionCadence.intervalSeconds)
// the Android side actually honors. Only these get the per-module "Collection interval"
// control in the study form; every other module ignores it. Mirrors the modules that read
// CollectionModuleSetting.collectionCadence on the device.
export const INTERVAL_CONFIGURABLE_MODULES: ReadonlySet<CollectionModuleId> = new Set<CollectionModuleId>([
  'connectivity_state',
  'device_settings',
  'app_network_usage',
  'health_connect',
  'battery_telemetry',
]);

// Default collection interval (seconds) for an interval-configurable module — 15 minutes,
// matching the device's effective sampling floor (WorkManager's ~15 min minimum cadence).
export const DEFAULT_COLLECTION_INTERVAL_SECONDS = '900';

// Disposition for a module's already-collected-but-unsent on-device data when a
// researcher disables it mid-study. The generated CollectionDataDisposition from
// chronicle-models is canonical. The device acts on it only on the ACTIVE -> INACTIVE
// transition (see the collection loop closure design); a module that never collected
// has nothing to dispose.
export type CollectionDataDisposition = ContractCollectionDataDisposition;

export const DEFAULT_DISPOSITION: CollectionDataDisposition = 'flush_then_stop';

// Web-owned labels/descriptions for each disposition (exhaustive by construction).
const DISPOSITION_PRESENTATION: Record<CollectionDataDisposition, { description: string; label: string }> = {
  flush_then_stop: {
    label: 'Flush then stop',
    description: 'Upload data already collected on-device, then stop. No data loss.',
  },
  discard_and_stop: {
    label: 'Discard & stop',
    description: 'Drop unsent on-device data, then stop. Intentional data loss.',
  },
  hold_pending: {
    label: 'Hold pending',
    description: 'Stop, but keep unsent data on-device until the module is re-enabled.',
  },
};

export const COLLECTION_DISPOSITIONS: ReadonlyArray<{
  description: string;
  label: string;
  value: CollectionDataDisposition;
}> = COLLECTION_DATA_DISPOSITIONS.map((value) => ({ value, ...DISPOSITION_PRESENTATION[value] }));

// Modules whose pending on-device data lives in the SHARED `dataQueue` table (usage rows
// and device-state rows are merged into one queue with no per-module tag). DISCARD cannot
// be honored for these: the device upload worker drains `dataQueue` module-blind, so the
// rows upload regardless, and selectively clearing one module's rows is impossible without
// destroying the sibling module's data. The picker therefore omits "Discard & stop" for
// them — only flush/hold are outcomes the device can actually keep. See the collection
// loop closure design §7.1. Honoring DISCARD here needs a per-module tag on `dataQueue`.
export const SHARED_QUEUE_MODULES: ReadonlySet<CollectionModuleId> = new Set<CollectionModuleId>([
  'usage_events',
  'device_lifecycle',
]);

// The dispositions a given module can actually honor. Shared-queue modules cannot honor
// DISCARD (see SHARED_QUEUE_MODULES), so it is filtered out for them.
export function dispositionsForModule(
  moduleId: CollectionModuleId,
): ReadonlyArray<{ description: string; label: string; value: CollectionDataDisposition }> {
  return SHARED_QUEUE_MODULES.has(moduleId)
    ? COLLECTION_DISPOSITIONS.filter((d) => d.value !== 'discard_and_stop')
    : COLLECTION_DISPOSITIONS;
}

// Web-owned display labels for Android sensor types (exhaustive over the generated
// AndroidSensorType union, including retired vendor sensors that are never offered).
const ANDROID_SENSOR_LABELS: Record<AndroidSensorType, string> = {
  accelerometer: 'Accelerometer',
  gyroscope: 'Gyroscope',
  magnetometer: 'Magnetometer',
  gravity: 'Gravity',
  linearAcceleration: 'Linear Acceleration',
  rotationVector: 'Rotation Vector',
  stepCounter: 'Step Counter',
  light: 'Light',
  proximity: 'Proximity',
  significantMotion: 'Significant Motion',
  tiltDetector: 'Tilt Detector',
  screenOrientation: 'Screen Orientation',
  samsungGripWifi: 'Samsung Grip Wi-Fi',
  samsungMotion: 'Samsung Motion',
};

// Active sensors in generated relevance order (ANDROID_SENSOR_MAPPINGS.displayOrder, which
// mirrors SensorCollectionModules.byType). Retired Samsung vendor sensors are excluded by
// their contract active flag — never hand-filtered here.
export const ANDROID_SENSOR_TYPES: ReadonlyArray<{ label: string; value: AndroidSensorType }> =
  ANDROID_SENSOR_MAPPINGS.filter((mapping) => mapping.active)
    .slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((mapping) => ({
      label: ANDROID_SENSOR_LABELS[mapping.androidSensorType],
      value: mapping.androidSensorType,
    }));

const OFFERED_IOS_SENSOR_TYPES = [
  'accelerometer',
  'pedometer',
  'motionActivity',
] as const satisfies readonly IosSensorType[];

const IOS_SENSOR_LABELS: Record<(typeof OFFERED_IOS_SENSOR_TYPES)[number], string> = {
  accelerometer: 'Accelerometer',
  pedometer: 'Steps & Distance',
  motionActivity: 'Motion Activity',
};

export const IOS_SENSOR_TYPES: ReadonlyArray<{
  label: string;
  value: (typeof OFFERED_IOS_SENSOR_TYPES)[number];
}> = OFFERED_IOS_SENSOR_TYPES.map((value) => ({ label: IOS_SENSOR_LABELS[value], value }));
