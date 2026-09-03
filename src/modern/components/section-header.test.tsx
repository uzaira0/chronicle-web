import { describe, expect, test } from 'bun:test';
import { render, screen } from '@testing-library/react';

import { SectionHeader } from './section-header';

describe('SectionHeader', () => {
  test('renders title and description', () => {
    render(<SectionHeader description="A description" title="My Title" />);
    expect(screen.getByText('My Title')).toBeTruthy();
    expect(screen.getByText('A description')).toBeTruthy();
  });

  test('renders eyebrow when provided', () => {
    render(<SectionHeader description="Desc" eyebrow="BETA" title="Title" />);
    expect(screen.getByText('BETA')).toBeTruthy();
  });

  test('does not render eyebrow element when not provided', () => {
    const { container } = render(<SectionHeader description="Desc" title="Title" />);
    const eyebrowEl = container.querySelector('.tracking-\\[0\\.15em\\]');
    expect(eyebrowEl).toBeNull();
  });

  test('renders icon alongside eyebrow', () => {
    render(
      <SectionHeader description="Desc" eyebrow="STATUS" icon={<span data-testid="test-icon">*</span>} title="Title" />,
    );
    expect(screen.getByTestId('test-icon')).toBeTruthy();
  });

  test('does not render icon without eyebrow', () => {
    render(<SectionHeader description="Desc" icon={<span data-testid="orphan-icon">*</span>} title="Title" />);
    // The icon is only rendered inside the eyebrow container
    expect(screen.queryByTestId('orphan-icon')).toBeNull();
  });

  test('renders actions when provided', () => {
    render(
      <SectionHeader
        actions={
          <button type="button" data-testid="action-btn">
            Click
          </button>
        }
        description="Desc"
        title="Title"
      />,
    );
    expect(screen.getByTestId('action-btn')).toBeTruthy();
  });

  test('does not render actions container when not provided', () => {
    const { container } = render(<SectionHeader description="Desc" title="Title" />);
    const shrinkDiv = container.querySelector('.shrink-0');
    expect(shrinkDiv).toBeNull();
  });

  test('applies custom className', () => {
    const { container } = render(<SectionHeader className="extra-class" description="Desc" title="Title" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('extra-class');
  });
});
