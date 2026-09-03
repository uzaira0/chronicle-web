import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { hasEnrollmentQuery, isModernShellRoute } from './shellRouting';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const studyIdSegment = fc.stringMatching(/^[a-zA-Z0-9_-]+$/, { minLength: 1, maxLength: 36 });

const modernPrefixedPathArb = fc.oneof(
  fc.constant('/modern'),
  fc.constant('/modern/'),
  fc.string({ minLength: 0, maxLength: 20 }).map((s) => `/modern/${s.replace(/[^a-zA-Z0-9/-]/g, '')}`),
  fc.constant('/chronicle/modern'),
  fc.constant('/chronicle/modern/'),
  fc.string({ minLength: 0, maxLength: 20 }).map((s) => `/chronicle/modern/${s.replace(/[^a-zA-Z0-9/-]/g, '')}`),
);

const directModernRouteArb = fc.oneof(
  fc.constant('/'),
  fc.constant('/login'),
  fc.constant('/chronicle/login'),
  fc.constant('/chronicle'),
  fc.constant('/chronicle/'),
  fc.constant('/dashboard'),
  fc.constant('/chronicle/dashboard'),
  fc.constant('/questionnaire'),
  fc.constant('/participant'),
  fc.constant('/studies'),
  fc.constant('/survey'),
  fc.constant('/time-use-diary'),
  fc.constant('/chronicle/questionnaire'),
  fc.constant('/chronicle/participant'),
  fc.constant('/chronicle/studies'),
  fc.constant('/chronicle/survey'),
  fc.constant('/chronicle/time-use-diary'),
  fc.constant('/privacy'),
  fc.constant('/withdrawal'),
  fc.constant('/chronicle/privacy'),
  fc.constant('/chronicle/withdrawal'),
  studyIdSegment.map((id) => `/studies/${id}`),
  studyIdSegment.map((id) => `/studies/${id}/questionnaires`),
  studyIdSegment.map((id) => `/studies/${id}/participants`),
  studyIdSegment.map((id) => `/studies/${id}/compliance`),
  studyIdSegment.map((id) => `/studies/${id}/downloads`),
  studyIdSegment.map((id) => `/studies/${id}/audit`),
  studyIdSegment.map((id) => `/studies/${id}/settings-audit`),
  studyIdSegment.map((id) => `/studies/${id}/time-use-diary`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/questionnaires`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/participants`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/compliance`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/downloads`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/audit`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/settings-audit`),
  studyIdSegment.map((id) => `/chronicle/studies/${id}/time-use-diary`),
);

const nonModernRouteArb = fc.constantFrom(
  '/legacy/something',
  '/api/v1/data',
  '/admin/users',
  '/settings/profile',
  '/other/random/path',
);

// ---------------------------------------------------------------------------
// isModernShellRoute properties
// ---------------------------------------------------------------------------

describe('isModernShellRoute properties', () => {
  it('accepts all direct Chronicle shell routes', () => {
    fc.assert(
      fc.property(directModernRouteArb, (path) => {
        expect(isModernShellRoute(path)).toBe(true);
      }),
    );
  });

  it('accepts all /modern-prefixed paths', () => {
    fc.assert(
      fc.property(modernPrefixedPathArb, (path) => {
        expect(isModernShellRoute(path)).toBe(true);
      }),
    );
  });

  it('rejects paths that are not modern routes', () => {
    fc.assert(
      fc.property(nonModernRouteArb, (path) => {
        expect(isModernShellRoute(path)).toBe(false);
      }),
    );
  });

  it('always returns a boolean', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof isModernShellRoute(input)).toBe('boolean');
      }),
    );
  });

  it('returns false for empty string', () => {
    expect(isModernShellRoute('')).toBe(false);
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(isModernShellRoute(input)).toBe(isModernShellRoute(input));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// hasEnrollmentQuery properties
// ---------------------------------------------------------------------------

describe('hasEnrollmentQuery properties', () => {
  it('returns true when "enroll" param has a truthy value', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('&') && !s.includes('=')),
        (value) => {
          expect(hasEnrollmentQuery(`?enroll=${encodeURIComponent(value)}`)).toBe(true);
        },
      ),
    );
  });

  it('returns false when "enroll" param is absent', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 30 })
          .filter((s) => !s.includes('enroll') && !s.includes('&') && !s.includes('=')),
        (key) => {
          expect(hasEnrollmentQuery(`?${key}=value`)).toBe(false);
        },
      ),
    );
  });

  it('returns false for empty string', () => {
    expect(hasEnrollmentQuery('')).toBe(false);
  });

  it('never throws for arbitrary string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        // Should not throw — returns boolean
        const result = hasEnrollmentQuery(input);
        expect(typeof result).toBe('boolean');
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(hasEnrollmentQuery(input)).toBe(hasEnrollmentQuery(input));
      }),
    );
  });
});
