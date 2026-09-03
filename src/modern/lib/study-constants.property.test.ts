import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { ANDROID_SENSOR_TYPES, STUDY_FEATURES, type StudyModule } from './study-constants';

// ---------------------------------------------------------------------------
// STUDY_FEATURES structural properties
// ---------------------------------------------------------------------------

describe('STUDY_FEATURES properties', () => {
  it('every entry has a non-empty label and a non-empty value', () => {
    for (const feature of STUDY_FEATURES) {
      expect(feature.label.length).toBeGreaterThan(0);
      expect(feature.value.length).toBeGreaterThan(0);
    }
  });

  it('all values are unique', () => {
    const values = STUDY_FEATURES.map((f) => f.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all labels are unique', () => {
    const labels = STUDY_FEATURES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('values are UPPER_SNAKE_CASE', () => {
    for (const feature of STUDY_FEATURES) {
      expect(feature.value).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('random lookup by value always finds the matching entry', () => {
    const moduleArb = fc.constantFrom(...STUDY_FEATURES.map((f) => f.value));
    fc.assert(
      fc.property(moduleArb, (value) => {
        const found = STUDY_FEATURES.find((f) => f.value === value);
        expect(found).toBeDefined();
        expect(found?.value).toBe(value);
      }),
    );
  });

  it('random lookup by non-existent value returns undefined', () => {
    const existingValues = new Set(STUDY_FEATURES.map((f) => f.value));
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !existingValues.has(s as StudyModule)),
        (value) => {
          const found = STUDY_FEATURES.find((f) => f.value === value);
          expect(found).toBeUndefined();
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// ANDROID_SENSOR_TYPES structural properties
// ---------------------------------------------------------------------------

describe('ANDROID_SENSOR_TYPES properties', () => {
  it('every entry has a non-empty label and a non-empty value', () => {
    for (const sensor of ANDROID_SENSOR_TYPES) {
      expect(sensor.label.length).toBeGreaterThan(0);
      expect(sensor.value.length).toBeGreaterThan(0);
    }
  });

  it('all values are unique', () => {
    const values = ANDROID_SENSOR_TYPES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all labels are unique', () => {
    const labels = ANDROID_SENSOR_TYPES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('values are camelCase (start with lowercase letter)', () => {
    for (const sensor of ANDROID_SENSOR_TYPES) {
      expect(sensor.value).toMatch(/^[a-z][a-zA-Z]*$/);
    }
  });

  it('random lookup by value always finds the matching entry', () => {
    const sensorArb = fc.constantFrom(...ANDROID_SENSOR_TYPES.map((s) => s.value));
    fc.assert(
      fc.property(sensorArb, (value) => {
        const found = ANDROID_SENSOR_TYPES.find((s) => s.value === value);
        expect(found).toBeDefined();
        expect(found?.value).toBe(value);
      }),
    );
  });
});
