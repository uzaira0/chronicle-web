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

      // Inline styles on purpose: this fallback must render even when the stylesheet or theme failed to load.
      /* eslint-disable shadcn/no-inline-styles -- stylesheet-independent crash fallback */
      return (
        <div
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
            maxWidth: '480px',
            margin: '80px auto',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '12px' }}>{t('error_boundary.title')}</h2>
          <p style={{ color: '#6b7280', marginBottom: '20px', lineHeight: 1.5 }}>{t('error_boundary.description')}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              background: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {t('common.try_again')}
          </button>
        </div>
      );
      /* eslint-enable shadcn/no-inline-styles */
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
