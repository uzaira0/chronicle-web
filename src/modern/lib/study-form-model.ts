import { z } from 'zod';
import type { AppUsageFrequency, StudySettingType } from '@/generated/chronicle-contracts';
import type { ParticipantPolicyForm } from '@/lib/participant-policy';
import type { CollectionModuleId, WithdrawalMode } from '@/lib/study-constants';
import type { StudyLimits } from '@/state/study-operations-api';

export const studyFieldName = {
  policy: (field: string) => `participant-policy-${field}`,
  feature: (feature: string) => `study-feature-${feature}`,
  healthConnect: (recordType: string) => `health-connect-${recordType}`,
  collectionNumber: (module: CollectionModuleId, field: string) => `collection-${module}-${field}`,
};

export type StudyFormData = {
  appUsageFrequency?: AppUsageFrequency;
  loadedAppUsageFrequency?: AppUsageFrequency | undefined;
  contact: string;
  dataRetentionDays: string;
  description: string;
  features: string[];
  group: string;
  modules: Record<CollectionModuleId, ModuleDraft>;
  // The study's DataCollection `modules` map exactly as loaded, so the write path can carry
  // through module entries this build does not know about instead of deleting them.
  loadedModules?: Record<string, unknown> | undefined;
  // The study's ParticipantPolicy setting exactly as loaded, so the write path can tell an
  // untouched policy (skip the PATCH — it may be locked by enrollment) from an edited one.
  loadedParticipantPolicy?: unknown;
  loadedSettingLocks?: readonly StudySettingType[] | undefined;
  // The limit inputs as loaded, so an edit that leaves them alone skips the admin-only
  // limits PUT. Stored durations and deadlines survive edits to unrelated limits.
  loadedLimits?:
    | (Pick<StudyFormData, 'dataRetentionDays' | 'studyDurationDays'> &
        Pick<StudyLimits, 'dataRetentionDuration' | 'studyDuration' | 'studyEnds' | 'studyDataExpires'>)
    | undefined;
  withdrawalMode?: WithdrawalMode;
  loadedWithdrawalMode?: WithdrawalMode | undefined;
  timeZone?: string;
  loadedTimeZone?: string | undefined;
  loadedTimeUseDiary?: Record<string, unknown> | undefined;
  participantPolicy?: ParticipantPolicyForm;
  studyDurationDays: string;
  title: string;
  version: string;
};

const MODULE_MODE_VALUES = ['disabled', 'optional', 'required'] as const;
export type ModuleMode = (typeof MODULE_MODE_VALUES)[number];
const interactionSchema = z.object({
  gridRows: z.string(),
  gridCols: z.string(),
  captureClicks: z.boolean(),
  captureScrolls: z.boolean(),
  captureElementPosition: z.boolean(),
});
export type InteractionConfig = z.infer<typeof interactionSchema>;
export const portableModuleDraftSchema = z.object({
  mode: z.enum(MODULE_MODE_VALUES),
  intervalSeconds: z.string(),
  sensorPolicy: z.object({ rateHz: z.string(), dutyActive: z.string(), dutyPeriod: z.string() }).optional(),
  interaction: interactionSchema.optional(),
  healthConnectRecordTypes: z.array(z.string()).optional(),
});
export type ModuleDraft = z.infer<typeof portableModuleDraftSchema>;

export const DEFAULT_INTERACTION_CONFIG = {
  gridRows: '4',
  gridCols: '3',
  captureClicks: true,
  captureScrolls: true,
  captureElementPosition: true,
} satisfies InteractionConfig;
