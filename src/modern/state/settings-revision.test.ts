import { describe, expect, it } from 'bun:test';

import {
  forgetSettingsRevision,
  isSettingsConflict,
  knownSettingsRevision,
  rememberSettingsRevision,
} from './settings-revision';

describe('settings revision', () => {
  it('remembers the ETag of the last settings response per study', () => {
    rememberSettingsRevision('s1', new Headers({ etag: '"7"' }));
    rememberSettingsRevision('s2', new Headers({ etag: '"3"' }));
    expect(knownSettingsRevision('s1')).toBe('"7"');
    expect(knownSettingsRevision('s2')).toBe('"3"');
  });

  it('keeps the previous revision when a response carries none', () => {
    rememberSettingsRevision('s3', new Headers({ etag: '"1"' }));
    rememberSettingsRevision('s3', new Headers());
    rememberSettingsRevision('s3', null);
    expect(knownSettingsRevision('s3')).toBe('"1"');
  });

  it('forgets a revision after a conflict', () => {
    rememberSettingsRevision('s4', new Headers({ etag: '"9"' }));
    forgetSettingsRevision('s4');
    expect(knownSettingsRevision('s4')).toBeUndefined();
  });

  it('recognises a 412 from RTK Query and nothing else', () => {
    expect(isSettingsConflict({ status: 412, data: {} })).toBe(true);
    expect(isSettingsConflict({ status: 409 })).toBe(false);
    expect(isSettingsConflict(new Error('x'))).toBe(false);
    expect(isSettingsConflict(null)).toBe(false);
  });
});
