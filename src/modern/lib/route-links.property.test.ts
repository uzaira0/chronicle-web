import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { modernRoutePath, modernSurveyPath, modernTimeUseDiaryPath, pickModernBase } from './route-links';

const chroniclePathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.includes('\0'))
  .map((s) => `/chronicle/${s}`);

const otherPathArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => !s.startsWith('/chronicle') && !s.includes('\0'))
  .map((s) => `/other/${s}`);

const baseArb = fc.oneof(chroniclePathArb, otherPathArb);

describe('route-links properties', () => {
  it('pickModernBase returns /chronicle for /chronicle/* paths', () => {
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

  it('pickModernBase result is always one of the 2 deployment mounts', () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const result = pickModernBase(path);
        expect(['/chronicle', '']).toContain(result);
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
