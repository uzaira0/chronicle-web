import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { Badge } from './badge';

describe('Badge', () => {
  test('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  test('renders as a div element', () => {
    const { container } = render(<Badge>Tag</Badge>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  test('applies default variant classes', () => {
    const { container } = render(<Badge>Default</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-primary');
    expect(el.className).toContain('text-primary-foreground');
  });

  test('applies muted variant classes', () => {
    const { container } = render(<Badge variant="muted">Muted</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-muted');
    expect(el.className).toContain('text-muted-foreground');
  });

  test('applies outline variant classes', () => {
    const { container } = render(<Badge variant="outline">Outlined</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('text-foreground');
  });

  test('applies success variant classes', () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-[var(--eq-success-bg)]');
    expect(el.className).toContain('text-[var(--eq-success)]');
  });

  test('applies warning variant classes', () => {
    const { container } = render(<Badge variant="warning">Warn</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-[var(--eq-warning-bg)]');
    expect(el.className).toContain('text-[var(--eq-warning)]');
  });

  test('applies destructive variant classes', () => {
    const { container } = render(<Badge variant="destructive">Error</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-[var(--eq-danger-bg)]');
    expect(el.className).toContain('text-[var(--eq-danger)]');
  });

  test('applies custom className', () => {
    const { container } = render(<Badge className="my-badge">Custom</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('my-badge');
  });

  test('has base classes for all variants', () => {
    const { container } = render(<Badge>Base</Badge>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('inline-flex');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('font-semibold');
  });

  test('passes through HTML attributes', () => {
    render(
      <Badge data-testid="badge-id" role="status">
        Info
      </Badge>,
    );
    const el = screen.getByTestId('badge-id');
    expect(el.getAttribute('role')).toBe('status');
  });
});
