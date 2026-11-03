import { expect, test } from 'bun:test';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { useSearchParamValue } from './use-list-search-params';

let setFormat: (value: 'CSV' | 'EXCEL' | 'JSON') => void = () => undefined;
function Probe() {
  const [format, set] = useSearchParamValue('format', 'EXCEL', ['CSV', 'JSON', 'EXCEL']);
  setFormat = set;
  return <output>{`${format} ${useLocation().search}`}</output>;
}

test.each([
  ['?format=CSV', 'CSV ?format=CSV'],
  ['?format=bogus', 'EXCEL ?format=bogus'],
  ['', 'EXCEL '],
])('reads %p from the URL, falling back to the default', (search, shown) => {
  render(
    <MemoryRouter initialEntries={[`/downloads${search}`]}>
      <Probe />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status').textContent).toBe(shown);
});

test('writes the value into the URL so a copied link restores it', () => {
  render(
    <MemoryRouter initialEntries={['/downloads?q=x']}>
      <Probe />
    </MemoryRouter>,
  );
  act(() => setFormat('JSON'));
  expect(screen.getByRole('status').textContent).toBe('JSON ?q=x&format=JSON');
});
