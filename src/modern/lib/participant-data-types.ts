import { PARTICIPANT_DATA_TYPES, type ParticipantDataType } from '@/generated/chronicle-contracts';

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
