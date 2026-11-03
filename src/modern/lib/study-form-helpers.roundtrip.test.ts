import { expect, test } from 'bun:test';
import { ACTIVE_COLLECTION_MODULE_IDS } from '@/generated/chronicle-contracts';
import type { StudyFormData } from '@/lib/study-form-model';
import { COLLECTION_MODULES, INTERVAL_CONFIGURABLE_MODULES } from './study-constants';
import { buildDataCollectionSetting, moduleDraftsFromSetting } from './study-form-helpers';

test.each([...ACTIVE_COLLECTION_MODULE_IDS])('form -> payload -> form retains %s', (moduleId) => {
  const modules = moduleDraftsFromSetting();
  const descriptor = COLLECTION_MODULES.find(({ value }) => value === moduleId);
  if (!descriptor) throw new Error(`Missing module descriptor: ${moduleId}`);
  modules[moduleId] = {
    ...modules[moduleId],
    mode: descriptor.consentGated ? 'required' : 'optional',
    ...(INTERVAL_CONFIGURABLE_MODULES.has(moduleId) ? { intervalSeconds: '1800' } : {}),
    ...(descriptor.sensorType ? { sensorPolicy: { rateHz: '17', dutyActive: '0', dutyPeriod: '123' } } : {}),
    ...(modules[moduleId].interaction
      ? {
          interaction: {
            gridRows: '7',
            gridCols: '5',
            captureClicks: false,
            captureScrolls: false,
            captureElementPosition: false,
          },
        }
      : {}),
    ...(modules[moduleId].healthConnectRecordTypes ? { healthConnectRecordTypes: ['steps', 'future_metric'] } : {}),
  };
  const form = { features: ['CHRONICLE_DATA_COLLECTION'], modules } as StudyFormData;
  const payload = buildDataCollectionSetting(form);
  expect(Object.keys(payload.modules).sort()).toEqual([...ACTIVE_COLLECTION_MODULE_IDS].sort());
  expect(payload.modules[moduleId]).toMatchObject({ enabled: true, required: descriptor.consentGated });
  expect(moduleDraftsFromSetting(payload)[moduleId]).toEqual(modules[moduleId]);
});

test.each([...INTERVAL_CONFIGURABLE_MODULES])(
  'disabled %s retains its configured cadence through save and re-enable',
  (moduleId) => {
    const modules = moduleDraftsFromSetting();
    modules[moduleId] = { ...modules[moduleId], mode: 'disabled', intervalSeconds: '1800' };
    const form = { features: ['CHRONICLE_DATA_COLLECTION'], modules } as StudyFormData;
    const reloaded = moduleDraftsFromSetting(buildDataCollectionSetting(form));
    expect(reloaded[moduleId].intervalSeconds).toBe('1800');
    reloaded[moduleId].mode = 'optional';
    if (moduleId === 'health_connect') reloaded[moduleId].healthConnectRecordTypes = ['steps'];
    expect(buildDataCollectionSetting({ ...form, modules: reloaded }).modules[moduleId]?.collectionCadence).toEqual({
      intervalSeconds: 1800,
    });
  },
);
