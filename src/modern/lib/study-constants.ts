// Canonical domain value sets (module ids, feature ids, sensor types and
// their ordering/defaults) come from the generated LinkML contract module. This file owns
// ONLY web presentation: labels, descriptions, grouping, and which values the UI offers.
import {
  type ActiveCollectionModuleId,
  ANDROID_SENSOR_MAPPINGS,
  type ANDROID_UPLOAD_ISSUE_CATEGORIES,
  type AndroidSensorType,
  COLLECTION_DEFAULT_INTERVAL_SECONDS,
  COLLECTION_DEFAULT_SENSOR_DUTY_ACTIVE_SECONDS,
  COLLECTION_DEFAULT_SENSOR_DUTY_PERIOD_SECONDS,
  COLLECTION_DEFAULT_SENSOR_RATE_HZ,
  COLLECTION_MODULE_CONTRACTS,
  COLLECTION_MODULE_ID,
  INTERVAL_GATED_COLLECTION_MODULE_IDS,
  PLAY_STORE_BUILD_COLLECTION_MODULE_IDS,
  STUDY_DEFAULT_WITHDRAWAL_MODE,
  type StudyFeature,
  type WithdrawalMode,
} from '@/generated/chronicle-contracts';

// The study features the web UI offers as toggles. Web-owned selection (presentation),
// but every literal must be a generated StudyFeature — `satisfies` breaks the build if
// the contract renames or drops one.
// Per-sensor modules under CHRONICLE_DATA_COLLECTION carry their own sampling policy
// and participant consent.
const OFFERED_STUDY_FEATURES = [
  'CHRONICLE_DATA_COLLECTION',
  'CHRONICLE_SURVEYS',
  'TIME_USE_DIARY',
] as const satisfies readonly StudyFeature[];

export type StudyModule = (typeof OFFERED_STUDY_FEATURES)[number];

// Web-owned labels for the offered study features (exhaustive by construction).
// "Data collection", not "Android data collection": the DataCollection setting is
// read by both platforms, each realizing the modules it can.
const STUDY_FEATURE_LABELS: Record<StudyModule, string> = {
  CHRONICLE_DATA_COLLECTION: 'Data collection',
  CHRONICLE_SURVEYS: 'Custom surveys',
  TIME_USE_DIARY: 'Time use diary',
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
// AndroidDataCollectionSetting.modules; never a raw display string. Planned inactive
// modules are excluded from this selectable union by the contract itself.
export type CollectionModuleId = ActiveCollectionModuleId;

export type CollectionModuleDescriptor = {
  // Operational module the study cannot switch off: the Play and Amazon apps refuse to
  // enroll a study that does not disclose it (server rejects the write too, see
  // validateClientSupportedCollectionPolicy). Rendered as "Always on" in the form.
  alwaysOn?: boolean;
  consentGated: boolean;
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
    value: COLLECTION_MODULE_ID.usage_events,
    label: 'App Usage Events',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description: 'Foreground app usage and interaction events.',
  },
  {
    value: COLLECTION_MODULE_ID.device_lifecycle,
    label: 'Device Lifecycle',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description: 'Power, boot, and shutdown lifecycle events.',
  },
  {
    value: COLLECTION_MODULE_ID.user_identification,
    label: 'User Identification',
    group: 'Diagnostics & Capability',
    privacyClass: 'Local participant label',
    description: 'On-device participant labelling for shared devices.',
  },
  {
    value: COLLECTION_MODULE_ID.upload_telemetry,
    label: 'Upload Telemetry',
    group: 'Diagnostics & Capability',
    privacyClass: 'Operational diagnostics',
    description: 'Upload success/failure diagnostics (no participant content).',
    alwaysOn: true,
  },
  {
    value: COLLECTION_MODULE_ID.sensor_availability,
    label: 'Sensor Availability',
    group: 'Diagnostics & Capability',
    privacyClass: 'Device capability',
    description: 'Which sensors the device hardware exposes.',
  },
  {
    value: COLLECTION_MODULE_ID.questionnaire,
    label: 'Questionnaire',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description: 'Scheduling of questionnaire deep-link notifications.',
  },
  {
    value: COLLECTION_MODULE_ID.battery_telemetry,
    label: 'Battery Telemetry',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description: 'Battery level, charging state, and power events.',
  },
  {
    value: COLLECTION_MODULE_ID.interaction_events,
    label: 'Interaction Events',
    group: 'Usage & Behavior',
    privacyClass: 'Interaction metadata',
    description:
      'Where taps, scrolls, and focus changes land — the on-screen bounds of the element, a derived screen region, the element role, and the foreground app — via an Accessibility service. Content-free: never the text of what you tap, and not the exact finger position.',
  },
  {
    value: COLLECTION_MODULE_ID.in_app_activity_class,
    label: 'In-App Activity',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Which screen within an app is open (the app activity/screen name), added to the app-usage log at the same resolution. Opt-in. Content-free — the screen name, never on-screen text.',
  },
  {
    value: COLLECTION_MODULE_ID.audio_activity,
    label: 'Audio Status',
    group: 'Audio',
    privacyClass: 'Behavioral metadata',
    description:
      'Which app is producing audio, plus playback state, headphone/output route, and volume. Mic-free — never any audio content or microphone capture.',
  },
  {
    value: COLLECTION_MODULE_ID.audio_content,
    label: 'Audio Metadata',
    group: 'Audio',
    privacyClass: 'Media content',
    description:
      'The playing track’s title, artist, and album from the active media session. Opt-in — track metadata only, never the audio itself.',
  },
  {
    value: COLLECTION_MODULE_ID.notification_activity,
    label: 'Notification Activity',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Per-app notification counts and categories (posted/removed). Content-free — never the text or title of a notification.',
  },
  {
    value: COLLECTION_MODULE_ID.sleep,
    label: 'Sleep',
    group: 'Health',
    privacyClass: 'Health metrics',
    description:
      'Sleep periods and confidence from Android’s on-device Sleep API. Content-free and mic-free — a sleep label plus coarse light/motion levels, never raw sensor data.',
  },
  {
    value: COLLECTION_MODULE_ID.activity_recognition,
    label: 'Activity Recognition',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'The detected activity (still, walking, running, in-vehicle…) from Android’s on-device classifier. Content-free — an activity label plus confidence, never raw sensors or location.',
  },
  {
    value: COLLECTION_MODULE_ID.health_connect,
    label: 'Health Connect',
    group: 'Health',
    privacyClass: 'Health metrics',
    description:
      'Health metrics (steps, distance, heart rate…) the participant’s own apps/wearables have written to the system Health Connect store. Read-only; nothing is written back.',
  },
  {
    value: COLLECTION_MODULE_ID.connectivity_state,
    label: 'Connectivity State',
    group: 'Device State',
    privacyClass: 'Device-state metadata',
    description:
      'Network transport (Wi-Fi/cellular) plus metered/validated flags. No SSID, BSSID, IP, or cell identifiers — never a location proxy.',
  },
  {
    value: COLLECTION_MODULE_ID.app_network_usage,
    label: 'App Network Usage',
    group: 'Usage & Behavior',
    privacyClass: 'Behavioral metadata',
    description:
      'Per-app data volume (bytes sent/received) over time buckets. Volume counts only — never payloads, destinations, domains, or URLs.',
  },
  {
    value: COLLECTION_MODULE_ID.device_settings,
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
    value: COLLECTION_MODULE_ID.sensor_accelerometer,
    label: 'Accelerometer',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Device motion and acceleration along 3 axes.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_light,
    label: 'Light Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The ambient light level around the device.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_proximity,
    label: 'Proximity Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Whether something is near the screen.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_screen_orientation,
    label: 'Screen Orientation',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The screen orientation (portrait or landscape).',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_step_counter,
    label: 'Step Counter',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The number of steps taken.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_gyroscope,
    label: 'Gyroscope',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Rotation and angular velocity.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_magnetometer,
    label: 'Magnetometer',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Magnetic field and compass heading.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_gravity,
    label: 'Gravity Sensor',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The direction and magnitude of gravity.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_linear_acceleration,
    label: 'Linear Acceleration',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'Acceleration with gravity removed.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_rotation_vector,
    label: 'Rotation Vector',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'The device’s orientation in space.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_significant_motion,
    label: 'Significant Motion',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'When the device undergoes significant motion.',
  },
  {
    value: COLLECTION_MODULE_ID.sensor_tilt_detector,
    label: 'Tilt Detector',
    group: 'Hardware Sensors',
    privacyClass: 'Physical telemetry',
    description: 'When the device is tilted.',
  },
] as const satisfies ReadonlyArray<{
  alwaysOn?: boolean;
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
/** @public Compile-time proof that every active module has presentation. */
export type _EveryActiveModuleHasPresentation = AssertNever<Exclude<ActiveCollectionModuleId, PresentedModuleId>>;

const CONTRACT_BY_MODULE_ID = new Map(COLLECTION_MODULE_CONTRACTS.map((contract) => [contract.id, contract]));

const SENSOR_TYPE_BY_MODULE_ID = new Map<string, AndroidSensorType>(
  ANDROID_SENSOR_MAPPINGS.map((mapping) => [mapping.collectionModuleId, mapping.androidSensorType]),
);

const SENSOR_DISPLAY_ORDER = new Map<string, number>(
  ANDROID_SENSOR_MAPPINGS.map((mapping) => [mapping.collectionModuleId, mapping.displayOrder]),
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
      consentGated: contract.consentGated,
      defaultEnabled: contract.activeDefaultEnabled,
      ...(sensorType ? { sensorType } : {}),
    };
  },
);

/** Match Android's defaults for omitted entries while preserving explicit opt-outs. */
export function collectionModuleEnabled(
  module: Pick<CollectionModuleDescriptor, 'value' | 'defaultEnabled'>,
  settings: Readonly<Record<string, { enabled?: boolean } | undefined>>,
): boolean {
  return settings[module.value]?.enabled ?? module.defaultEnabled;
}

// Default per-sensor sampling policy, as form strings (generated from the LinkML contract).
export const DEFAULT_SENSOR_RATE_HZ = String(COLLECTION_DEFAULT_SENSOR_RATE_HZ);
export const DEFAULT_SENSOR_DUTY_ACTIVE = String(COLLECTION_DEFAULT_SENSOR_DUTY_ACTIVE_SECONDS);
export const DEFAULT_SENSOR_DUTY_PERIOD = String(COLLECTION_DEFAULT_SENSOR_DUTY_PERIOD_SECONDS);

// The pull/periodic modules whose collection interval (CollectionCadence.intervalSeconds)
// the Android side actually honors. Only these get the per-module "Collection interval"
// control in the study form; every other module ignores it. Generated from the same
// chronicle-models list the device gates on (CollectionCadenceModules).
export const INTERVAL_CONFIGURABLE_MODULES: ReadonlySet<CollectionModuleId> = new Set<CollectionModuleId>(
  INTERVAL_GATED_COLLECTION_MODULE_IDS,
);

// Default collection interval (seconds) for an interval-configurable module, as a form string.
export const DEFAULT_COLLECTION_INTERVAL_SECONDS = String(COLLECTION_DEFAULT_INTERVAL_SECONDS);

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
};

// Active sensors in generated relevance order (ANDROID_SENSOR_MAPPINGS.displayOrder, which
// mirrors SensorCollectionModules.byType).
export const ANDROID_SENSOR_TYPES: ReadonlyArray<{ label: string; value: AndroidSensorType }> =
  ANDROID_SENSOR_MAPPINGS.slice()
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((mapping) => ({
      label: ANDROID_SENSOR_LABELS[mapping.androidSensorType],
      value: mapping.androidSensorType,
    }));

export type { WithdrawalMode };
export const DEFAULT_WITHDRAWAL_MODE: WithdrawalMode = STUDY_DEFAULT_WITHDRAWAL_MODE;
export const DEFAULT_STUDY_TIME_ZONE = 'UTC';

const PLAY_STORE_BUILD_MODULES = new Set<string>(PLAY_STORE_BUILD_COLLECTION_MODULE_IDS);

/** Whether the Play Store Android app collects this module; a study enabling one it does not cannot enroll Play participants. */
export function isPlayStoreBuildModule(moduleId: string): boolean {
  return PLAY_STORE_BUILD_MODULES.has(moduleId);
}

export const STUDY_SETTING_CLASSES = {
  AppUsageSurvey: 'com.openlattice.chronicle.study.AppUsageSurveySetting',
  Withdrawal: 'com.openlattice.chronicle.study.StudyWithdrawalSetting',
  TimeUseDiary: 'com.openlattice.chronicle.timeusediary.TimeUseDiarySettings',
  AndroidSensor: 'com.openlattice.chronicle.android.AndroidSensorSetting',
  InteractionPolicy: 'com.openlattice.chronicle.collection.InteractionPolicy',
  DataCollection: 'com.openlattice.chronicle.collection.AndroidDataCollectionSetting',
  ParticipantPolicy: 'com.openlattice.chronicle.study.StudyParticipantPolicy',
} as const;

// Android diagnostics module families, in the phone's Uploads-screen wording
// (uploads_issue_family_*), for the participants page filter.
export const ANDROID_DIAGNOSTIC_FAMILIES: ReadonlyArray<{ label: string; value: string }> = [
  { value: 'USAGE_LIFECYCLE', label: 'Usage/lifecycle' },
  { value: 'BATTERY', label: 'Battery' },
  { value: 'DEVICE_TELEMETRY', label: 'Device telemetry' },
  { value: 'SENSOR', label: 'Sensors' },
  { value: 'APP_RUNTIME', label: 'App runtime' },
  { value: 'INTERACTION', label: 'Interaction' },
  { value: 'AUDIO_ACTIVITY', label: 'Audio activity' },
  { value: 'AUDIO_CONTENT', label: 'Audio content' },
  { value: 'NOTIFICATION', label: 'Notifications' },
  { value: 'SLEEP', label: 'Sleep' },
  { value: 'ACTIVITY_RECOGNITION', label: 'Activity recognition' },
  { value: 'HEALTH', label: 'Health' },
  { value: 'CONNECTIVITY', label: 'Connectivity' },
  { value: 'APP_NETWORK', label: 'App network usage' },
  { value: 'DEVICE_SETTINGS', label: 'Device settings' },
  { value: 'LOCAL_STORE', label: 'Local storage' },
];

// Android diagnostics issue codes in the phone's Uploads-screen wording (uploads_issue_*),
// exhaustive over the generated code list.
const ANDROID_UPLOAD_ISSUE_LABELS: Record<keyof typeof ANDROID_UPLOAD_ISSUE_CATEGORIES, string> = {
  DESTINATION_MISSING: 'Destination missing',
  DESTINATION_IDENTITY_MISMATCH: 'Destination identity mismatch',
  DESTINATION_SOURCE_DEVICE_MISSING: 'Source device missing',
  DESTINATION_SETUP_INCOMPLETE: 'Enrollment setup incomplete',
  DESTINATION_DISABLED: 'Destination disabled',
  DESTINATION_NONCANONICAL: 'Destination address rejected',
  DESTINATION_CREDENTIAL_INCOMPLETE: 'Destination credential incomplete',
  HTTP_SERVER_ERROR: 'Server error',
  HTTP_CLIENT_ERROR: 'Request rejected',
  TIMEOUT: 'Connection timed out',
  DNS_FAILURE: 'Server address unavailable',
  TLS_FAILURE: 'Secure connection failed',
  CONNECTION_FAILURE: 'Connection failed',
  UPLOAD_FAILURE: 'Upload failed',
  APP_CRASH: 'App crash',
  APP_CRASH_NATIVE: 'Native app crash',
  APP_ANR: 'App not responding',
  SAMPLE_QUARANTINED: 'Sample quarantined',
  LOCAL_BUFFER_OVERFLOW: 'Local buffer full',
  LOCAL_REQUEUE_OVERFLOW: 'Local retry buffer full',
  LOCAL_WRITE_FAILED: 'Local write failed',
  LOCAL_SHUTDOWN_DROPPED: 'Sample dropped during shutdown',
  COLLECTION_GATE_DROPPED: 'Collection unavailable',
  MODULE_POLICY_ERASED: 'Data removed by module policy',
  DIRECT_BOOT_CAPACITY_DROPPED: 'Before-unlock buffer full',
  DIRECT_BOOT_CORRUPT_RECORD: 'Before-unlock record unreadable',
  COLLECTION_PAUSED_STORAGE: 'Collection paused for storage',
  COLLECTION_ACCESS_MISSING: 'Collection access missing',
  UNRECOGNIZED_ISSUE: 'Unrecognized issue',
};

export const ANDROID_UPLOAD_ISSUES: ReadonlyArray<{ label: string; value: string }> = Object.entries(
  ANDROID_UPLOAD_ISSUE_LABELS,
).map(([value, label]) => ({ label, value }));
