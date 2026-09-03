import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { FieldHint } from './field-hint';

describe('FieldHint', () => {
  test('renders children text', () => {
    render(<FieldHint>Required field</FieldHint>);
    expect(screen.getByText('Required field')).toBeTruthy();
  });

  test('renders as a p element', () => {
    const { container } = render(<FieldHint>Hint</FieldHint>);
    expect(container.firstElementChild?.tagName).toBe('P');
  });

  test('has base styling classes', () => {
    const { container } = render(<FieldHint>Hint</FieldHint>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('text-xs');
    expect(el.className).toContain('text-muted-foreground');
  });

  test('applies custom className', () => {
    const { container } = render(<FieldHint className="extra">Hint</FieldHint>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('extra');
  });

  test('renders ReactNode children', () => {
    render(
      <FieldHint>
        <em data-testid="em-hint">Italic hint</em>
      </FieldHint>,
    );
    expect(screen.getByTestId('em-hint').textContent).toBe('Italic hint');
  });
});
