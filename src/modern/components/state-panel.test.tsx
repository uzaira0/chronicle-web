import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';

import { StatePanel, TableSkeleton } from './state-panel';

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

  // design-review DR20: feedback panels are announced; errors assertively, the rest politely.
  test('destructive tone is an alert; default tone is a status', () => {
    const { unmount } = render(<StatePanel {...defaultProps} tone="destructive" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Panel Title');
    unmount();
    render(<StatePanel {...defaultProps} />);
    expect(screen.getByRole('status').textContent).toContain('Panel Title');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // production-readiness U4: a load failure offers a retry instead of a full page reload.
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

// production-readiness U2: loading states are content-shaped skeletons, not a lone spinner.
describe('TableSkeleton', () => {
  test('is a busy status region named by its label, with pulsing rows and no spinner', () => {
    const { container } = render(<TableSkeleton label="Fetching participants" rows={4} />);
    const region = screen.getByRole('status', { name: 'Fetching participants' });
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('.animate-pulse').length).toBe(4);
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

  test.each([
    '../routes/study-participants-page.tsx',
    '../routes/study-compliance-page.tsx',
    '../routes/study-settings-audit-page.tsx',
    '../routes/study-questionnaires-page.tsx',
    '../routes/study-bulk-downloads-page.tsx',
    '../routes/study-time-use-diary-page.tsx',
    '../routes/study-preprocessing-page.tsx',
    '../routes/study-layout.tsx',
  ])('%s loads with a skeleton, not a spinner panel', (path) => {
    const source = read(path);
    expect(source).toMatch(/<(Table|Route)Skeleton/);
    expect(source).not.toContain("eyebrow={t('common.loading')}");
    expect(source).not.toContain('icon={<LoaderCircle');
  });

  test('route chunks load behind a skeleton, not a blank fallback', () => {
    const source = read('../app/router.tsx');
    expect(source).not.toContain('fallback={null}');
    expect(source).toContain('<Suspense fallback={<RouteSkeleton');
  });
});

// production-readiness U4: every page-level load error can be retried in place.
describe('load-error panels', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

  test.each([
    ['../routes/studies-page.tsx', 'refetchStudies'],
    ['../routes/overview-page.tsx', 'onRetry'],
    ['../routes/study-layout.tsx', 'refetchStudy'],
    ['../routes/study-questionnaires-page.tsx', 'refetchQuestionnaires'],
    ['../routes/study-preprocessing-page.tsx', 'refetchStudy'],
  ])('%s passes a retry to its load-error panel', (path, retry) => {
    expect(read(path)).toMatch(new RegExp(`onRetry=\\{${retry}\\}`));
  });
});

// production-readiness U3: empty lists point at the next action.
describe('empty study lists', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');

  test('overview links to the studies page when there are none', () => {
    const source = read('../routes/overview-page.tsx');
    const empty = source.slice(
      source.indexOf("t('overview.no_studies')") - 400,
      source.indexOf("t('overview.no_studies')") + 400,
    );
    expect(empty).toContain('to="/studies"');
  });

  test('studies page offers study creation when the catalog is empty', () => {
    const source = read('../routes/studies-page.tsx');
    expect(source).toContain('const createStudyDialog = <StudyFormDialog mode="create"');
    expect(source).toContain("const emptyCatalogAction = searchQuery.trim() === '' && createStudyDialog;");
    const at = source.indexOf("t('studies.no_results_description')");
    expect(source.slice(at - 200, at)).toContain('actions={emptyCatalogAction}');
  });
});
