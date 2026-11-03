import { describe, expect, it } from 'bun:test';

import { modernRoutePath, modernSurveyPath, modernTimeUseDiaryPath, pickModernBase } from './route-links';

describe('modern route-link helpers', () => {
  it('builds route paths for /chronicle deployment base', () => {
    const base = '/chronicle/studies/alpha';
    expect(modernSurveyPath(base)).toBe('/chronicle/survey');
    expect(modernTimeUseDiaryPath(base)).toBe('/chronicle/time-use-diary');
  });

  it('builds route paths for modern root deployment', () => {
    const base = '/studies/alpha';
    expect(modernSurveyPath(base)).toBe('/survey');
  });
});

// === EXPANDED EXHAUSTIVE TESTS ===

describe('pickModernBase() — exhaustive edge cases', () => {
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
    ['/studies', '/chronicle/x', '/chronicle/studies'],
    ['studies', '/chronicle/x', '/chronicle/studies'],
    ['/page', '/', '/page'],
    ['/page', '/other', '/page'],
    ['page', '/other', '/page'],
    ['/', '/chronicle/x', '/chronicle/'],
    ['', '/chronicle/x', '/chronicle/'],
  ];

  it.each(cases)('modernRoutePath("%s", "%s") => "%s"', (path, base, expected) => {
    expect(modernRoutePath(path, base)).toBe(expected);
  });
});

describe('convenience path helpers — additional coverage', () => {
  const bases: [string, string][] = [
    ['/chronicle/x', '/chronicle'],
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
});
