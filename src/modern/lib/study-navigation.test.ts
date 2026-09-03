import { describe, expect, test } from 'bun:test';

import {
  PARTIAL_STUDY_CONFIGURATION_ERROR,
  studyConfigurationNavigationState,
  studyNavigationActionError,
} from './study-navigation';

describe('study creation navigation state', () => {
  test('omits an error when every post-create write succeeds', () => {
    expect(
      studyConfigurationNavigationState([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
      ]),
    ).toBeUndefined();
  });

  test('surfaces partial configuration after the durable study create succeeds', () => {
    const state = studyConfigurationNavigationState([
      { status: 'fulfilled', value: undefined },
      { status: 'rejected', reason: new Error('limits failed') },
    ]);

    expect(state).toEqual({ actionError: PARTIAL_STUDY_CONFIGURATION_ERROR });
    expect(studyNavigationActionError(state)).toBe(PARTIAL_STUDY_CONFIGURATION_ERROR);
  });

  test('ignores malformed navigation state', () => {
    expect(studyNavigationActionError(null)).toBeNull();
    expect(studyNavigationActionError({})).toBeNull();
    expect(studyNavigationActionError({ actionError: '' })).toBeNull();
    expect(studyNavigationActionError({ actionError: 1 })).toBeNull();
  });
});
