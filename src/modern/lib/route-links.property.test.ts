import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import {
  legacyModernPath,
  modernQuestionnairePath,
  modernRoutePath,
  modernStudyPath,
  modernSurveyPath,
  modernTimeUseDiaryPath,
  pickModernBase,
} from './route-links';

const chronicleModernPathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.includes('\0'))
  .map((s) => `/chronicle/modern/${s}`);

const modernPathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.includes('\0'))
  .map((s) => `/modern/${s}`);

const chroniclePathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.includes('\0') && !s.startsWith('modern'))
  .map((s) => `/chronicle/${s}`);

const otherPathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.startsWith('/chronicle') && !s.startsWith('/modern') && !s.includes('\0'))
  .map((s) => `/other/${s}`);

const baseArb = fc.oneof(chronicleModernPathArb, modernPathArb, chroniclePathArb, otherPathArb);

const sectionArb = fc.constantFrom('audit', 'compliance', 'participants', 'questionnaires', 'time-use-diary');

const studyIdArb = fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.length > 0);

describe('route-links properties', () => {
  it('pickModernBase returns /chronicle/modern for /chronicle/modern/* paths', () => {
    fc.assert(
      fc.property(chronicleModernPathArb, (path) => {
        expect(pickModernBase(path)).toBe('/chronicle/modern');
      }),
    );
  });

  it('pickModernBase returns /modern for /modern/* paths', () => {
    fc.assert(
      fc.property(modernPathArb, (path) => {
        expect(pickModernBase(path)).toBe('/modern');
      }),
    );
  });

  it('pickModernBase returns /chronicle for /chronicle/* (non-modern) paths', () => {
    fc.assert(
      fc.property(chroniclePathArb, (path) => {
        expect(pickModernBase(path)).toBe('/chronicle');
      }),
    );
  });

  it('pickModernBase returns empty string for non-matching paths', () => {
    fc.assert(
      fc.property(otherPathArb, (path) => {
        expect(pickModernBase(path)).toBe('');
      }),
    );
  });

  it('pickModernBase always returns a string', () => {
    fc.assert(
      fc.property(baseArb, (path) => {
        expect(typeof pickModernBase(path)).toBe('string');
      }),
    );
  });

  it('pickModernBase result is always one of the 4 possible values', () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const result = pickModernBase(path);
        expect(['/chronicle/modern', '/modern', '/chronicle', '']).toContain(result);
      }),
    );
  });

  it('modernRoutePath result always starts with pickModernBase result', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), baseArb, (pathname, base) => {
        const result = modernRoutePath(pathname, base);
        expect(result.startsWith(pickModernBase(base))).toBe(true);
      }),
    );
  });

  it('modernRoutePath result always contains the pathname', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes('\0')),
        baseArb,
        (pathname, base) => {
          const result = modernRoutePath(pathname, base);
          const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
          expect(result).toEndWith(normalizedPath);
        },
      ),
    );
  });

  it('modernStudyPath result always contains /studies/', () => {
    fc.assert(
      fc.property(studyIdArb, baseArb, (studyId, base) => {
        const result = modernStudyPath(studyId, base);
        expect(result).toContain('/studies/');
      }),
    );
  });

  it('modernStudyPath result always contains the encoded studyId', () => {
    fc.assert(
      fc.property(studyIdArb, baseArb, (studyId, base) => {
        const result = modernStudyPath(studyId, base);
        expect(result).toContain(encodeURIComponent(studyId));
      }),
    );
  });

  it('legacyModernPath result always contains the section name', () => {
    fc.assert(
      fc.property(studyIdArb, sectionArb, baseArb, (studyId, section, base) => {
        const result = legacyModernPath(studyId, section, base);
        expect(result).toContain(section);
      }),
    );
  });

  it('legacyModernPath result always contains /studies/', () => {
    fc.assert(
      fc.property(studyIdArb, sectionArb, baseArb, (studyId, section, base) => {
        const result = legacyModernPath(studyId, section, base);
        expect(result).toContain('/studies/');
      }),
    );
  });

  it('legacyModernPath result always contains the encoded studyId', () => {
    fc.assert(
      fc.property(studyIdArb, sectionArb, baseArb, (studyId, section, base) => {
        const result = legacyModernPath(studyId, section, base);
        expect(result).toContain(encodeURIComponent(studyId));
      }),
    );
  });

  it('modernSurveyPath result always ends with /survey', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(modernSurveyPath(base)).toEndWith('/survey');
      }),
    );
  });

  it('modernTimeUseDiaryPath result always ends with /time-use-diary', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(modernTimeUseDiaryPath(base)).toEndWith('/time-use-diary');
      }),
    );
  });

  it('modernQuestionnairePath result always ends with /questionnaire', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(modernQuestionnairePath(base)).toEndWith('/questionnaire');
      }),
    );
  });

  it('modernRoutePath is deterministic', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), baseArb, (pathname, base) => {
        expect(modernRoutePath(pathname, base)).toBe(modernRoutePath(pathname, base));
      }),
    );
  });

  it('pickModernBase is deterministic', () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        expect(pickModernBase(path)).toBe(pickModernBase(path));
      }),
    );
  });

  it('modernSurveyPath always returns a string starting with pickModernBase', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        const result = modernSurveyPath(base);
        expect(result.startsWith(pickModernBase(base))).toBe(true);
      }),
    );
  });

  it('modernTimeUseDiaryPath always returns a string starting with pickModernBase', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        const result = modernTimeUseDiaryPath(base);
        expect(result.startsWith(pickModernBase(base))).toBe(true);
      }),
    );
  });

  it('modernStudyPath always returns a string starting with pickModernBase', () => {
    fc.assert(
      fc.property(studyIdArb, baseArb, (studyId, base) => {
        const result = modernStudyPath(studyId, base);
        expect(result.startsWith(pickModernBase(base))).toBe(true);
      }),
    );
  });

  it('legacyModernPath result ends with the section', () => {
    fc.assert(
      fc.property(studyIdArb, sectionArb, baseArb, (studyId, section, base) => {
        const result = legacyModernPath(studyId, section, base);
        expect(result).toEndWith(`/${section}`);
      }),
    );
  });

  it('modernRoutePath with leading slash does not double-slash', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\0') && !s.includes('/')),
        baseArb,
        (name, base) => {
          const result = modernRoutePath(`/${name}`, base);
          expect(result).not.toContain('//');
        },
      ),
    );
  });

  it('modernRoutePath without leading slash still produces valid path', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('\0') && !s.startsWith('/')),
        baseArb,
        (name, base) => {
          const result = modernRoutePath(name, base);
          expect(result).toContain(`/${name}`);
        },
      ),
    );
  });
});
