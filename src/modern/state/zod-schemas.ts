import { z } from 'zod';

import { PARTICIPATION_STATUSES } from '@/generated/chronicle-contracts';

// Built from the generated LinkML contract tuple — no hand-maintained literal copy.
export const ParticipationStatusSchema = z.enum(PARTICIPATION_STATUSES);

export const StudySchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, 'Title cannot be blank'),
  description: z.string().optional().default(''),
  contact: z.string().min(1, 'Contact is required'),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  endedAt: z.string().datetime({ offset: true }).optional(),
  lat: z.number().min(-90).max(90).optional().default(0),
  lon: z.number().min(-180).max(180).optional().default(0),
  group: z.string().max(255).optional().default(''),
  version: z.string().max(50).optional().default(''),
  organizationIds: z.array(z.string().uuid()).optional().default([]),
  notificationsEnabled: z.boolean().optional().default(false),
  storage: z
    .string()
    .max(36)
    .regex(/^[a-zA-Z]+$/, 'Storage must contain only alphabetic characters')
    .optional()
    .default('chronicle'),
  phoneNumber: z.string().max(20).optional().default(''),
});

export const ParticipantSchema = z.object({
  participantId: z.string().min(1, 'Participant ID is required').max(255),
  candidate: z.object({
    id: z.string().uuid().optional(),
  }),
  participationStatus: ParticipationStatusSchema,
  participantNotes: z.string().nullable().optional(),
  participantTags: z.array(z.string()).optional().default([]),
});

export const UsageEventSchema = z.object({
  appPackageName: z.string().min(1),
  interactionType: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  users: z.array(z.string()).min(1),
});

export type Study = z.infer<typeof StudySchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type UsageEvent = z.infer<typeof UsageEventSchema>;
// Single source: the canonical union lives in the generated contract module.
// ParticipationStatusSchema (z.enum over the same generated tuple) infers an
// identical type, so this re-export keeps exactly one exported ParticipationStatus.
export type { ParticipationStatus } from '@/generated/chronicle-contracts';
