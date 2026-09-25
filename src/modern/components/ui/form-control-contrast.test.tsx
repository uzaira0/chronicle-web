import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';

import { LanguageSwitcher } from '@/i18n/language-switcher';

import { Input } from './input';
import { Textarea } from './textarea';

const css = readFileSync(new URL('../../styles/index.css', import.meta.url), 'utf-8');
const tokens = readFileSync(Bun.resolveSync('@eqds/tokens/tokens.css', import.meta.dir), 'utf-8');

function block(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf('\n}', start));
}

function hexVar(body: string, name: string): string {
  const match = body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// WCAG 2.2 SC 1.4.11: field boundaries and focus indicators need 3:1 against what they sit on.
describe('form control non-text contrast (SC 1.4.11)', () => {
  const lightRoot = block(tokens, '[data-eq-theme="light"]');
  const lightBg = hexVar(lightRoot, '--eq-bg');
  const lightSurface = hexVar(lightRoot, '--eq-surface');
  const dark = block(css, '.dark');
  const darkBg = hexVar(dark, '--eq-bg');
  const darkSurface = hexVar(dark, '--eq-surface');

  test('light --input and --eq-focus reach 3:1 on page and card', () => {
    const root = block(css, ':root');
    for (const name of ['--input', '--eq-focus']) {
      const value = hexVar(root, name);
      expect(contrast(value, lightBg)).toBeGreaterThanOrEqual(3);
      expect(contrast(value, lightSurface)).toBeGreaterThanOrEqual(3);
    }
  });

  test('dark --input and --eq-focus reach 3:1 on page and card', () => {
    for (const name of ['--input', '--eq-focus']) {
      const value = hexVar(dark, name);
      expect(contrast(value, darkBg)).toBeGreaterThanOrEqual(3);
      expect(contrast(value, darkSurface)).toBeGreaterThanOrEqual(3);
    }
  });

  test('fields draw their boundary with border-input and keep the focus outline', () => {
    const fields = [
      render(<Input />).container.firstElementChild as HTMLElement,
      render(<Textarea />).container.firstElementChild as HTMLElement,
      render(<LanguageSwitcher />).container.querySelector('select') as HTMLElement,
    ];
    for (const field of fields) {
      expect(field.classList.contains('border-input')).toBe(true);
      expect(field.classList.contains('border-border')).toBe(false);
      expect(field.classList.contains('outline-none')).toBe(false);
    }
  });
});

// Unlayered equal.css (.eq-btn padding/font/min-height/display) beat every Tailwind utility,
// so size="icon" squeezed svgs to 6px and md:hidden buttons showed on desktop.
describe('design-system cascade', () => {
  test('equal.css loads into layer(components), after tailwindcss declares the layer order', () => {
    const imports = [...css.matchAll(/^@import\s+"([^"]+)"([^;]*);/gm)].map((m) => ({
      from: m[1],
      rest: (m[2] ?? '').trim(),
    }));
    const tailwind = imports.findIndex((i) => i.from === 'tailwindcss');
    const equal = imports.findIndex((i) => i.from === '@eqds/css/equal.css');
    expect(tailwind).toBeGreaterThanOrEqual(0);
    expect(equal).toBeGreaterThan(tailwind);
    expect(imports[equal]?.rest).toBe('layer(components)');
  });
});
