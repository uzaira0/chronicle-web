import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// Clean up rendered DOM between tests by removing all child nodes
afterEach(() => {
  if (typeof document !== 'undefined' && document.body) {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  }
});
