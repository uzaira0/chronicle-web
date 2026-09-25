import {
  ANDROID_SENSOR_MODULE_IDS,
  COLLECTION_MODULE_CONTRACTS,
  type CollectionModuleId,
  PARTICIPANT_DATA_TYPES,
  type ParticipantDataType,
} from '@/generated/chronicle-contracts';

export const PARTICIPANT_DATA_TYPE_LABELS: Readonly<Record<ParticipantDataType, string>> = {
  UsageEvents: 'Usage Events',
  Preprocessed: 'Preprocessed',
  AppUsageSurvey: 'App Usage Survey',
  IOSSensor: 'iOS Sensor',
  AndroidSensor: 'Android Sensor',
  SensorAvailability: 'Sensor Availability',
  BatteryTelemetry: 'Battery Telemetry',
  InteractionEvents: 'Interaction Events',
  AudioActivity: 'Audio Activity',
  AudioContent: 'Audio Content',
  NotificationActivity: 'Notification Activity',
  SleepEvents: 'Sleep Events',
  ActivityRecognition: 'Activity Recognition',
  HealthMetrics: 'Health Metrics',
  ConnectivityState: 'Connectivity State',
  AppNetworkUsage: 'App Network Usage',
  DeviceSettings: 'Device Settings',
};

export const PARTICIPANT_DATA_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: ParticipantDataType }> =
  PARTICIPANT_DATA_TYPES.map((value) => ({ label: PARTICIPANT_DATA_TYPE_LABELS[value], value }));

const LEGACY_SENSOR_MODULES: Readonly<Partial<Record<ParticipantDataType, string>>> = {
  AndroidSensor: 'ANDROID_SENSOR',
  IOSSensor: 'IOS_SENSOR',
};

export function participantDataTypesForModules(modules: readonly string[]) {
  const enabledModules = new Set(modules);
  const hasUnifiedCollection = enabledModules.has('CHRONICLE_DATA_COLLECTION');
  return PARTICIPANT_DATA_TYPE_OPTIONS.filter(
    ({ value }) => hasUnifiedCollection || enabledModules.has(LEGACY_SENSOR_MODULES[value] ?? ''),
  );
}

// The collection module(s) that produce each export type. Types with no entry (surveys,
// iOS sensors) are not switched by a DataCollection module.
const DATA_TYPE_MODULES: Readonly<Partial<Record<ParticipantDataType, readonly CollectionModuleId[]>>> = {
  UsageEvents: ['usage_events'],
  Preprocessed: ['usage_events'],
  AndroidSensor: ANDROID_SENSOR_MODULE_IDS,
  SensorAvailability: ['sensor_availability'],
  BatteryTelemetry: ['battery_telemetry'],
  InteractionEvents: ['interaction_events'],
  AudioActivity: ['audio_activity'],
  AudioContent: ['audio_content'],
  NotificationActivity: ['notification_activity'],
  SleepEvents: ['sleep'],
  ActivityRecognition: ['activity_recognition'],
  HealthMetrics: ['health_connect'],
  ConnectivityState: ['connectivity_state'],
  AppNetworkUsage: ['app_network_usage'],
  DeviceSettings: ['device_settings'],
};

const DEFAULT_ENABLED = new Map(COLLECTION_MODULE_CONTRACTS.map((m) => [m.id, m.activeDefaultEnabled]));

/**
 * Export types every one of whose modules the study's DataCollection setting has off (an
 * absent entry means the module's contract default). Unknown setting (not loaded) = none.
 */
export function dataTypesOfDisabledModules(
  dataCollection: { modules?: Record<string, { enabled?: boolean } | undefined> } | undefined,
): ReadonlySet<ParticipantDataType> {
  if (!dataCollection) return new Set();
  const enabled = (id: CollectionModuleId) => dataCollection.modules?.[id]?.enabled ?? DEFAULT_ENABLED.get(id) ?? false;
  return new Set(
    PARTICIPANT_DATA_TYPES.filter((type) => {
      const modules = DATA_TYPE_MODULES[type];
      return modules !== undefined && !modules.some(enabled);
    }),
  );
}
