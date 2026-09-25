import { describe, expect, test } from 'bun:test';

import {
  PARTIAL_STUDY_CONFIGURATION_ERROR,
  saveStep,
  settingWrites,
  studyConfigurationNavigationState,
  studyNavigationActionError,
  studyNavigationFailedSteps,
  writeSettingsInOrder,
} from './study-navigation';

describe('settingWrites', () => {
  test('keeps write order and skips settings the form does not produce', () => {
    expect(
      settingWrites({ DataCollection: { a: 1 }, Sensor: null, ParticipantPolicy: { p: 1 }, AndroidSensor: undefined }),
    ).toEqual([
      { setting: { p: 1 }, settingType: 'ParticipantPolicy' },
      { setting: { a: 1 }, settingType: 'DataCollection' },
    ]);
  });
});

describe('writeSettingsInOrder', () => {
  const writes = [
    { settingType: 'ParticipantPolicy' },
    { settingType: 'AndroidSensor' },
    { settingType: 'Sensor' },
    { settingType: 'DataCollection' },
  ] as const;

  test('continues past an ordinary failure and names the step that did not save', async () => {
    const attempted: string[] = [];
    const locked = new Error('locked');
    const result = await writeSettingsInOrder(writes, (w) => {
      attempted.push(w.settingType);
      return w.settingType === 'ParticipantPolicy' ? Promise.reject(locked) : Promise.resolve();
    });
    expect(attempted).toEqual(['ParticipantPolicy', 'AndroidSensor', 'Sensor', 'DataCollection']);
    expect(result.failures).toEqual([{ step: 'ParticipantPolicy', error: locked }]);
    expect(result.stopped).toBe(false);
  });

  test('a stopping failure ends the sequence and counts the unattempted steps as not saved', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 412 });
    const result = await writeSettingsInOrder(
      writes,
      (w) => (w.settingType === 'AndroidSensor' ? Promise.reject(conflict) : Promise.resolve()),
      (err) => err === conflict,
    );
    expect(result.failures.map((f) => f.step)).toEqual(['AndroidSensor', 'Sensor', 'DataCollection']);
    expect(result.stopped).toBe(true);
  });

  test('saveStep turns a rejection into a named failure', async () => {
    const boom = new Error('boom');
    expect(await saveStep('limits', Promise.reject(boom))).toEqual([{ step: 'limits', error: boom }]);
    expect(await saveStep('details', Promise.resolve())).toEqual([]);
    expect(await saveStep('limits', null)).toEqual([]);
  });
});

describe('study creation navigation state', () => {
  test('omits an error when every post-create write succeeds', () => {
    expect(studyConfigurationNavigationState([])).toBeUndefined();
  });

  test('surfaces partial configuration after the durable study create succeeds', () => {
    const state = studyConfigurationNavigationState(['Sensor', 'limits']);

    expect(state).toEqual({ actionError: PARTIAL_STUDY_CONFIGURATION_ERROR, failedSteps: ['Sensor', 'limits'] });
    expect(studyNavigationActionError(state)).toBe(PARTIAL_STUDY_CONFIGURATION_ERROR);
    expect(studyNavigationFailedSteps(state)).toEqual(['Sensor', 'limits']);
  });

  test('ignores malformed navigation state', () => {
    expect(studyNavigationActionError(null)).toBeNull();
    expect(studyNavigationActionError({})).toBeNull();
    expect(studyNavigationActionError({ actionError: '' })).toBeNull();
    expect(studyNavigationActionError({ actionError: 1 })).toBeNull();
    expect(studyNavigationFailedSteps({ failedSteps: ['limits', 'bogus', 3] })).toEqual(['limits']);
    expect(studyNavigationFailedSteps(null)).toEqual([]);
  });
});
