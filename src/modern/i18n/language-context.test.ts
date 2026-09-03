import { describe, expect, test } from 'bun:test';

import { resolveInitialLanguage } from './language-context';

describe('resolveInitialLanguage', () => {
  test('an explicit ?lang= (with ?gender=) on the participant link wins', () => {
    expect(resolveInitialLanguage('?lang=he&gender=female', 'es', 'de-DE')).toBe('he-female');
    expect(resolveInitialLanguage('?lang=es', 'de', 'en-US')).toBe('es');
  });

  test('an unknown ?lang= is ignored in favour of the stored choice, then the browser language', () => {
    expect(resolveInitialLanguage('?lang=xx', 'sv', 'de-DE')).toBe('sv');
    expect(resolveInitialLanguage('?lang=xx', null, 'de-DE')).toBe('de');
  });

  test('?lang=en-XA selects the dev pseudo-locale', () => {
    expect(resolveInitialLanguage('?lang=en-XA', 'es', 'de-DE')).toBe('en-XA');
  });

  test('falls back to English when nothing matches a supported table', () => {
    expect(resolveInitialLanguage('', null, 'fr-FR')).toBe('en');
  });
});
