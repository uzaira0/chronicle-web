import { describe, expect, it } from 'bun:test';

import { getErrorMessage } from './errors';

describe('getErrorMessage()', () => {
  const fallback = 'Something went wrong';

  it('returns fallback for null', () => {
    expect(getErrorMessage(null, fallback)).toBe(fallback);
  });

  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined, fallback)).toBe(fallback);
  });

  it('returns fallback for non-object (string)', () => {
    expect(getErrorMessage('some string', fallback)).toBe(fallback);
  });

  it('returns fallback for non-object (number)', () => {
    expect(getErrorMessage(42, fallback)).toBe(fallback);
  });

  it('extracts RTK FetchBaseQueryError with data string', () => {
    expect(getErrorMessage({ status: 400, data: 'Bad request body' }, fallback)).toBe('Bad request body');
  });

  it('extracts RTK FetchBaseQueryError with data.message', () => {
    expect(getErrorMessage({ status: 422, data: { message: 'Validation failed' } }, fallback)).toBe(
      'Validation failed',
    );
  });

  it('ignores empty data string', () => {
    expect(getErrorMessage({ status: 400, data: '' }, fallback)).toBe(`${fallback} (status 400)`);
  });

  it('ignores empty data.message string', () => {
    expect(getErrorMessage({ status: 422, data: { message: '' } }, fallback)).toBe(`${fallback} (status 422)`);
  });

  it('extracts queryFn network error string', () => {
    expect(getErrorMessage({ status: 'FETCH_ERROR', error: 'Network request failed' }, fallback)).toBe(
      'Network request failed',
    );
  });

  it('extracts generic message field', () => {
    expect(getErrorMessage({ message: 'Something specific' }, fallback)).toBe('Something specific');
  });

  it('falls back to status code when only status is present', () => {
    expect(getErrorMessage({ status: 500 }, fallback)).toBe('Something went wrong (status 500)');
  });

  it('falls back to string status', () => {
    expect(getErrorMessage({ status: 'CUSTOM_ERROR' }, fallback)).toBe('Something went wrong (status CUSTOM_ERROR)');
  });

  it('returns fallback for empty object', () => {
    expect(getErrorMessage({}, fallback)).toBe(fallback);
  });

  it('prefers data string over error string', () => {
    expect(getErrorMessage({ data: 'Data error', error: 'Error field' }, fallback)).toBe('Data error');
  });

  it('prefers data.message over error string', () => {
    expect(getErrorMessage({ data: { message: 'Nested msg' }, error: 'Error field' }, fallback)).toBe('Nested msg');
  });

  // --- EXPANDED EDGE CASES ---

  it('returns fallback for boolean true', () => {
    expect(getErrorMessage(true, fallback)).toBe(fallback);
  });

  it('returns fallback for boolean false', () => {
    expect(getErrorMessage(false, fallback)).toBe(fallback);
  });

  it('returns fallback for NaN', () => {
    expect(getErrorMessage(NaN, fallback)).toBe(fallback);
  });

  it('returns fallback for zero', () => {
    expect(getErrorMessage(0, fallback)).toBe(fallback);
  });

  it('returns fallback for negative number', () => {
    expect(getErrorMessage(-1, fallback)).toBe(fallback);
  });

  it('returns fallback for Infinity', () => {
    expect(getErrorMessage(Infinity, fallback)).toBe(fallback);
  });

  it('handles deeply nested data.message toString', () => {
    expect(getErrorMessage({ data: { message: { toString: () => 'x' } } }, fallback)).toBe(fallback);
  });

  it('handles array as error (object but odd shape)', () => {
    expect(getErrorMessage([1, 2, 3], fallback)).toBe(fallback);
  });

  it('handles error with both data and message fields - data wins', () => {
    expect(getErrorMessage({ data: 'data-msg', message: 'msg-field' }, fallback)).toBe('data-msg');
  });

  it('handles error with data: null', () => {
    expect(getErrorMessage({ data: null }, fallback)).toBe(fallback);
  });

  it('handles error with data: 0', () => {
    expect(getErrorMessage({ data: 0 }, fallback)).toBe(fallback);
  });

  it('handles error with data: undefined', () => {
    expect(getErrorMessage({ data: undefined }, fallback)).toBe(fallback);
  });

  it('handles error with data: false', () => {
    expect(getErrorMessage({ data: false }, fallback)).toBe(fallback);
  });

  it('handles error with numeric error field (falls through to message)', () => {
    expect(getErrorMessage({ error: 42, message: 'msg' }, fallback)).toBe('msg');
  });

  it('handles error with numeric error field and no message', () => {
    expect(getErrorMessage({ error: 42 }, fallback)).toBe(fallback);
  });

  it('handles Error instance with message', () => {
    expect(getErrorMessage(new Error('real error'), fallback)).toBe('real error');
  });

  it('handles Error instance with empty message by returning the fallback', () => {
    expect(getErrorMessage(new Error(''), fallback)).toBe(fallback);
  });

  it('handles TypeError instance', () => {
    expect(getErrorMessage(new TypeError('type problem'), fallback)).toBe('type problem');
  });

  it('handles object with only toString override', () => {
    expect(getErrorMessage({ toString: () => 'custom' }, fallback)).toBe(fallback);
  });

  it('handles object with status: 0', () => {
    expect(getErrorMessage({ status: 0 }, fallback)).toBe('Something went wrong (status 0)');
  });

  it('handles object with status: NaN', () => {
    // NaN is typeof number but might behave oddly
    expect(getErrorMessage({ status: NaN }, fallback)).toBe('Something went wrong (status NaN)');
  });

  it('handles object with status: negative number', () => {
    expect(getErrorMessage({ status: -1 }, fallback)).toBe('Something went wrong (status -1)');
  });

  it('handles object with status: empty string', () => {
    expect(getErrorMessage({ status: '' }, fallback)).toBe('Something went wrong (status )');
  });

  it('handles object with empty data object (no message key)', () => {
    expect(getErrorMessage({ data: {} }, fallback)).toBe(fallback);
  });

  it('handles object with data array', () => {
    expect(getErrorMessage({ data: ['a', 'b'] }, fallback)).toBe(fallback);
  });

  it('handles object with an empty error string by returning the fallback', () => {
    expect(getErrorMessage({ error: '' }, fallback)).toBe(fallback);
  });

  it('prefers data string over message and status', () => {
    expect(getErrorMessage({ data: 'data-err', message: 'msg', status: 500 }, fallback)).toBe('data-err');
  });

  it('prefers error string over message when no data', () => {
    expect(getErrorMessage({ error: 'err-field', message: 'msg-field' }, fallback)).toBe('err-field');
  });

  it('falls back to status when every error message is empty', () => {
    expect(getErrorMessage({ data: '', error: '', message: '', status: 503 }, fallback)).toBe(
      `${fallback} (status 503)`,
    );
  });

  it('does not render an HTML response body as an application error', () => {
    expect(
      getErrorMessage(
        {
          status: 'PARSING_ERROR',
          data: '<!doctype html><html><body>SPA shell</body></html>',
          error: 'Unexpected token',
        },
        fallback,
      ),
    ).toBe(`${fallback} (status PARSING_ERROR)`);
  });

  it('does not render an oversized response body as an application error', () => {
    expect(getErrorMessage({ status: 502, data: 'x'.repeat(1_001) }, fallback)).toBe(`${fallback} (status 502)`);
  });

  it('handles data.message: null (not a string, skipped)', () => {
    expect(getErrorMessage({ data: { message: null } }, fallback)).toBe(fallback);
  });

  it('handles data.message: number (not a string, skipped)', () => {
    expect(getErrorMessage({ data: { message: 42 } }, fallback)).toBe(fallback);
  });

  it('handles data.message: undefined (not a string, skipped)', () => {
    expect(getErrorMessage({ data: { message: undefined } }, fallback)).toBe(fallback);
  });

  it('handles data: boolean true', () => {
    expect(getErrorMessage({ data: true }, fallback)).toBe(fallback);
  });

  it('handles nested error with data object missing message', () => {
    expect(getErrorMessage({ data: { code: 'ERR_01' } }, fallback)).toBe(fallback);
  });

  it('uses custom fallback message', () => {
    expect(getErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
  });

  it('uses empty fallback message', () => {
    expect(getErrorMessage(null, '')).toBe('');
  });

  it('handles status: boolean (not number or string)', () => {
    expect(getErrorMessage({ status: true }, fallback)).toBe(fallback);
  });

  it('handles status: null (not number or string)', () => {
    expect(getErrorMessage({ status: null }, fallback)).toBe(fallback);
  });
});
