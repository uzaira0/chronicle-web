import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { StatePanel } from './state-panel';

describe('StatePanel', () => {
  const defaultProps = {
    description: 'Something happened',
    icon: <span data-testid="icon">!</span>,
    title: 'Panel Title',
  };

  test('renders title and description', () => {
    render(<StatePanel {...defaultProps} />);
    expect(screen.getByText('Panel Title')).toBeTruthy();
    expect(screen.getByText('Something happened')).toBeTruthy();
  });

  test('renders icon', () => {
    render(<StatePanel {...defaultProps} />);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  test('renders eyebrow when provided', () => {
    render(<StatePanel {...defaultProps} eyebrow="WARNING" />);
    expect(screen.getByText('WARNING')).toBeTruthy();
  });

  test('does not render eyebrow span when not provided', () => {
    const { container } = render(<StatePanel {...defaultProps} />);
    const eyebrowSpan = container.querySelector('.tracking-\\[0\\.24em\\]');
    expect(eyebrowSpan).toBeNull();
  });

  test('renders actions when provided', () => {
    render(
      <StatePanel
        {...defaultProps}
        actions={
          <button type="button" data-testid="act">
            Go
          </button>
        }
      />,
    );
    expect(screen.getByTestId('act')).toBeTruthy();
  });

  test('does not render CardContent when no actions', () => {
    const { container } = render(<StatePanel {...defaultProps} />);
    // CardContent applies px-6 py-5. CardHeader also applies px-6 py-5.
    // Without actions, there should be only the header div with those classes.
    const contentDivs = container.querySelectorAll('.px-6.py-5');
    expect(contentDivs.length).toBe(1); // only CardHeader
  });

  test('applies destructive tone classes', () => {
    const { container } = render(<StatePanel {...defaultProps} tone="destructive" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('border-destructive/40');
  });

  test('applies custom className', () => {
    const { container } = render(<StatePanel {...defaultProps} className="test-cls" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('test-cls');
  });
});
