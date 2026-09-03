import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import '@/styles/index.css';
import { ModernApp } from '@/app/modern-app';

export default function renderModernShell() {
  const appRootNode = document.getElementById('app');

  if (!appRootNode) {
    // developer-only: the HTML shell is broken, no UI can render
    // ast-grep-ignore: web-i18n-error-message
    throw new Error('Chronicle app root element not found.');
  }

  const root = createRoot(appRootNode);
  root.render(
    <Suspense fallback="...">
      <ModernApp />
    </Suspense>,
  );
}
