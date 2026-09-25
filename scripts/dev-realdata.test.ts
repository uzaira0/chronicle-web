import { expect, test } from 'bun:test';
import { PSQL_ARGV } from './dev-realdata';

// dev:local reads the live DB as the bootstrap superuser; the session itself must refuse writes.
test('dev reader psql session is read-only and stops on error', () => {
  const shell = PSQL_ARGV.at(-1) ?? '';
  expect(shell).toContain("PGOPTIONS='-c default_transaction_read_only=on'");
  expect(shell).toContain('-v ON_ERROR_STOP=1');
});
