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
} from './route-links';

// ─── pickModernBase — pathname matrix ────────────────────────
// 20 tests
describe('pickModernBase — pathname matrix', () => {
  const cases: Array<{ pathname: string; expected: string }> = [
    { pathname: '/chronicle/modern', expected: '/chronicle/modern' },
    { pathname: '/chronicle/modern/', expected: '/chronicle/modern' },
    { pathname: '/chronicle/modern/studies', expected: '/chronicle/modern' },
    { pathname: '/chronicle/modern/studies/abc-123', expected: '/chronicle/modern' },
    { pathname: '/modern', expected: '/modern' },
    { pathname: '/modern/', expected: '/modern' },
    { pathname: '/modern/studies', expected: '/modern' },
    { pathname: '/modern/studies/abc', expected: '/modern' },
    { pathname: '/chronicle', expected: '/chronicle' },
    { pathname: '/chronicle/', expected: '/chronicle' },
    { pathname: '/chronicle/studies', expected: '/chronicle' },
    { pathname: '/chronicle/participant', expected: '/chronicle' },
    { pathname: '/', expected: '' },
    { pathname: '', expected: '' },
    { pathname: '/other', expected: '' },
    { pathname: '/app', expected: '' },
    { pathname: '/something/else', expected: '' },
    { pathname: '/chronicles', expected: '' },
    { pathname: '/moderns', expected: '' },
    { pathname: '/chronicle-web', expected: '' },
  ];

  for (const { pathname, expected } of cases) {
    it(`"${pathname}" -> "${expected}"`, () => {
      expect(pickModernBase(pathname)).toBe(expected);
    });
  }
});

// ─── modernRoutePath — pathname x base matrix ────────────────
// 6 x 5 = 30 tests
describe('modernRoutePath — path x base matrix', () => {
  const paths = ['/studies', '/participant', '/survey', '/time-use-diary', 'studies', '/'];
  const bases = ['/chronicle/modern/foo', '/modern/bar', '/chronicle/bar', '/other', '/'];

  for (const path of paths) {
    for (const base of bases) {
      it(`path="${path}" base="${base}"`, () => {
        const result = modernRoutePath(path, base);
        const expectedBase = pickModernBase(base);
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        expect(result).toBe(`${expectedBase}${normalizedPath}`);
      });
    }
  }
});

// ─── modernStudyPath — studyId x base matrix ────────────────
// 6 x 4 = 24 tests
describe('modernStudyPath — studyId x base matrix', () => {
  const studyIds = [
    'abc-123',
    '550e8400-e29b-41d4-a716-446655440000',
    'simple',
    'with spaces',
    'special/chars',
    'a&b=c',
  ];
  const bases = ['/chronicle/modern/x', '/modern/x', '/chronicle/x', '/other'];

  for (const studyId of studyIds) {
    for (const base of bases) {
      it(`studyId="${studyId}" base="${base}"`, () => {
        const result = modernStudyPath(studyId, base);
        const expectedBase = pickModernBase(base);
        expect(result).toBe(`${expectedBase}/studies/${encodeURIComponent(studyId)}`);
      });
    }
  }
});

// ─── legacyModernPath — studyId x section x base matrix ──────
// 3 x 5 x 3 = 45 tests
describe('legacyModernPath — studyId x section x base matrix', () => {
  const studyIds = ['abc-123', '550e8400-uuid', 'test study'];
  const sections = ['audit', 'compliance', 'participants', 'questionnaires', 'time-use-diary'] as const;
  const bases = ['/chronicle/modern/x', '/modern/x', '/chronicle/x'];

  for (const studyId of studyIds) {
    for (const section of sections) {
      for (const base of bases) {
        it(`studyId="${studyId}" section="${section}" base="${base}"`, () => {
          const result = legacyModernPath(studyId, section, base);
          const expectedBase = pickModernBase(base);
          expect(result).toBe(`${expectedBase}/studies/${encodeURIComponent(studyId)}/${section}`);
        });
      }
    }
  }
});

// ─── convenience path functions — base matrix ────────────────
// 4 functions x 4 bases = 16 tests
describe('convenience path functions — base matrix', () => {
  const bases = ['/chronicle/modern/x', '/modern/x', '/chronicle/x', '/other'];
  const fns: Array<{ name: string; fn: (base?: string) => string; suffix: string }> = [
    { name: 'modernParticipantDashboardPath', fn: modernParticipantDashboardPath, suffix: '/participant' },
    { name: 'modernSurveyPath', fn: modernSurveyPath, suffix: '/survey' },
    { name: 'modernTimeUseDiaryPath', fn: modernTimeUseDiaryPath, suffix: '/time-use-diary' },
    { name: 'modernQuestionnairePath', fn: modernQuestionnairePath, suffix: '/questionnaire' },
  ];

  for (const { name, fn, suffix } of fns) {
    for (const base of bases) {
      it(`${name} base="${base}"`, () => {
        const result = fn(base);
        const expectedBase = pickModernBase(base);
        expect(result).toBe(`${expectedBase}${suffix}`);
      });
    }
  }
});
