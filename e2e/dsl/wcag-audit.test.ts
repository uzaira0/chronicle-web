import { describe, expect, it } from 'bun:test';

import { WCAG_SMOKE_ROUTES, WCAG_TAGS } from './wcag-audit';

describe('WCAG smoke audit contract', () => {
  it('retains the public home and login route coverage from the retired pa11y gate', () => {
    expect(WCAG_SMOKE_ROUTES).toEqual(['/', '/login']);
  });

  it('runs the Axe rulesets for WCAG 2.0 and 2.1 levels A and AA', () => {
    expect(WCAG_TAGS).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  });
});
