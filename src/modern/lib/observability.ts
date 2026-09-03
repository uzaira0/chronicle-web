/**
 * Frontend observability: error reporting and Web Vitals performance monitoring.
 *
 * Reports to a configurable backend endpoint when VITE_TELEMETRY_ENDPOINT is set.
 * All reports are fire-and-forget (non-blocking, no retry). Local deployments
 * leave the endpoint unset because there is no frontend telemetry ingest route.
 *
 * No PII is collected: only error messages, component stacks, page URLs (path only),
 * and Web Vitals metrics (LCP, FID, CLS, TTFB, INP).
 */

// Configurable endpoint — set via VITE_TELEMETRY_ENDPOINT to enable reporting.
const TELEMETRY_ENDPOINT: string | null = (() => {
  try {
    const env = (import.meta as unknown as Record<string, Record<string, string>>).env;
    return env?.VITE_TELEMETRY_ENDPOINT || null;
  } catch {
    return null;
  }
})();

interface ErrorReport {
  type: 'error';
  message: string;
  stack?: string | undefined;
  componentStack?: string | undefined;
  url: string;
  timestamp: string;
  userAgent: string;
}

interface WebVitalReport {
  type: 'web-vital';
  name: string;
  value: number;
  rating: string;
  url: string;
  timestamp: string;
}

type TelemetryReport = ErrorReport | WebVitalReport;

// Batch and debounce reports to reduce network chatter
const reportQueue: TelemetryReport[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 20;

function enqueueReport(report: TelemetryReport): void {
  if (!TELEMETRY_ENDPOINT) return;

  reportQueue.push(report);

  if (reportQueue.length >= MAX_BATCH_SIZE) {
    flushReports();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushReports, FLUSH_INTERVAL_MS);
  }
}

function flushReports(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (reportQueue.length === 0) return;
  if (!TELEMETRY_ENDPOINT) return;

  const batch = reportQueue.splice(0, MAX_BATCH_SIZE);

  // Fire-and-forget: don't await, don't retry
  try {
    const runtimeNavigator = Reflect.get(globalThis, 'navigator') as Navigator | undefined;
    if (runtimeNavigator?.sendBeacon) {
      runtimeNavigator.sendBeacon(TELEMETRY_ENDPOINT, JSON.stringify(batch));
    } else {
      fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      }).catch(() => {
        // Silently drop — telemetry should never break the app
      });
    }
  } catch {
    // Silently drop
  }
}

/**
 * Report a caught error to the telemetry endpoint.
 * Safe to call from error boundaries or global handlers.
 */
export function reportError(error: Error, componentStack?: string): void {
  const report: ErrorReport = {
    type: 'error',
    message: error.message || 'Unknown error',
    stack: error.stack?.substring(0, 2000),
    componentStack: componentStack?.substring(0, 1000),
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  };

  enqueueReport(report);
}

/**
 * Report a Web Vital metric.
 */
function reportWebVital(name: string, value: number, rating: string): void {
  const report: WebVitalReport = {
    type: 'web-vital',
    name,
    value,
    rating,
    url: typeof window !== 'undefined' ? window.location.pathname : '',
    timestamp: new Date().toISOString(),
  };

  enqueueReport(report);
}

/**
 * Initialize Web Vitals monitoring using the PerformanceObserver API.
 * Does not require the `web-vitals` npm package — uses native browser APIs.
 *
 * Metrics collected:
 * - LCP (Largest Contentful Paint)
 * - CLS (Cumulative Layout Shift)
 * - INP (Interaction to Next Paint)
 * - TTFB (Time to First Byte)
 */
export function initWebVitals(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }

  // LCP — Largest Contentful Paint
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries.at(-1);
      if (lastEntry) {
        const value = lastEntry.startTime;
        const rating = value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
        reportWebVital('LCP', value, rating);
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // Observer not supported
  }

  // CLS — Cumulative Layout Shift
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShiftEntry = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!layoutShiftEntry.hadRecentInput) {
          clsValue += layoutShiftEntry.value;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    // Report CLS when page is hidden (final value)
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          const rating = clsValue <= 0.1 ? 'good' : clsValue <= 0.25 ? 'needs-improvement' : 'poor';
          reportWebVital('CLS', clsValue, rating);
        }
      },
      { once: true },
    );
  } catch {
    // Observer not supported
  }

  // TTFB — Time to First Byte
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as
      | (PerformanceNavigationTiming & { responseStart: number; requestStart: number })
      | undefined;
    if (navEntry && navEntry.responseStart > 0) {
      const ttfb = navEntry.responseStart - navEntry.requestStart;
      const rating = ttfb <= 800 ? 'good' : ttfb <= 1800 ? 'needs-improvement' : 'poor';
      reportWebVital('TTFB', ttfb, rating);
    }
  } catch {
    // Navigation timing not available
  }
}

/**
 * Install a global unhandled error/rejection listener.
 * Call once at app startup.
 */
export function initGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    if (event.error instanceof Error) {
      reportError(event.error);
    } else {
      reportError(new Error(event.message || 'Unhandled error'));
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    if (reason instanceof Error) {
      reportError(reason);
    } else {
      reportError(new Error(typeof reason === 'string' && reason ? reason : 'Unhandled promise rejection'));
    }
  });

  // Flush on page unload
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushReports();
    }
  });
}
