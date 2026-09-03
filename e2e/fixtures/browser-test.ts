import {
  expect,
  test as base,
  type Page,
  type WebError,
} from '@playwright/test';

type BrowserSafetyFixtures = {
  failOnWebErrors: void;
};

export const test = base.extend<BrowserSafetyFixtures>({
  failOnWebErrors: [
    async ({ context }, use) => {
      const webErrors: string[] = [];
      const crashedPages: string[] = [];
      const crashListeners = new Map<Page, () => void>();
      const recordWebError = (webError: WebError) => {
        const error = webError.error();
        const pageUrl = webError.page()?.url() ?? '<detached page>';
        webErrors.push(`${pageUrl}\n${error.stack ?? error.message}`);
      };
      const watchPageCrash = (page: Page) => {
        const recordCrash = () => {
          crashedPages.push(page.url());
        };
        crashListeners.set(page, recordCrash);
        page.on('crash', recordCrash);
      };

      // BrowserContext-level web errors cover every current and future page,
      // including popups. Page crash listeners cover renderer termination,
      // which does not emit a web-error event.
      context.on('weberror', recordWebError);
      context.on('page', watchPageCrash);
      for (const page of context.pages()) {
        watchPageCrash(page);
      }

      try {
        await use();
        expect(
          { crashedPages, webErrors },
          [
            `Unhandled browser errors must fail the test:\n${webErrors.join('\n\n')}`,
            `Renderer crashes must fail the test:\n${crashedPages.join('\n')}`,
          ].join('\n\n'),
        ).toEqual({ crashedPages: [], webErrors: [] });
      } finally {
        context.off('weberror', recordWebError);
        context.off('page', watchPageCrash);
        for (const [page, listener] of crashListeners) {
          page.off('crash', listener);
        }
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
