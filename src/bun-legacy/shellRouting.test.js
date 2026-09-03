import {
  describe,
  expect,
  it,
} from 'bun:test';

import {
  hasEnrollmentQuery,
  isModernShellRoute,
} from '../core/bootstrap/shellRouting';

describe('shellRouting helpers', () => {
  describe('hasEnrollmentQuery()', () => {
    it('returns true only when the enroll query parameter is present', () => {
      expect(hasEnrollmentQuery('?enroll=true')).toBe(true);
      expect(hasEnrollmentQuery('?foo=bar&enroll=1')).toBe(true);
      expect(hasEnrollmentQuery('?foo=bar')).toBe(false);
      expect(hasEnrollmentQuery('not a valid query%')).toBe(false);
    });
  });

  describe('isModernShellRoute()', () => {
    it('recognizes both direct and /chronicle-prefixed modern routes', () => {
      expect(isModernShellRoute('/dashboard')).toBe(true);
      expect(isModernShellRoute('/modern')).toBe(true);
      expect(isModernShellRoute('/modern/studies')).toBe(true);
      expect(isModernShellRoute('/studies')).toBe(true);
      expect(isModernShellRoute('/chronicle/dashboard')).toBe(true);
      expect(isModernShellRoute('/chronicle/modern')).toBe(true);
      expect(isModernShellRoute('/chronicle/modern/workbench')).toBe(true);
      expect(isModernShellRoute('/participant')).toBe(true);
      expect(isModernShellRoute('/chronicle/participant')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/participants')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/compliance')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/downloads')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/audit')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/settings-audit')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/questionnaires')).toBe(true);
      expect(isModernShellRoute('/questionnaire')).toBe(true);
      expect(isModernShellRoute('/chronicle/questionnaire')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/time-use-diary')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/questionnaires')).toBe(true);
      expect(isModernShellRoute('/chronicle/studies/test-study/time-use-diary')).toBe(true);
      expect(isModernShellRoute('/studies/test-study')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/participants')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/compliance')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/downloads')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/audit')).toBe(true);
      expect(isModernShellRoute('/studies/test-study/settings-audit')).toBe(true);
      expect(isModernShellRoute('/chronicle')).toBe(true);
      expect(isModernShellRoute('/participant-history')).toBe(false);
      expect(isModernShellRoute('/studies/1234/bad-subroute')).toBe(false);
      expect(isModernShellRoute('/chronicle/studies/1234/bad-subroute')).toBe(false);
    });
  });
});
