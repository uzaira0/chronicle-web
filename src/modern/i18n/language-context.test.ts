import { describe, expect, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { withBlockedStorage } from '@/test/browser-env';

import { getCurrentLanguage, LanguageProvider, resolveInitialLanguage } from './language-context';

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

// A participant whose browser blocks site data (private mode, strict tracking settings) makes every storage read
// throw: the page still opens, in the link's or the browser's language, as if nothing had been stored.
describe('LanguageProvider with blocked storage', () => {
  test.each([
    ['', 'en'],
    ['?lang=es', 'es'],
  ])('a blocked stored-language read with link %j opens in %s', (search, expected) => {
    try {
      withBlockedStorage(() => render(createElement(LanguageProvider, { initialSearch: search }, 'page')));
      expect(document.documentElement.lang).toBe(expected);
      expect(getCurrentLanguage()).toBe(expected);
    } finally {
      cleanup();
      render(createElement(LanguageProvider, { initialSearch: '?lang=en' }, null));
      cleanup();
    }
  });
});
