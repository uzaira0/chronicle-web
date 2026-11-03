import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { STUDY_FEATURES } from '@/generated/chronicle-contracts';
import type { StudyFormData } from '@/lib/study-form-model';
import { moduleDraftsWith } from '@/test/module-drafts';

import exactDayLimits from '../test/golden/exact-day-study-limits.json';
import { buildStudyLimits, buildStudyPayload, daysToStudyDuration, studyDurationToDays } from './study-form-helpers';

const MAX_TEST_DURATION_DAYS = Math.max(...exactDayLimits.map(({ duration }) => duration.days));

const formArb: fc.Arbitrary<StudyFormData> = fc.record({
  modules: fc.constant(moduleDraftsWith()),
  contact: fc.string({ maxLength: 50 }),
  dataRetentionDays: fc.oneof(fc.constant(''), fc.nat({ max: 10000 }).map(String)),
  description: fc.string({ maxLength: 100 }),
  features: fc.subarray([...STUDY_FEATURES]),
  group: fc.string({ maxLength: 50 }),
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

  it('resends an untouched calendar duration as stored and converts only edited day fields', () => {
    const [sample] = fc.sample(formArb, 1);
    if (!sample) throw new Error('form arbitrary produced no sample');
    const year = { years: 1, months: 0, days: 0 };
    const quarter = { years: 0, months: 3, days: 0 };
    const loadedLimits = {
      studyDurationDays: '365',
      dataRetentionDays: '90',
      studyDuration: year,
      dataRetentionDuration: quarter,
    };
    const untouched = {
      ...sample,
      studyDurationDays: '365',
      dataRetentionDays: '90',
      loadedLimits,
    };
    expect(buildStudyLimits(untouched)).toEqual({
      studyDuration: year,
      dataRetentionDuration: quarter,
    });
    const edited = { ...untouched, studyDurationDays: '400' };
    expect(buildStudyLimits(edited)?.studyDuration).toEqual({ years: 0, months: 0, days: 400 });
  });

  it('buildStudyLimits returns a plain object (never throws)', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const result = buildStudyLimits(form);
        expect(typeof result).toBe('object');
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

  it('buildStudyLimits sends an empty body when all limit fields are empty strings', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const emptyForm = { ...form, studyDurationDays: '', dataRetentionDays: '' };
        expect(buildStudyLimits(emptyForm)).toEqual({});
      }),
    );
  });

  it('buildStudyLimits sends an empty body when all limit fields are 0', () => {
    fc.assert(
      fc.property(formArb, (form) => {
        const zeroForm = { ...form, studyDurationDays: '0', dataRetentionDays: '0' };
        expect(buildStudyLimits(zeroForm)).toEqual({});
      }),
    );
  });

  it('buildStudyLimits studyDuration is a valid duration object when present', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (days) => {
        const form = {
          modules: moduleDraftsWith(),
          contact: '',
          dataRetentionDays: '',
          description: '',
          features: [] as string[],
          group: '',
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
      }),
    );
  });
});
