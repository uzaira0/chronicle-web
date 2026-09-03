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

describe('route-links snapshots', () => {
  describe('pickModernBase', () => {
    const bases = [
      '/chronicle/modern/studies/alpha',
      '/chronicle/modern',
      '/chronicle/modern/',
      '/modern/studies/alpha',
      '/modern',
      '/modern/',
      '/chronicle/studies/alpha',
      '/chronicle',
      '/chronicle/',
      '/other/path',
      '/',
      '',
    ];

    for (const base of bases) {
      it(`pickModernBase('${base}')`, () => {
        expect(pickModernBase(base)).toMatchSnapshot();
      });
    }
  });

  describe('modernRoutePath', () => {
    const cases: [string, string][] = [
      ['/dashboard', '/chronicle/modern/studies/alpha'],
      ['dashboard', '/chronicle/modern/studies/alpha'],
      ['/settings', '/chronicle/studies/alpha'],
      ['settings', '/modern/studies/alpha'],
      ['/about', '/other/path'],
      ['/studies', '/'],
    ];

    for (const [pathname, base] of cases) {
      it(`modernRoutePath('${pathname}', '${base}')`, () => {
        expect(modernRoutePath(pathname, base)).toMatchSnapshot();
      });
    }
  });

  describe('modernStudyPath', () => {
    const cases: [string, string][] = [
      ['study-abc', '/chronicle/modern/studies/alpha'],
      ['study with spaces', '/chronicle/studies/alpha'],
      ['study/with/slashes', '/modern/studies/alpha'],
      ['', '/chronicle/modern'],
    ];

    for (const [studyId, base] of cases) {
      it(`modernStudyPath('${studyId}', '${base}')`, () => {
        expect(modernStudyPath(studyId, base)).toMatchSnapshot();
      });
    }
  });

  describe('convenience path helpers', () => {
    const bases = ['/chronicle/modern', '/chronicle', '/modern', '/other'];

    for (const base of bases) {
      it(`modernQuestionnairePath('${base}')`, () => {
        expect(modernQuestionnairePath(base)).toMatchSnapshot();
      });
      it(`modernSurveyPath('${base}')`, () => {
        expect(modernSurveyPath(base)).toMatchSnapshot();
      });
      it(`modernTimeUseDiaryPath('${base}')`, () => {
        expect(modernTimeUseDiaryPath(base)).toMatchSnapshot();
      });
      it(`modernParticipantDashboardPath('${base}')`, () => {
        expect(modernParticipantDashboardPath(base)).toMatchSnapshot();
      });
    }
  });

  describe('legacyModernPath', () => {
    const sections = ['audit', 'compliance', 'participants', 'questionnaires', 'time-use-diary'] as const;

    for (const section of sections) {
      it(`legacyModernPath('study-1', '${section}', '/chronicle')`, () => {
        expect(legacyModernPath('study-1', section, '/chronicle')).toMatchSnapshot();
      });
    }

    it('encodes special characters in study ID', () => {
      expect(legacyModernPath('study id', 'participants', '/chronicle')).toMatchSnapshot();
    });

    it('encodes unicode in study ID', () => {
      expect(legacyModernPath('study-\u00e9tude', 'audit', '/chronicle/modern')).toMatchSnapshot();
    });
  });
});
