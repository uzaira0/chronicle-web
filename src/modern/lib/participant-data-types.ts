import { PARTICIPANT_DATA_TYPES, type ParticipantDataType } from '@/generated/chronicle-contracts';

const PARTICIPANT_DATA_TYPE_LABELS: Readonly<Record<ParticipantDataType, string>> = {
  UsageEvents: 'Usage Events',
  AppUsageSurvey: 'App Usage Survey',
  IOSScreenTime: 'iOS Screen Time',
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
  UploadDiagnostics: 'Upload Diagnostics',
};

export const PARTICIPANT_DATA_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: ParticipantDataType }> =
  PARTICIPANT_DATA_TYPES.map((value) => ({ label: PARTICIPANT_DATA_TYPE_LABELS[value], value }));

export function participantDataTypesForAvailability(types: readonly ParticipantDataType[]) {
  const available = new Set(types);
  return PARTICIPANT_DATA_TYPE_OPTIONS.filter(({ value }) => available.has(value));
}
