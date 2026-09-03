import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { StatCard } from './stat-card';

describe('StatCard', () => {
  test('renders label and value', () => {
    render(<StatCard label="Active Users" value={42} />);
    expect(screen.getByText('Active Users')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
  });

  test('renders with string value', () => {
    render(<StatCard label="Status" value="Online" />);
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Online')).toBeTruthy();
  });

  test('renders with zero value', () => {
    render(<StatCard label="Errors" value={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  test('renders with large number value', () => {
    render(<StatCard label="Total Events" value="1,234,567" />);
    expect(screen.getByText('1,234,567')).toBeTruthy();
  });

  test('renders with ReactNode label', () => {
    render(<StatCard label={<span data-testid="custom-label">Custom</span>} value="5" />);
    expect(screen.getByTestId('custom-label')).toBeTruthy();
  });

  test('renders with ReactNode value', () => {
    render(<StatCard label="Count" value={<strong data-testid="bold-val">99</strong>} />);
    expect(screen.getByTestId('bold-val')).toBeTruthy();
  });

  test('applies default muted tone classes', () => {
    const { container } = render(<StatCard label="L" value="V" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-muted/50');
    expect(root.className).toContain('border-border');
  });

  test('applies default tone classes when tone="default"', () => {
    const { container } = render(<StatCard label="L" value="V" tone="default" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('bg-[var(--eq-info-bg)]');
    expect(root.className).toContain('text-[var(--eq-info)]');
    expect(root.className).toContain('[border-color:var(--eq-info)]');
  });

  test('applies custom className', () => {
    const { container } = render(<StatCard className="my-extra-class" label="L" value="V" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('my-extra-class');
  });

  test('always has eq-metric rounded and border base classes', () => {
    const { container } = render(<StatCard label="L" value="V" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('eq-metric');
    expect(root.className).toContain('rounded-lg');
    expect(root.className).toContain('border');
    expect(root.className).toContain('p-4');
  });
});
