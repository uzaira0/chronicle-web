import { describe, expect, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';

import { RouteSkeleton, StatePanel, TableSkeleton } from './state-panel';

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

  test('supports a page-level section heading when rendered inside a participant shell', () => {
    render(<StatePanel {...defaultProps} titleAs="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Panel Title' })).toBeTruthy();
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

  // Feedback panels are announced; errors assertively, the rest politely.
  test('destructive tone is an alert; default tone is a status', () => {
    const { unmount } = render(<StatePanel {...defaultProps} tone="destructive" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Panel Title');
    unmount();
    render(<StatePanel {...defaultProps} />);
    expect(screen.getByRole('status').textContent).toContain('Panel Title');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // A load failure offers a retry instead of a full page reload.
  test('onRetry renders a Try again button that calls it', () => {
    let calls = 0;
    render(<StatePanel {...defaultProps} onRetry={() => calls++} tone="destructive" />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(calls).toBe(1);
  });

  test('applies custom className', () => {
    const { container } = render(<StatePanel {...defaultProps} className="test-cls" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('test-cls');
  });
});

// Loading states are content-shaped skeletons, not a lone spinner.
describe('TableSkeleton', () => {
  test('is a busy status region named by its label, with pulsing rows and no spinner', () => {
    const { container } = render(<TableSkeleton label="Fetching participants" rows={4} />);
    const region = screen.getByRole('status', { name: 'Fetching participants' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('.animate-pulse').length).toBe(4);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});

test('RouteSkeleton announces a busy loading region with visible placeholders', () => {
  const { container } = render(<RouteSkeleton />);
  expect(screen.getByRole('status', { name: 'Loading…' }).getAttribute('aria-busy')).toBe('true');
  expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
});
