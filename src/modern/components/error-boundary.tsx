/**
 * React error boundary with telemetry reporting.
 *
 * Catches render errors in the subtree and:
 * 1. Reports the error to the backend telemetry endpoint (via observability.ts)
 * 2. Renders a user-friendly fallback UI
 * 3. Supports retry via a "Try again" button
 *
 * Usage:
 *   <ObservabilityErrorBoundary>
 *     <YourComponent />
 *   </ObservabilityErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router';
import { createTranslator, getCurrentLanguage } from '@/i18n';
import { reportError } from '@/lib/observability';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  // Only `hasError` drives rendering. The error object itself is intentionally
  // NOT stored/shown — raw error detail could leak PHI in a HIPAA UI; it is
  // captured out-of-band via componentDidCatch -> reportError (telemetry).
  hasError: boolean;
  // A lazy route chunk that failed to download fails again on a re-render; only a reload
  // fetches it afresh (after a deploy the old chunk name may be gone too).
  chunkLoadFailed: boolean;
}

const CHUNK_LOAD_FAILURE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i;

export class ObservabilityErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { chunkLoadFailed: false, hasError: false };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : '';
    return { chunkLoadFailed: CHUNK_LOAD_FAILURE.test(message), hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report to telemetry endpoint (fire-and-forget)
    reportError(error, errorInfo.componentStack ?? undefined);
  }

  handleRetry = (): void => {
    if (this.state.chunkLoadFailed) {
      window.location.reload();
      return;
    }
    this.setState({ chunkLoadFailed: false, hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // Class components cannot use the language hook; read the persisted choice directly.
      const { t } = createTranslator(getCurrentLanguage());

      return (
        <div className="mx-auto my-20 max-w-lg px-5 py-10 text-center font-sans text-foreground">
          <h2 className="mb-3 text-xl font-semibold">{t('error_boundary.title')}</h2>
          <p className="mb-5 leading-6 text-muted-foreground">{t('error_boundary.description')}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md border border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t('common.try_again')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * The routed page behind its own boundary, so one page's render error leaves the shell and
 * its navigation usable. Keyed by path: navigating away clears the error.
 */
export function RouteOutlet() {
  const { pathname } = useLocation();
  return (
    <ObservabilityErrorBoundary key={pathname}>
      <Outlet />
    </ObservabilityErrorBoundary>
  );
}
