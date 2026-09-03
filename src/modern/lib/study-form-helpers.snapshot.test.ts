import { describe, expect, it } from 'bun:test';
import {
  buildDataCollectionSetting,
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
  daysToStudyDuration,
} from './study-form-helpers';

type StudyFormData = {
  contact: string;
  dataRetentionDays: string;
  description: string;
  dutyCycleActiveSeconds: string;
  dutyCyclePeriodSeconds: string;
  features: string[];
  group: string;
  moduleSettings?: Record<string, boolean>;
  moduleIntervalSeconds?: Record<string, string>;
  notificationsEnabled: boolean;
  participantLimit: string;
  samplingRateHz: string;
  selectedSensors: string[];
  studyDurationDays: string;
  title: string;
  version: string;
};

function makeForm(overrides: Partial<StudyFormData> = {}): StudyFormData {
  return {
    contact: ' admin@test.com ',
    dataRetentionDays: '',
    description: ' Study description ',
    dutyCycleActiveSeconds: '30',
    dutyCyclePeriodSeconds: '300',
    features: [],
    group: ' neuro ',
    notificationsEnabled: false,
    participantLimit: '',
    samplingRateHz: '5',
    selectedSensors: [],
    studyDurationDays: '',
    title: ' My Study ',
    version: ' 1.0 ',
    ...overrides,
  };
}

describe('study form helper snapshots', () => {
  describe('buildStudyPayload', () => {
    it('minimal', () => {
      expect(buildStudyPayload(makeForm())).toMatchSnapshot();
    });
    it('with features', () => {
      expect(
        buildStudyPayload(
          makeForm({
            features: ['ANDROID_SENSOR', 'TIME_USE_DIARY', 'CHRONICLE_SURVEYS'],
          }),
        ),
      ).toMatchSnapshot();
    });
    it('trims whitespace from all string fields', () => {
      expect(
        buildStudyPayload(
          makeForm({
            title: '  Padded Title  ',
            contact: '  user@example.com  ',
            description: '  Desc  ',
            group: '  Group  ',
            version: '  2.0  ',
          }),
        ),
      ).toMatchSnapshot();
    });
    it('notifications enabled', () => {
      expect(
        buildStudyPayload(
          makeForm({
            notificationsEnabled: true,
          }),
        ),
      ).toMatchSnapshot();
    });
  });

  describe('buildSensorSetting', () => {
    it('null when no android feature', () => {
      expect(buildSensorSetting(makeForm())).toMatchSnapshot();
    });
    it('null when android feature but no sensors selected', () => {
      expect(
        buildSensorSetting(
          makeForm({
            features: ['ANDROID_SENSOR'],
            selectedSensors: [],
          }),
        ),
      ).toMatchSnapshot();
    });
    it('with sensors', () => {
      expect(
        buildSensorSetting(
          makeForm({
            features: ['ANDROID_SENSOR'],
            selectedSensors: ['accelerometer', 'gyroscope'],
            samplingRateHz: '10',
            dutyCycleActiveSeconds: '60',
            dutyCyclePeriodSeconds: '600',
          }),
        ),
      ).toMatchSnapshot();
    });
    it('invalid numeric strings use defaults', () => {
      expect(
        buildSensorSetting(
          makeForm({
            features: ['ANDROID_SENSOR'],
            selectedSensors: ['accelerometer'],
            samplingRateHz: 'abc',
            dutyCycleActiveSeconds: '',
            dutyCyclePeriodSeconds: 'xyz',
          }),
        ),
      ).toMatchSnapshot();
    });
  });

  describe('buildStudyLimits', () => {
    it('null when all empty', () => {
      expect(buildStudyLimits(makeForm())).toMatchSnapshot();
    });
    it('all set', () => {
      expect(
        buildStudyLimits(
          makeForm({
            participantLimit: '100',
            studyDurationDays: '365',
            dataRetentionDays: '90',
          }),
        ),
      ).toMatchSnapshot();
    });
    it('only participantLimit', () => {
      expect(
        buildStudyLimits(
          makeForm({
            participantLimit: '50',
          }),
        ),
      ).toMatchSnapshot();
    });
    it('only studyDurationDays', () => {
      expect(
        buildStudyLimits(
          makeForm({
            studyDurationDays: '180',
          }),
        ),
      ).toMatchSnapshot();
    });
    it('zero values return null', () => {
      expect(
        buildStudyLimits(
          makeForm({
            participantLimit: '0',
            studyDurationDays: '0',
            dataRetentionDays: '0',
          }),
        ),
      ).toMatchSnapshot();
    });
  });

  describe('buildDataCollectionSetting module entry shapes', () => {
    it('interval-configurable enabled module emits collectionCadence (plain object, no @class)', () => {
      const result = buildDataCollectionSetting(
        makeForm({
          features: ['CHRONICLE_DATA_COLLECTION'],
          moduleSettings: { connectivity_state: true },
          moduleIntervalSeconds: { connectivity_state: '1800' },
        }),
      );
      expect(result?.modules?.connectivity_state).toMatchSnapshot();
    });
    it('interval-configurable enabled module defaults collectionCadence to 900', () => {
      const result = buildDataCollectionSetting(
        makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { device_settings: true } }),
      );
      expect(result?.modules?.device_settings).toMatchSnapshot();
    });
    it('non-interval enabled module omits collectionCadence', () => {
      const result = buildDataCollectionSetting(
        makeForm({ features: ['CHRONICLE_DATA_COLLECTION'], moduleSettings: { usage_events: true } }),
      );
      expect(result?.modules?.usage_events).toMatchSnapshot();
    });
  });

  describe('daysToStudyDuration', () => {
    it('0 days', () => {
      expect(daysToStudyDuration(0)).toMatchSnapshot();
    });
    it('440 days', () => {
      expect(daysToStudyDuration(440)).toMatchSnapshot();
    });
    it('365 days', () => {
      expect(daysToStudyDuration(365)).toMatchSnapshot();
    });
    it('1095 days', () => {
      expect(daysToStudyDuration(1095)).toMatchSnapshot();
    });
    it('30 days', () => {
      expect(daysToStudyDuration(30)).toMatchSnapshot();
    });
    it('1 day', () => {
      expect(daysToStudyDuration(1)).toMatchSnapshot();
    });
    it('730 days', () => {
      expect(daysToStudyDuration(730)).toMatchSnapshot();
    });
  });
});
