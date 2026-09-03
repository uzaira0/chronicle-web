import { describe, expect, it } from 'bun:test';
import { getErrorMessage } from './errors';

describe('getErrorMessage sanitization', () => {
  const fallback = 'Something went wrong';

  it('redacts /app/src/ paths', () => {
    const error = { message: 'Error at /app/src/components/Button.tsx:10:5' };
    expect(getErrorMessage(error, fallback)).toBe('Error at [internal]/components/Button.tsx:10:5');
  });

  it('redacts node_modules/ paths', () => {
    const error = { message: 'Error in node_modules/react/index.js' };
    expect(getErrorMessage(error, fallback)).toBe('Error in [vendor]/react/index.js');
  });

  it('redacts webpack:/// paths', () => {
    const error = { message: 'Error at webpack:///src/utils.ts' };
    expect(getErrorMessage(error, fallback)).toBe('Error at [bundle]:///src/utils.ts');
  });
});

describe('getErrorMessage server-diagnostic suppression', () => {
  const fallback = 'Unable to load compliance violations.';

  it('does not render a serialized backend error document', () => {
    const error = {
      status: 500,
      data: '{"timestamp":"2026-08-14T10:00:00Z","status":500,"error":"Internal Server Error","path":"/chronicle/api/web/study/{studyId}/compliance","errorId":"5f2c9b41"}',
    };
    expect(getErrorMessage(error, fallback)).toBe(`${fallback} (status 500)`);
  });

  it('does not render a parsed backend error document reached through data.message', () => {
    const error = {
      status: 500,
      data: { message: 'No handler for /chronicle/api/web/study/{studyId}/compliance' },
    };
    expect(getErrorMessage(error, fallback)).toBe(`${fallback} (status 500)`);
  });

  it('does not render a correlation id', () => {
    const error = { status: 500, data: { message: 'Request failed, errorId: 5f2c9b41-33ab' } };
    expect(getErrorMessage(error, fallback)).toBe(`${fallback} (status 500)`);
  });

  it('does not render a server stack trace', () => {
    const error = { status: 500, data: { message: 'com.openlattice.chronicle.ChronicleException: boom' } };
    expect(getErrorMessage(error, fallback)).toBe(`${fallback} (status 500)`);
  });

  it('still renders a message written for a person', () => {
    const error = { status: 403, data: { message: 'You do not have access to this study.' } };
    expect(getErrorMessage(error, fallback)).toBe('You do not have access to this study.');
  });
});
