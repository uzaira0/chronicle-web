import { describe, expect, test } from 'bun:test';

import { resolveBaseLang, resolveTudSettings, type TudStudySettings } from './tud-page-settings';

const sp = (query: string) => new URLSearchParams(query);

const studySettings = (over: Partial<TudStudySettings> = {}): TudStudySettings => ({
  clockFormat: 12,
  clockFormatLocked: false,
  enableChangesForOhioStateUniversity: false,
  enableChangesForSherbrookeUniversity: false,
  language: 'en',
  ...over,
});

describe('resolveTudSettings — study settings are authoritative (R2 parity)', () => {
  test('OSU comes from study settings when no URL param is present', () => {
    const s = resolveTudSettings(sp(''), studySettings({ enableChangesForOhioStateUniversity: true }));
    expect(s.enableOsu).toBe(true);
  });

  test('Sherbrooke comes from study settings when no URL param is present', () => {
    const s = resolveTudSettings(sp(''), studySettings({ enableChangesForSherbrookeUniversity: true }));
    expect(s.enableSherbrooke).toBe(true);
  });

  test('clockFormat + clockFormatLocked come from study settings', () => {
    const s = resolveTudSettings(sp(''), studySettings({ clockFormat: 24, clockFormatLocked: true }));
    expect(s.clockFormat).toBe(24);
    expect(s.clockFormatLocked).toBe(true);
  });

  test('a non-12/24 clockFormat coerces to 12', () => {
    const s = resolveTudSettings(sp(''), studySettings({ clockFormat: 0 }));
    expect(s.clockFormat).toBe(12);
  });
});

describe('resolveTudSettings — explicit URL param overrides settings (manual affordance)', () => {
  test('?osu=false overrides settings OSU=true', () => {
    const s = resolveTudSettings(sp('osu=false'), studySettings({ enableChangesForOhioStateUniversity: true }));
    expect(s.enableOsu).toBe(false);
  });

  test('?osu=true overrides settings OSU=false (and ?osu=1 works too)', () => {
    expect(resolveTudSettings(sp('osu=true'), studySettings()).enableOsu).toBe(true);
    expect(resolveTudSettings(sp('osu=1'), studySettings()).enableOsu).toBe(true);
  });

  test('?clockFormat=12 overrides settings clockFormat=24; ?lockClockFormat=false overrides locked', () => {
    const s = resolveTudSettings(
      sp('clockFormat=12&lockClockFormat=false'),
      studySettings({ clockFormat: 24, clockFormatLocked: true }),
    );
    expect(s.clockFormat).toBe(12);
    expect(s.clockFormatLocked).toBe(false);
  });
});

describe('resolveTudSettings — degrades to URL/defaults when settings are absent', () => {
  test('no settings + no params → upstream defaults', () => {
    const s = resolveTudSettings(sp(''), undefined);
    expect(s).toEqual({ clockFormat: 12, clockFormatLocked: false, enableOsu: false, enableSherbrooke: false });
  });

  test('no settings + URL params still apply (settings hiccup never blocks the form)', () => {
    const s = resolveTudSettings(sp('osu=true&sherbrooke=1&clockFormat=24&lockClockFormat=true'), undefined);
    expect(s).toEqual({ clockFormat: 24, clockFormatLocked: true, enableOsu: true, enableSherbrooke: true });
  });
});

describe('resolveBaseLang — ?lang wins, else study language, else en', () => {
  test('study language is used when no ?lang', () => {
    expect(resolveBaseLang(sp(''), studySettings({ language: 'de' }))).toBe('de');
    expect(resolveBaseLang(sp(''), studySettings({ language: 'he' }))).toBe('he');
  });

  test('?lang overrides the study language', () => {
    expect(resolveBaseLang(sp('lang=es'), studySettings({ language: 'de' }))).toBe('es');
  });

  test('an unsupported language falls back to en', () => {
    expect(resolveBaseLang(sp(''), studySettings({ language: 'zz' }))).toBe('en');
    expect(resolveBaseLang(sp('lang=zz'), studySettings({ language: 'de' }))).toBe('en');
  });

  test('no settings → en', () => {
    expect(resolveBaseLang(sp(''), undefined)).toBe('en');
  });
});
