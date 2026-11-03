import type { CollectionModuleId } from '@/lib/study-constants';
import { moduleDraftsFromSetting } from '@/lib/study-form-helpers';
import type { ModuleDraft, StudyFormData } from '@/lib/study-form-model';

type DraftOverride = Omit<Partial<ModuleDraft>, 'sensorPolicy' | 'interaction'> & {
  sensorPolicy?: Partial<NonNullable<ModuleDraft['sensorPolicy']>>;
  interaction?: Partial<NonNullable<ModuleDraft['interaction']>>;
};

export function moduleDraftsWith(
  overrides: Partial<Record<CollectionModuleId, DraftOverride>> = {},
): StudyFormData['modules'] {
  const modules = moduleDraftsFromSetting();
  for (const id of Object.keys(overrides) as CollectionModuleId[]) {
    const draft = modules[id];
    const update = overrides[id];
    modules[id] = {
      ...draft,
      ...update,
      ...(draft.sensorPolicy ? { sensorPolicy: { ...draft.sensorPolicy, ...update?.sensorPolicy } } : {}),
      ...(draft.interaction ? { interaction: { ...draft.interaction, ...update?.interaction } } : {}),
    } as ModuleDraft;
  }
  return modules;
}
