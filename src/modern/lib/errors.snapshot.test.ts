import { describe, expect, it } from 'bun:test';

import { getErrorMessage } from './errors';

describe('getErrorMessage snapshots', () => {
  const fallback = 'Something went wrong';

  describe('non-object inputs return fallback', () => {
    it('null', () => {
      expect(getErrorMessage(null, fallback)).toMatchSnapshot();
    });
    it('undefined', () => {
      expect(getErrorMessage(undefined, fallback)).toMatchSnapshot();
    });
    it('string', () => {
      expect(getErrorMessage('raw string error', fallback)).toMatchSnapshot();
    });
    it('number', () => {
      expect(getErrorMessage(500, fallback)).toMatchSnapshot();
    });
    it('boolean', () => {
      expect(getErrorMessage(true, fallback)).toMatchSnapshot();
    });
    it('empty string', () => {
      expect(getErrorMessage('', fallback)).toMatchSnapshot();
    });
  });

  describe('RTK FetchBaseQueryError shapes', () => {
    it('data as string', () => {
      expect(getErrorMessage({ status: 400, data: 'Bad request body' }, fallback)).toMatchSnapshot();
    });
    it('data.message as string', () => {
      expect(getErrorMessage({ status: 422, data: { message: 'Validation failed' } }, fallback)).toMatchSnapshot();
    });
    it('empty data string falls through to status', () => {
      expect(getErrorMessage({ status: 400, data: '' }, fallback)).toMatchSnapshot();
    });
    it('empty data.message falls through to status', () => {
      expect(getErrorMessage({ status: 422, data: { message: '' } }, fallback)).toMatchSnapshot();
    });
    it('data as number falls through to status', () => {
      expect(getErrorMessage({ status: 500, data: 42 }, fallback)).toMatchSnapshot();
    });
    it('data as null falls through to status', () => {
      expect(getErrorMessage({ status: 503, data: null }, fallback)).toMatchSnapshot();
    });
  });

  describe('queryFn network error shapes', () => {
    it('FETCH_ERROR with error string', () => {
      expect(getErrorMessage({ status: 'FETCH_ERROR', error: 'Network request failed' }, fallback)).toMatchSnapshot();
    });
    it('PARSING_ERROR with error string', () => {
      expect(getErrorMessage({ status: 'PARSING_ERROR', error: 'Unexpected token' }, fallback)).toMatchSnapshot();
    });
  });

  describe('generic message field', () => {
    it('object with message string', () => {
      expect(getErrorMessage({ message: 'Something specific' }, fallback)).toMatchSnapshot();
    });
    it('Error instance', () => {
      expect(getErrorMessage(new Error('Thrown error'), fallback)).toMatchSnapshot();
    });
  });

  describe('status-only objects', () => {
    it('numeric status without data or message', () => {
      expect(getErrorMessage({ status: 404 }, fallback)).toMatchSnapshot();
    });
    it('string status without data or message', () => {
      expect(getErrorMessage({ status: 'TIMEOUT_ERROR' }, fallback)).toMatchSnapshot();
    });
  });

  describe('empty or unknown objects', () => {
    it('empty object', () => {
      expect(getErrorMessage({}, fallback)).toMatchSnapshot();
    });
    it('object with unrecognized fields', () => {
      expect(getErrorMessage({ foo: 'bar', baz: 42 }, fallback)).toMatchSnapshot();
    });
    it('array (object but no recognized fields)', () => {
      expect(getErrorMessage(['error'], fallback)).toMatchSnapshot();
    });
  });

  describe('different fallback strings', () => {
    it('empty fallback', () => {
      expect(getErrorMessage(null, '')).toMatchSnapshot();
    });
    it('long fallback', () => {
      expect(getErrorMessage(null, 'A very detailed fallback error message for the user.')).toMatchSnapshot();
    });
  });
});
