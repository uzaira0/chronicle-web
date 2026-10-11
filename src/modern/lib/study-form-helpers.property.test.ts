import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import exactDayLimits from '../test/golden/exact-day-study-limits.json';
import {
  buildSensorSetting,
  buildStudyLimits,
  buildStudyPayload,
  daysToStudyDuration,
  studyDurationToDays,
} from './study-form-helpers';

const MAX_TEST_DURATION_DAYS = Math.max(...exactDayLimits.map(({ duration }) => duration.days));

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

const formArb: fc.Arbitrary<StudyFormData> = fc.record({
  contact: fc.string({ maxLength: 50 }),
  dataRetentionDays: fc.oneof(fc.constant(''), fc.nat({ max: 10000 }).map(String)),
  description: fc.string({ maxLength: 100 }),
  dutyCycleActiveSeconds: fc.oneof(fc.constant(''), fc.nat({ max: 1000 }).map(String)),
  dutyCyclePeriodSeconds: fc.oneof(fc.constant(''), fc.nat({ max: 1000 }).map(String)),
  features: fc.subarray([
    'ANDROID_SENSOR',
    'CHRONICLE_DATA_COLLECTION',
    'CHRONICLE_SURVEYS',
    'IOS_SENSOR',
    'TIME_USE_DIARY',
  ]),
  group: fc.string({ maxLength: 50 }),
  notificationsEnabled: fc.boolean(),
  participantLimit: fc.oneof(fc.constant(''), fc.nat({ max: 10000 }).map(String)),
  samplingRateHz: fc.oneof(fc.constant(''), fc.nat({ max: 1000 }).map(String)),
  selectedSensors: fc.subarray(['accelerometer', 'gyroscope', 'magnetometer', 'gravity', 'linearAcceleration']),
  studyDurationDays: fc.oneof(fc.constant(''), fc.nat({ max: 10000 }).map(String)),
  title: fc.string({ maxLength: 100 }),
  version: fc.string({ maxLength: 20 }),
});

const durationArb = fc.record({
  years: fc.nat(100),
  months: fc.nat(11),
  days: fc.nat(29),
});

describe('study-form-helpers properties', () => {
  it.each(exactDayLimits)('sends server-validated exact day limits from $start', ({ duration }) => {
    const [sample] = fc.sample(formArb, 1);
    if (!sample) throw new Error('form arbitrary produced no sample');
    const form = { ...sample, studyDurationDays: String(duration.days), dataRetentionDays: String(duration.days) };
    const limits = buildStudyLimits(form);
    if (!limits) throw new Error('exact day limits must build');
    expect(limits.studyDuration).toEqual(duration);
    expect(limits.dataRetentionDuration).toEqual(duration);
  });
  // Existing tests
  it('daysToStudyDuration produces non-negative components', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        const { years, months, days } = daysToStudyDuration(totalDays);
        expect(years).toBeGreaterThanOrEqual(0);
        expect(months).toBeGreaterThanOrEqual(0);
        expect(days).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('daysToStudyDuration preserves exact days without calendar components', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        const { months, days } = daysToStudyDuration(totalDays);
        expect(days).toBe(totalDays);
        expect(months).toBe(0);
      }),
    );
  });

  it('round-trips: studyDurationToDays(daysToStudyDuration(n)) === n', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        expect(studyDurationToDays(daysToStudyDuration(totalDays))).toBe(totalDays);
      }),
    );
  });

  it('buildSensorSetting never produces NaN in numeric fields', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildSensorSetting(form);
        if (result) {
          expect(Number.isNaN(result.samplingRateHz)).toBe(false);
          expect(Number.isNaN(result.dutyCycleActiveSeconds)).toBe(false);
          expect(Number.isNaN(result.dutyCyclePeriodSeconds)).toBe(false);
        }
      }),
    );
  });

  it('resends an untouched calendar duration as stored and converts only edited day fields', () => {
    const [sample] = fc.sample(formArb, 1);
    if (!sample) throw new Error('form arbitrary produced no sample');
    const year = { years: 1, months: 0, days: 0 };
    const quarter = { years: 0, months: 3, days: 0 };
    const loadedLimits = {
      participantLimit: '10',
      studyDurationDays: '365',
      dataRetentionDays: '90',
      studyDuration: year,
      dataRetentionDuration: quarter,
    };
    const untouched = {
      ...sample,
      participantLimit: '12',
      studyDurationDays: '365',
      dataRetentionDays: '90',
      loadedLimits,
    };
    expect(buildStudyLimits(untouched)).toEqual({
      participantLimit: 12,
      studyDuration: year,
      dataRetentionDuration: quarter,
    });
    const edited = { ...untouched, studyDurationDays: '400' };
    expect(buildStudyLimits(edited)?.studyDuration).toEqual({ years: 0, months: 0, days: 400 });
  });

  it('buildStudyLimits returns null or a plain object (never throws)', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyLimits(form);
        expect(result === null || typeof result === 'object').toBe(true);
      }),
    );
  });

  it('buildStudyLimits never produces NaN in participantLimit', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyLimits(form);
        if (result && 'participantLimit' in result) {
          expect(Number.isNaN(result.participantLimit)).toBe(false);
        }
      }),
    );
  });

  // --- New properties ---

  it('studyDurationToDays is always >= 0 for non-negative inputs', () => {
    fc.assert(
      fc.property(durationArb, (duration) => {
        expect(studyDurationToDays(duration)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('studyDurationToDays({0,0,0}) is always 0', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(studyDurationToDays({ years: 0, months: 0, days: 0 })).toBe(0);
      }),
    );
  });

  it('daysToStudyDuration always returns non-negative years', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        expect(daysToStudyDuration(totalDays).years).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('daysToStudyDuration never adds calendar months', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        expect(daysToStudyDuration(totalDays).months).toBe(0);
      }),
    );
  });

  it('daysToStudyDuration retains all input days', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        expect(daysToStudyDuration(totalDays).days).toBe(totalDays);
      }),
    );
  });

  it('studyDurationToDays is monotonic in years', () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(50), fc.nat(11), fc.nat(29), (y1, y2, m, d) => {
        const small = Math.min(y1, y2);
        const large = Math.max(y1, y2);
        expect(studyDurationToDays({ years: small, months: m, days: d })).toBeLessThanOrEqual(
          studyDurationToDays({ years: large, months: m, days: d }),
        );
      }),
    );
  });

  it('studyDurationToDays is monotonic in months', () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(11), fc.nat(11), fc.nat(29), (y, m1, m2, d) => {
        const small = Math.min(m1, m2);
        const large = Math.max(m1, m2);
        expect(studyDurationToDays({ years: y, months: small, days: d })).toBeLessThanOrEqual(
          studyDurationToDays({ years: y, months: large, days: d }),
        );
      }),
    );
  });

  it('studyDurationToDays is monotonic in days', () => {
    fc.assert(
      fc.property(fc.nat(50), fc.nat(11), fc.nat(29), fc.nat(29), (y, m, d1, d2) => {
        const small = Math.min(d1, d2);
        const large = Math.max(d1, d2);
        expect(studyDurationToDays({ years: y, months: m, days: small })).toBeLessThanOrEqual(
          studyDurationToDays({ years: y, months: m, days: large }),
        );
      }),
    );
  });

  it('studyDurationToDays(1 year) is 365', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(studyDurationToDays({ years: 1, months: 0, days: 0 })).toBe(365);
      }),
    );
  });

  it('studyDurationToDays(1 month) is 30', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(studyDurationToDays({ years: 0, months: 1, days: 0 })).toBe(30);
      }),
    );
  });

  it('studyDurationToDays(1 day) is 1', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(studyDurationToDays({ years: 0, months: 0, days: 1 })).toBe(1);
      }),
    );
  });

  it('daysToStudyDuration is deterministic', () => {
    fc.assert(
      fc.property(fc.nat(MAX_TEST_DURATION_DAYS), (totalDays) => {
        const a = daysToStudyDuration(totalDays);
        const b = daysToStudyDuration(totalDays);
        expect(a).toEqual(b);
      }),
    );
  });

  it('studyDurationToDays is deterministic', () => {
    fc.assert(
      fc.property(durationArb, (duration) => {
        expect(studyDurationToDays(duration)).toBe(studyDurationToDays(duration));
      }),
    );
  });

  it('buildStudyPayload always trims the title', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.title).toBe(form.title.trim());
      }),
    );
  });

  it('buildStudyPayload always trims the contact', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.contact).toBe(form.contact.trim());
      }),
    );
  });

  it('buildStudyPayload always trims the description', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.description).toBe(form.description.trim());
      }),
    );
  });

  it('buildStudyPayload always trims the group', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.group).toBe(form.group.trim());
      }),
    );
  });

  it('buildStudyPayload always trims the version', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.version).toBe(form.version.trim());
      }),
    );
  });

  it('buildStudyPayload modules keys match features array exactly', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        const keys = Object.keys(result.modules).sort();
        const features = [...form.features].sort();
        expect(keys).toEqual(features);
      }),
    );
  });

  it('buildStudyPayload notificationsEnabled matches input', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect(result.notificationsEnabled).toBe(form.notificationsEnabled);
      }),
    );
  });

  it('buildStudyPayload modules values are all empty objects', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        for (const value of Object.values(result.modules)) {
          expect(Object.keys(value).length).toBe(0);
        }
      }),
    );
  });

  it('buildSensorSetting returns null when features does not include ANDROID_SENSOR', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const noSensorForm = { ...form, features: form.features.filter((f) => f !== 'ANDROID_SENSOR') };
        expect(buildSensorSetting(noSensorForm)).toBeNull();
      }),
    );
  });

  it('buildSensorSetting returns null when selectedSensors is empty', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const emptySensors = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: [] };
        expect(buildSensorSetting(emptySensors)).toBeNull();
      }),
    );
  });

  it('buildSensorSetting samplingRateHz is always a positive integer when result is non-null', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const sensorForm = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: ['accelerometer'] };
        const result = buildSensorSetting(sensorForm);
        if (result) {
          expect(result.samplingRateHz).toBeGreaterThan(0);
          expect(Number.isInteger(result.samplingRateHz)).toBe(true);
        }
      }),
    );
  });

  it('buildSensorSetting dutyCycleActiveSeconds is always a nonnegative integer when non-null', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const sensorForm = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: ['accelerometer'] };
        const result = buildSensorSetting(sensorForm);
        if (result) {
          expect(result.dutyCycleActiveSeconds).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(result.dutyCycleActiveSeconds)).toBe(true);
        }
      }),
    );
  });

  it('buildSensorSetting dutyCyclePeriodSeconds is always a positive integer when non-null', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const sensorForm = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: ['accelerometer'] };
        const result = buildSensorSetting(sensorForm);
        if (result) {
          expect(result.dutyCyclePeriodSeconds).toBeGreaterThan(0);
          expect(Number.isInteger(result.dutyCyclePeriodSeconds)).toBe(true);
        }
      }),
    );
  });

  it('buildSensorSetting always includes @class when non-null', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const sensorForm = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: ['accelerometer'] };
        const result = buildSensorSetting(sensorForm);
        if (result) {
          expect(result['@class']).toBe('com.openlattice.chronicle.android.AndroidSensorSetting');
        }
      }),
    );
  });

  it('buildSensorSetting sensors matches selectedSensors', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const sensors = form.selectedSensors.length > 0 ? form.selectedSensors : ['accelerometer'];
        const sensorForm = { ...form, features: ['ANDROID_SENSOR'], selectedSensors: sensors };
        const result = buildSensorSetting(sensorForm);
        if (result) {
          expect(result.sensors).toEqual(sensors);
        }
      }),
    );
  });

  it('buildStudyLimits returns null when all numeric fields are empty strings', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const emptyForm = { ...form, participantLimit: '', studyDurationDays: '', dataRetentionDays: '' };
        expect(buildStudyLimits(emptyForm)).toBeNull();
      }),
    );
  });

  it('buildStudyLimits returns null when all numeric fields are 0', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const zeroForm = { ...form, participantLimit: '0', studyDurationDays: '0', dataRetentionDays: '0' };
        expect(buildStudyLimits(zeroForm)).toBeNull();
      }),
    );
  });

  it('when buildStudyLimits returns non-null, it has at least one field', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyLimits(form);
        if (result !== null) {
          expect(Object.keys(result).length).toBeGreaterThanOrEqual(1);
        }
      }),
    );
  });

  it('buildStudyLimits participantLimit is always a positive integer when present', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (limit) => {
        const form = {
          contact: '',
          dataRetentionDays: '',
          description: '',
          dutyCycleActiveSeconds: '',
          dutyCyclePeriodSeconds: '',
          features: [] as string[],
          group: '',
          notificationsEnabled: false,
          participantLimit: String(limit),
          samplingRateHz: '',
          selectedSensors: [] as string[],
          studyDurationDays: '',
          title: '',
          version: '',
        };
        const result = buildStudyLimits(form);
        expect(result).not.toBeNull();
        if (result && 'participantLimit' in result) {
          expect(result.participantLimit).toBeGreaterThan(0);
          expect(Number.isInteger(result.participantLimit)).toBe(true);
        }
      }),
    );
  });

  it('buildStudyLimits studyDuration is a valid duration object when present', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (days) => {
        const form = {
          contact: '',
          dataRetentionDays: '',
          description: '',
          dutyCycleActiveSeconds: '',
          dutyCyclePeriodSeconds: '',
          features: [] as string[],
          group: '',
          notificationsEnabled: false,
          participantLimit: '',
          samplingRateHz: '',
          selectedSensors: [] as string[],
          studyDurationDays: String(days),
          title: '',
          version: '',
        };
        const result = buildStudyLimits(form);
        expect(result).not.toBeNull();
        if (result && 'studyDuration' in result) {
          const dur = result.studyDuration as { years: number; months: number; days: number };
          expect(dur.years).toBeGreaterThanOrEqual(0);
          expect(dur.months).toBeGreaterThanOrEqual(0);
          expect(dur.days).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });

  it('buildStudyPayload is deterministic', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const a = buildStudyPayload(form);
        const b = buildStudyPayload(form);
        expect(a).toEqual(b);
      }),
    );
  });

  it('buildStudyPayload result always has all required keys', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyPayload(form);
        expect('title' in result).toBe(true);
        expect('contact' in result).toBe(true);
        expect('description' in result).toBe(true);
        expect('group' in result).toBe(true);
        expect('version' in result).toBe(true);
        expect('modules' in result).toBe(true);
        expect('notificationsEnabled' in result).toBe(true);
      }),
    );
  });
});
