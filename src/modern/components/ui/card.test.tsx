import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  test('renders children', () => {
    render(<Card>Card body</Card>);
    expect(screen.getByText('Card body')).toBeTruthy();
  });

  test('renders as div', () => {
    const { container } = render(<Card>C</Card>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
  });

  test('has base classes', () => {
    const { container } = render(<Card>C</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('eq-card');
    expect(el.className).toContain('rounded-lg');
    expect(el.className).toContain('border');
    expect(el.className).toContain('shadow-sm');
  });

  test('applies custom className', () => {
    const { container } = render(<Card className="card-extra">C</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('card-extra');
  });

  test('passes through HTML attributes', () => {
    render(
      <Card data-testid="my-card" role="region">
        C
      </Card>,
    );
    expect(screen.getByTestId('my-card').getAttribute('role')).toBe('region');
  });
});

describe('CardHeader', () => {
  test('renders children', () => {
    render(<CardHeader>Header content</CardHeader>);
    expect(screen.getByText('Header content')).toBeTruthy();
  });

  test('has header classes', () => {
    const { container } = render(<CardHeader>H</CardHeader>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('flex');
    expect(el.className).toContain('flex-col');
    expect(el.className).toContain('px-6');
  });

  test('applies custom className', () => {
    const { container } = render(<CardHeader className="hdr-cls">H</CardHeader>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('hdr-cls');
  });
});

describe('CardTitle', () => {
  test('renders as h3', () => {
    const { container } = render(<CardTitle>Title</CardTitle>);
    expect(container.firstElementChild?.tagName).toBe('H3');
  });

  test('renders children', () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText('My Title')).toBeTruthy();
  });

  test('has title classes', () => {
    const { container } = render(<CardTitle>T</CardTitle>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('font-semibold');
    expect(el.className).toContain('text-lg');
  });
});

describe('CardDescription', () => {
  test('renders as p', () => {
    const { container } = render(<CardDescription>Desc</CardDescription>);
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  test('renders children', () => {
    render(<CardDescription>Some description</CardDescription>);
    expect(screen.getByText('Some description')).toBeTruthy();
  });

  test('has description classes', () => {
    const { container } = render(<CardDescription>D</CardDescription>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('text-sm');
    expect(el.className).toContain('text-muted-foreground');
  });
});

describe('CardContent', () => {
  test('renders children', () => {
    render(<CardContent>Content here</CardContent>);
    expect(screen.getByText('Content here')).toBeTruthy();
  });

  test('has content padding classes', () => {
    const { container } = render(<CardContent>C</CardContent>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('px-6');
    expect(el.className).toContain('py-5');
  });
});

describe('CardFooter', () => {
  test('renders children', () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  test('has footer classes', () => {
    const { container } = render(<CardFooter>F</CardFooter>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('flex');
    expect(el.className).toContain('items-center');
    expect(el.className).toContain('p-6');
  });
});
