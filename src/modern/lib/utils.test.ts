import { describe, expect, test } from 'bun:test';

import { cn } from './utils';

describe('cn', () => {
  test('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  test('handles undefined and null values', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });

  test('handles empty string', () => {
    expect(cn('')).toBe('');
  });

  test('handles conditional classes', () => {
    const isActive = true;
    expect(cn('base', isActive && 'active')).toBe('base active');
  });

  test('handles false conditional classes', () => {
    const isActive = false;
    expect(cn('base', isActive && 'active')).toBe('base');
  });

  test('merges tailwind classes with conflict resolution', () => {
    const result = cn('p-4', 'p-6');
    expect(result).toBe('p-6');
  });

  test('handles array of classes via clsx', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });
});
