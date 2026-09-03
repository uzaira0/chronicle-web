import React from 'react';
import ReactDOM from 'react-dom/client';

import '@/styles/index.css';
import { ModernApp } from '@/app/modern-app';
import { ObservabilityErrorBoundary } from '@/components/error-boundary';
import { initGlobalErrorHandlers, initWebVitals } from '@/lib/observability';

// Initialize frontend observability (error handlers + Web Vitals)
initGlobalErrorHandlers();
initWebVitals();

const rootElement = document.getElementById('app');

if (!rootElement) {
  // developer-only: the HTML shell is broken, no UI can render
  // ast-grep-ignore: web-i18n-error-message
  throw new Error('Chronicle app root element not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ObservabilityErrorBoundary>
      <ModernApp />
    </ObservabilityErrorBoundary>
  </React.StrictMode>,
);
