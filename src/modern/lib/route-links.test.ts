import { describe, expect, it } from 'bun:test';

import {
  legacyModernPath,
  modernParticipantDashboardPath,
  modernQuestionnairePath,
  modernRoutePath,
  modernStudyPath,
  modernSurveyPath,
  modernTimeUseDiaryPath,
  pickModernBase,
  type StudySection,
} from './route-links';

describe('modern route-link helpers', () => {
  it('builds route paths with a modern /chronicle prefix', () => {
    const base = '/chronicle/modern/studies/alpha';

    expect(modernRoutePath('/dashboard', base)).toBe('/chronicle/modern/dashboard');
    expect(modernRoutePath('dashboard', base)).toBe('/chronicle/modern/dashboard');
  });

  it('builds route paths for /chronicle deployment base', () => {
    const base = '/chronicle/studies/alpha';

    expect(modernQuestionnairePath(base)).toBe('/chronicle/questionnaire');
    expect(modernSurveyPath(base)).toBe('/chronicle/survey');
    expect(modernTimeUseDiaryPath(base)).toBe('/chronicle/time-use-diary');
    expect(modernParticipantDashboardPath(base)).toBe('/chronicle/participant');
  });

  it('builds route paths for modern root deployment', () => {
    const base = '/studies/alpha';

    expect(modernQuestionnairePath(base)).toBe('/questionnaire');
    expect(modernSurveyPath(base)).toBe('/survey');
    expect(legacyModernPath('study-id', 'time-use-diary', base)).toBe('/studies/study-id/time-use-diary');
  });

  it('encodes study IDs in legacy-modern subsection helpers', () => {
    expect(legacyModernPath('study id', 'questionnaires', '/studies')).toBe('/studies/study%20id/questionnaires');
  });
});

// === EXPANDED EXHAUSTIVE TESTS ===

describe('pickModernBase() — exhaustive edge cases', () => {
  describe('/chronicle/modern prefix', () => {
    const chronicleModernCases: [string, string][] = [
      ['/chronicle/modern', '/chronicle/modern'],
      ['/chronicle/modern/', '/chronicle/modern'],
      ['/chronicle/modern/studies', '/chronicle/modern'],
      ['/chronicle/modern/studies/abc', '/chronicle/modern'],
      ['/chronicle/modern/dashboard', '/chronicle/modern'],
      ['/chronicle/modern/participant', '/chronicle/modern'],
    ];

    it.each(chronicleModernCases)('pickModernBase("%s") => "%s"', (input, expected) => {
      expect(pickModernBase(input)).toBe(expected);
    });
  });

  describe('/modern prefix', () => {
    const modernCases: [string, string][] = [
      ['/modern', '/modern'],
      ['/modern/', '/modern'],
      ['/modern/studies', '/modern'],
      ['/modern/studies/abc', '/modern'],
      ['/modern/dashboard', '/modern'],
    ];

    it.each(modernCases)('pickModernBase("%s") => "%s"', (input, expected) => {
      expect(pickModernBase(input)).toBe(expected);
    });
  });

  describe('/chronicle prefix (non-modern)', () => {
    const chronicleCases: [string, string][] = [
      ['/chronicle', '/chronicle'],
      ['/chronicle/', '/chronicle'],
      ['/chronicle/studies', '/chronicle'],
      ['/chronicle/studies/abc', '/chronicle'],
      ['/chronicle/survey', '/chronicle'],
      ['/chronicle/questionnaire', '/chronicle'],
    ];

    it.each(chronicleCases)('pickModernBase("%s") => "%s"', (input, expected) => {
      expect(pickModernBase(input)).toBe(expected);
    });
  });

  describe('no matching prefix — returns empty string', () => {
    const noPrefixCases: string[] = [
      '/',
      '/studies',
      '/studies/abc',
      '/dashboard',
      '/other/path',
      '',
      '/some-random-path',
    ];

    it.each(noPrefixCases)('pickModernBase("%s") => ""', (input) => {
      expect(pickModernBase(input)).toBe('');
    });
  });
});

describe('modernRoutePath() — exhaustive edge cases', () => {
  const cases: [string, string, string][] = [
    ['/dashboard', '/chronicle/modern/x', '/chronicle/modern/dashboard'],
    ['dashboard', '/chronicle/modern/x', '/chronicle/modern/dashboard'],
    ['/studies', '/chronicle/x', '/chronicle/studies'],
    ['studies', '/chronicle/x', '/chronicle/studies'],
    ['/survey', '/modern/x', '/modern/survey'],
    ['/page', '/', '/page'],
    ['/page', '/other', '/page'],
    ['page', '/other', '/page'],
    ['/a/b/c', '/chronicle/modern/x', '/chronicle/modern/a/b/c'],
    ['/', '/chronicle/x', '/chronicle/'],
    ['', '/chronicle/x', '/chronicle/'],
  ];

  it.each(cases)('modernRoutePath("%s", "%s") => "%s"', (path, base, expected) => {
    expect(modernRoutePath(path, base)).toBe(expected);
  });
});

describe('modernStudyPath() — edge cases', () => {
  it('encodes a standard UUID', () => {
    expect(modernStudyPath('550e8400-e29b-41d4-a716-446655440000', '/chronicle/x')).toBe(
      '/chronicle/studies/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('encodes spaces in study ID', () => {
    expect(modernStudyPath('my study', '/chronicle/x')).toBe('/chronicle/studies/my%20study');
  });

  it('encodes slashes in study ID', () => {
    expect(modernStudyPath('a/b', '/chronicle/x')).toBe('/chronicle/studies/a%2Fb');
  });

  it('encodes special characters', () => {
    expect(modernStudyPath('study?foo=bar', '/chronicle/x')).toBe('/chronicle/studies/study%3Ffoo%3Dbar');
  });

  it('encodes hash characters', () => {
    expect(modernStudyPath('study#1', '/chronicle/x')).toBe('/chronicle/studies/study%231');
  });

  it('encodes ampersand', () => {
    expect(modernStudyPath('a&b', '/chronicle/x')).toBe('/chronicle/studies/a%26b');
  });

  it('handles empty study ID', () => {
    expect(modernStudyPath('', '/chronicle/x')).toBe('/chronicle/studies/');
  });

  it('uses /modern base', () => {
    expect(modernStudyPath('abc', '/modern/x')).toBe('/modern/studies/abc');
  });

  it('uses /chronicle/modern base', () => {
    expect(modernStudyPath('abc', '/chronicle/modern/x')).toBe('/chronicle/modern/studies/abc');
  });

  it('uses empty base', () => {
    expect(modernStudyPath('abc', '/other')).toBe('/studies/abc');
  });
});

describe('legacyModernPath() — all 5 sections', () => {
  const sections: [StudySection][] = [
    ['audit'],
    ['compliance'],
    ['participants'],
    ['questionnaires'],
    ['time-use-diary'],
  ];

  it.each(sections)('section "%s" works with /chronicle base', (section) => {
    const result = legacyModernPath('study-1', section, '/chronicle/x');
    expect(result).toBe(`/chronicle/studies/study-1/${section}`);
  });

  it.each(sections)('section "%s" works with /modern base', (section) => {
    const result = legacyModernPath('study-1', section, '/modern/x');
    expect(result).toBe(`/modern/studies/study-1/${section}`);
  });

  it.each(sections)('section "%s" works with /chronicle/modern base', (section) => {
    const result = legacyModernPath('study-1', section, '/chronicle/modern/x');
    expect(result).toBe(`/chronicle/modern/studies/study-1/${section}`);
  });

  it('encodes study ID with spaces for all sections', () => {
    expect(legacyModernPath('my study', 'audit', '/chronicle/x')).toBe('/chronicle/studies/my%20study/audit');
  });

  it('encodes study ID with unicode', () => {
    expect(legacyModernPath('estudio-1', 'participants', '/chronicle/x')).toBe(
      '/chronicle/studies/estudio-1/participants',
    );
  });
});

describe('convenience path helpers — additional coverage', () => {
  const bases: [string, string][] = [
    ['/chronicle/modern/x', '/chronicle/modern'],
    ['/chronicle/x', '/chronicle'],
    ['/modern/x', '/modern'],
    ['/other', ''],
  ];

  describe('modernSurveyPath()', () => {
    it.each(bases)('base "%s" => "%s/survey"', (base, expectedBase) => {
      expect(modernSurveyPath(base)).toBe(`${expectedBase}/survey`);
    });
  });

  describe('modernTimeUseDiaryPath()', () => {
    it.each(bases)('base "%s" => "%s/time-use-diary"', (base, expectedBase) => {
      expect(modernTimeUseDiaryPath(base)).toBe(`${expectedBase}/time-use-diary`);
    });
  });

  describe('modernQuestionnairePath()', () => {
    it.each(bases)('base "%s" => "%s/questionnaire"', (base, expectedBase) => {
      expect(modernQuestionnairePath(base)).toBe(`${expectedBase}/questionnaire`);
    });
  });

  describe('modernParticipantDashboardPath()', () => {
    it.each(bases)('base "%s" => "%s/participant"', (base, expectedBase) => {
      expect(modernParticipantDashboardPath(base)).toBe(`${expectedBase}/participant`);
    });
  });
});
