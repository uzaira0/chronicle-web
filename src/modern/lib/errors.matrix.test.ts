import { describe, expect, it } from 'bun:test';
import { getErrorMessage } from './errors';

// ─── getErrorMessage — exhaustive error shape x fallback matrix ─
// 4 x 25 = 100 tests
describe('getErrorMessage — error shape x fallback matrix', () => {
  const fallbacks = ['Default', '', 'Error occurred', 'Something went wrong'];
  const errorShapes: Array<{ desc: string; value: unknown }> = [
    { desc: 'null', value: null },
    { desc: 'undefined', value: undefined },
    { desc: 'empty string', value: '' },
    { desc: 'number 0', value: 0 },
    { desc: 'number 42', value: 42 },
    { desc: 'boolean true', value: true },
    { desc: 'boolean false', value: false },
    { desc: 'empty object', value: {} },
    { desc: 'data string', value: { data: 'Error data' } },
    { desc: 'data empty', value: { data: '' } },
    { desc: 'data.message', value: { data: { message: 'Nested error' } } },
    { desc: 'data.message empty', value: { data: { message: '' } } },
    { desc: 'error string', value: { error: 'Network failed' } },
    { desc: 'message string', value: { message: 'Generic error' } },
    { desc: 'status number', value: { status: 500 } },
    { desc: 'status string', value: { status: 'CUSTOM' } },
    { desc: 'data+error', value: { data: 'Data error', error: 'Error field' } },
    { desc: 'data+message', value: { data: 'Data', message: 'Message' } },
    { desc: 'all fields', value: { data: 'D', error: 'E', message: 'M', status: 400 } },
    { desc: 'array', value: [1, 2, 3] },
    { desc: 'Error instance', value: new Error('JS Error') },
    { desc: 'data null', value: { data: null } },
    { desc: 'data number', value: { data: 42 } },
    { desc: 'data object no message', value: { data: { code: 500 } } },
    { desc: 'status only zero', value: { status: 0 } },
  ];

  for (const fallback of fallbacks) {
    for (const { desc, value } of errorShapes) {
      it(`fallback="${fallback}" error=${desc}`, () => {
        const result = getErrorMessage(value, fallback);
        expect(typeof result).toBe('string');
      });
    }
  }
});

// ─── getErrorMessage — priority verification matrix ──────────
// Verify that data > error > message > status > fallback priority holds
// 20 tests
describe('getErrorMessage — priority order verification', () => {
  it('data string takes priority over error', () => {
    expect(getErrorMessage({ data: 'DataMsg', error: 'ErrMsg' }, 'fb')).toBe('DataMsg');
  });
  it('data string takes priority over message', () => {
    expect(getErrorMessage({ data: 'DataMsg', message: 'MsgField' }, 'fb')).toBe('DataMsg');
  });
  it('data string takes priority over status', () => {
    expect(getErrorMessage({ data: 'DataMsg', status: 500 }, 'fb')).toBe('DataMsg');
  });
  it('data.message takes priority over error', () => {
    expect(getErrorMessage({ data: { message: 'Nested' }, error: 'ErrMsg' }, 'fb')).toBe('Nested');
  });
  it('data.message takes priority over message', () => {
    expect(getErrorMessage({ data: { message: 'Nested' }, message: 'TopLevel' }, 'fb')).toBe('Nested');
  });
  it('error takes priority over message when no data', () => {
    expect(getErrorMessage({ error: 'ErrMsg', message: 'MsgField' }, 'fb')).toBe('ErrMsg');
  });
  it('error takes priority over status when no data', () => {
    expect(getErrorMessage({ error: 'ErrMsg', status: 500 }, 'fb')).toBe('ErrMsg');
  });
  it('message takes priority over status when no data/error', () => {
    expect(getErrorMessage({ message: 'MsgField', status: 500 }, 'fb')).toBe('MsgField');
  });
  it('status produces "(status N)" suffix', () => {
    expect(getErrorMessage({ status: 500 }, 'fb')).toBe('fb (status 500)');
  });
  it('status string also works', () => {
    expect(getErrorMessage({ status: 'FETCH_ERROR' }, 'fb')).toBe('fb (status FETCH_ERROR)');
  });
  it('empty data falls through to error', () => {
    expect(getErrorMessage({ data: '', error: 'ErrMsg' }, 'fb')).toBe('ErrMsg');
  });
  it('empty data.message falls through to error', () => {
    expect(getErrorMessage({ data: { message: '' }, error: 'ErrMsg' }, 'fb')).toBe('ErrMsg');
  });
  it('data null falls through to error', () => {
    expect(getErrorMessage({ data: null, error: 'ErrMsg' }, 'fb')).toBe('ErrMsg');
  });
  it('data number falls through to error', () => {
    expect(getErrorMessage({ data: 42, error: 'ErrMsg' }, 'fb')).toBe('ErrMsg');
  });
  it('Error instance returns its message', () => {
    expect(getErrorMessage(new Error('TestErr'), 'fb')).toBe('TestErr');
  });
  it('all non-matching falls to fallback', () => {
    expect(getErrorMessage({}, 'MyFallback')).toBe('MyFallback');
  });
  it('null returns fallback', () => {
    expect(getErrorMessage(null, 'Fallback')).toBe('Fallback');
  });
  it('undefined returns fallback', () => {
    expect(getErrorMessage(undefined, 'Fallback')).toBe('Fallback');
  });
  it('primitive string returns fallback', () => {
    expect(getErrorMessage('plain string', 'Fallback')).toBe('Fallback');
  });
  it('primitive number returns fallback', () => {
    expect(getErrorMessage(123, 'Fallback')).toBe('Fallback');
  });
});

// ─── getErrorMessage — status code matrix ────────────────────
// 10 tests
describe('getErrorMessage — HTTP status code matrix', () => {
  const codes = [200, 400, 401, 403, 404, 409, 422, 500, 502, 503];
  for (const code of codes) {
    it(`status ${code} includes code in output`, () => {
      const result = getErrorMessage({ status: code }, 'Request failed');
      expect(result).toContain(String(code));
    });
  }
});
