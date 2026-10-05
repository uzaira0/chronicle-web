import { describe, expect, test } from 'bun:test';

describe('sticky application header scroll spacing (W39)', () => {
  test('gives focused main-content targets scroll margin below the shell header', async () => {
    const source = await Bun.file('src/modern/styles/index.css').text();
    expect(source).toContain('.eq-app-shell main :is(');
    expect(source).toContain('scroll-margin-block-start: calc(var(--app-shell-header-height) + 0.5rem);');
    expect(source).toContain('--app-shell-header-height: 4rem;');
  });
});
