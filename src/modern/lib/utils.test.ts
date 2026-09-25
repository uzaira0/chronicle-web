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

describe('cn with custom theme tokens (styles/index.css @theme)', () => {
  test('a caller max-w overrides the dialog default', () => {
    expect(cn('w-11/12 max-w-dialog', 'max-w-md')).toBe('w-11/12 max-w-md');
  });
  test('custom tracking tokens merge with scale tracking', () => {
    expect(cn('tracking-eyebrow', 'tracking-wide')).toBe('tracking-wide');
  });
  test('custom font sizes merge and do not clobber colors', () => {
    expect(cn('text-2xs', 'text-sm')).toBe('text-sm');
    expect(cn('text-2xs', 'text-muted-foreground')).toBe('text-2xs text-muted-foreground');
  });
});
