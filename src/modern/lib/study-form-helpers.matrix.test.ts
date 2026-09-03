import { describe, expect, it } from 'bun:test';
import {
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
  daysToStudyDuration,
  studyDurationToDays,
} from './study-form-helpers';

type StudyFormData = {
  contact: string;
  dataRetentionDays: string;
  description: string;
  dutyCycleActiveSeconds: string;
  dutyCyclePeriodSeconds: string;
  features: string[];
  group: string;
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
    contact: 'admin@example.com',
    dataRetentionDays: '',
    description: 'A study',
    dutyCycleActiveSeconds: '30',
    dutyCyclePeriodSeconds: '300',
    features: [],
    group: 'neuro',
    notificationsEnabled: false,
    participantLimit: '',
    samplingRateHz: '5',
    selectedSensors: [],
    studyDurationDays: '',
    title: 'My Study',
    version: '1.0',
    ...overrides,
  };
}

// ─── studyDurationToDays: exhaustive input matrix ────────────
// 7 x 4 x 7 = 196 tests
describe('studyDurationToDays — exhaustive matrix', () => {
  const yearValues = [0, 1, 2, 5, 10, 50, 100];
  const monthValues = [0, 1, 6, 11];
  const dayValues = [0, 1, 15, 29, 30, 364, 365];

  for (const years of yearValues) {
    for (const months of monthValues) {
      for (const days of dayValues) {
        const expected = years * 365 + months * 30 + days;
        it(`({years:${years}, months:${months}, days:${days}}) = ${expected}`, () => {
          expect(studyDurationToDays({ years, months, days })).toBe(expected);
        });
      }
    }
  }
});

// ─── daysToStudyDuration round-trip invariant ────────────────
// 151 tests (0 to 1500 stepping by 10)
describe('daysToStudyDuration — round-trip for 0..1500 step 10', () => {
  for (let totalDays = 0; totalDays <= 1500; totalDays += 10) {
    it(`days=${totalDays}: round-trips correctly`, () => {
      const duration = daysToStudyDuration(totalDays);
      expect(duration.years).toBeGreaterThanOrEqual(0);
      expect(duration.months).toBeGreaterThanOrEqual(0);
      expect(duration.months).toBeLessThan(13);
      expect(duration.days).toBeGreaterThanOrEqual(0);
      expect(duration.days).toBeLessThan(30);
      expect(studyDurationToDays(duration)).toBe(totalDays);
    });
  }
});

// ─── buildSensorSetting feature x sensor combinations ────────
// 6 x 5 = 30 tests
describe('buildSensorSetting — feature x sensor matrix', () => {
  const featureSets: string[][] = [
    [],
    ['ANDROID_SENSOR'],
    ['TIME_USE_DIARY'],
    ['ANDROID_SENSOR', 'TIME_USE_DIARY'],
    ['CHRONICLE_DATA_COLLECTION'],
    ['ANDROID_SENSOR', 'CHRONICLE_DATA_COLLECTION'],
  ];
  const sensorSets: string[][] = [
    [],
    ['accelerometer'],
    ['accelerometer', 'gyroscope'],
    ['accelerometer', 'gyroscope', 'magnetometer'],
    ['light', 'proximity'],
  ];

  for (const features of featureSets) {
    for (const selectedSensors of sensorSets) {
      const hasAndroid = features.includes('ANDROID_SENSOR');
      const hasSensors = selectedSensors.length > 0;
      const expectNull = !hasAndroid || !hasSensors;

      it(`features=[${features.join(',')}] sensors=[${selectedSensors.join(',')}] -> ${expectNull ? 'null' : 'setting'}`, () => {
        const result = buildSensorSetting(makeForm({ features, selectedSensors }));
        if (expectNull) {
          expect(result).toBeNull();
        } else {
          expect(result).not.toBeNull();
          expect(result?.sensors).toEqual(selectedSensors);
          expect(result?.['@class']).toBe('com.openlattice.chronicle.android.AndroidSensorSetting');
        }
      });
    }
  }
});

// ─── buildSensorSetting — samplingRate x dutyCycleActive x dutyCyclePeriod parsing ─
// 4 x 4 x 4 = 64 tests
describe('buildSensorSetting — numeric string parsing matrix', () => {
  const rateValues = ['', '0', '5', '100'];
  const activeValues = ['', '0', '30', '60'];
  const periodValues = ['', '0', '300', '600'];

  for (const samplingRateHz of rateValues) {
    for (const dutyCycleActiveSeconds of activeValues) {
      for (const dutyCyclePeriodSeconds of periodValues) {
        it(`rate="${samplingRateHz}" active="${dutyCycleActiveSeconds}" period="${dutyCyclePeriodSeconds}"`, () => {
          const result = buildSensorSetting(
            makeForm({
              features: ['ANDROID_SENSOR'],
              selectedSensors: ['accelerometer'],
              samplingRateHz,
              dutyCycleActiveSeconds,
              dutyCyclePeriodSeconds,
            }),
          );
          expect(result).not.toBeNull();
          // Empty/0 strings should fall back to defaults
          const expectedRate = parseInt(samplingRateHz, 10) || 5;
          const expectedActive = parseInt(dutyCycleActiveSeconds, 10) || 30;
          const expectedPeriod = parseInt(dutyCyclePeriodSeconds, 10) || 300;
          expect(result?.samplingRateHz).toBe(expectedRate);
          expect(result?.dutyCycleActiveSeconds).toBe(expectedActive);
          expect(result?.dutyCyclePeriodSeconds).toBe(expectedPeriod);
        });
      }
    }
  }
});

// ─── buildStudyLimits — participantLimit x studyDurationDays x dataRetentionDays ─
// 8 x 6 x 6 = 288 tests  (we'll use a subset: 10 x 7 x 1 + 13 x 8 = pick a good combo)
// Actually let's do 13 x 8 = 104 for participantLimit x studyDurationDays, then add dataRetention
describe('buildStudyLimits — participantLimit x studyDurationDays matrix', () => {
  const limitValues = ['', '0', '-1', '1', '10', '25', '100', '999', 'abc', '3.5', ' 50 ', 'NaN', 'Infinity'];
  const durationValues = ['', '0', '1', '30', '90', '365', '730', 'abc'];
  const expectLimitAndDuration = (participantLimit: string, studyDurationDays: string) => {
    const result = buildStudyLimits(makeForm({ participantLimit, studyDurationDays }));
    const pLimit = parseInt(participantLimit, 10);
    const sDays = parseInt(studyDurationDays, 10);

    if (!(pLimit > 0) && !(sDays > 0)) {
      expect(result).toBeNull();
      return;
    }

    expect(result).not.toBeNull();
    if (pLimit > 0) expect(result?.participantLimit).toBe(pLimit);
    if (sDays > 0) {
      expect(result?.studyDuration).toBeDefined();
      const dur = result?.studyDuration as { days: number; months: number; years: number };
      expect(studyDurationToDays(dur)).toBe(sDays);
    }
  };

  for (const participantLimit of limitValues) {
    for (const studyDurationDays of durationValues) {
      it(`participantLimit="${participantLimit}" studyDurationDays="${studyDurationDays}"`, () => {
        expectLimitAndDuration(participantLimit, studyDurationDays);
      });
    }
  }
});

// ─── buildStudyLimits — dataRetentionDays matrix ─────────────
// 10 tests
describe('buildStudyLimits — dataRetentionDays values', () => {
  const retentionValues = ['', '0', '1', '30', '90', '180', '365', '730', 'abc', '-5'];

  for (const dataRetentionDays of retentionValues) {
    it(`dataRetentionDays="${dataRetentionDays}"`, () => {
      const result = buildStudyLimits(makeForm({ dataRetentionDays }));
      const rDays = parseInt(dataRetentionDays, 10);
      if (!(rDays > 0)) {
        expect(result).toBeNull();
      } else {
        expect(result).not.toBeNull();
        expect(result?.dataRetentionDuration).toBeDefined();
        const dur = result?.dataRetentionDuration as { years: number; months: number; days: number };
        expect(studyDurationToDays(dur)).toBe(rDays);
      }
    });
  }
});

// ─── buildStudyPayload — title/contact whitespace trimming ───
// 5 x 5 = 25 tests
describe('buildStudyPayload — whitespace trimming matrix', () => {
  const titleVariants = ['Study', ' Study', 'Study ', '  Study  ', '   '];
  const contactVariants = ['a@b.com', ' a@b.com', 'a@b.com ', '  a@b.com  ', '   '];

  for (const title of titleVariants) {
    for (const contact of contactVariants) {
      it(`title="${title}" contact="${contact}"`, () => {
        const result = buildStudyPayload(makeForm({ title, contact }));
        expect(result.title).toBe(title.trim());
        expect(result.contact).toBe(contact.trim());
      });
    }
  }
});

// ─── buildStudyPayload — features -> modules mapping ─────────
// 8 tests
describe('buildStudyPayload — features to modules mapping', () => {
  const featureSets: string[][] = [
    [],
    ['ANDROID_SENSOR'],
    ['TIME_USE_DIARY'],
    ['CHRONICLE_DATA_COLLECTION'],
    ['ANDROID_SENSOR', 'TIME_USE_DIARY'],
    ['ANDROID_SENSOR', 'CHRONICLE_DATA_COLLECTION'],
    ['TIME_USE_DIARY', 'CHRONICLE_DATA_COLLECTION'],
    ['ANDROID_SENSOR', 'TIME_USE_DIARY', 'CHRONICLE_DATA_COLLECTION'],
  ];

  for (const features of featureSets) {
    it(`features=[${features.join(',')}] creates matching module keys`, () => {
      const result = buildStudyPayload(makeForm({ features }));
      expect(Object.keys(result.modules).sort()).toEqual([...features].sort());
      for (const key of features) {
        expect(result.modules[key]).toEqual({});
      }
    });
  }
});

// ─── buildStudyPayload — notificationsEnabled boolean ────────
// 2 tests
describe('buildStudyPayload — notificationsEnabled', () => {
  for (const notificationsEnabled of [true, false]) {
    it(`notificationsEnabled=${notificationsEnabled}`, () => {
      const result = buildStudyPayload(makeForm({ notificationsEnabled }));
      expect(result.notificationsEnabled).toBe(notificationsEnabled);
    });
  }
});
