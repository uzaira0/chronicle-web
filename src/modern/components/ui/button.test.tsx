import { describe, expect, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { Button, buttonVariants } from './button';

describe('Button', () => {
  test('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeTruthy();
  });

  test('renders as button element by default', () => {
    const { container } = render(<Button>Btn</Button>);
    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });

  test('applies default variant and size classes', () => {
    const { container } = render(<Button>Default</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-primary');
    expect(el.className).toContain('h-10');
  });

  test('applies destructive variant', () => {
    const { container } = render(<Button variant="destructive">Delete</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-destructive');
  });

  test('applies outline-destructive variant', () => {
    const { container } = render(<Button variant="outline-destructive">Delete</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('text-destructive');
    expect(el.className).toContain('border-destructive/30');
  });

  test('applies ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('hover:bg-muted');
  });

  test('applies outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('border');
    expect(el.className).toContain('bg-card');
  });

  test('applies muted variant', () => {
    const { container } = render(<Button variant="muted">Muted</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('bg-muted');
  });

  test('applies small size', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('text-xs');
  });

  test('applies large size', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('h-11');
  });

  test('applies icon size', () => {
    const { container } = render(<Button size="icon">X</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('w-10');
  });

  test('applies custom className', () => {
    const { container } = render(<Button className="custom-cls">C</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('custom-cls');
  });

  test('handles click events', () => {
    let clicked = false;
    render(
      <Button
        onClick={() => {
          clicked = true;
        }}
      >
        Press
      </Button>,
    );
    fireEvent.click(screen.getByText('Press'));
    expect(clicked).toBe(true);
  });

  test('passes disabled attribute', () => {
    const { container } = render(<Button disabled>Nope</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.hasAttribute('disabled')).toBe(true);
  });

  test('buttonVariants generates class string', () => {
    const classes = buttonVariants({ variant: 'default', size: 'default' });
    expect(typeof classes).toBe('string');
    expect(classes).toContain('bg-primary');
  });

  test('has base classes for all variants', () => {
    const { container } = render(<Button>B</Button>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('inline-flex');
    expect(el.className).toContain('rounded-lg');
    expect(el.className).toContain('font-extrabold');
  });
  // .eq-btn (layer components) carries min-height:44px and padding 0 16px. size="icon" must
  // drop the padding (else its svg squeezes to 6px) and size="sm" the 44px floor (else it
  // renders as tall as a default button); default/lg/icon keep the 44px target on purpose.
  test('icon and sm sizes override the .eq-btn padding and min-height', () => {
    expect(buttonVariants({ size: 'sm' }).split(' ')).toContain('min-h-0');
    expect(buttonVariants({ size: 'icon' }).split(' ')).toContain('p-0');
  });
});
