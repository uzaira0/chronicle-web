import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import tailwindcss from '@tailwindcss/postcss';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import postcss from 'postcss';
import { Provider } from 'react-redux';
import english from '@/i18n/en/translation.json';
import { createApiStore } from '@/test/study-operations-store';
import { TRIAL_CA_PEM } from '@/test/trial-ca';
import { QrEnrollmentModal } from './qr-enrollment-modal';
import { StudySaveFooter } from './study-form/dialog-controls';
import { StudyFormDialogFrame } from './study-form/dialog-frame';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  Reflect.deleteProperty(window, '__CHRONICLE_RUNTIME_CONFIG__');
});

const screenshots = resolve('build/operator-test-runs/L08-dialogs');
mkdirSync(screenshots, { recursive: true });

const stylesheet = resolve('src/modern/styles/index.css');
const { css } = await postcss([tailwindcss() as unknown as postcss.AcceptedPlugin]).process(
  readFileSync(stylesheet, 'utf8'),
  { from: stylesheet },
);

test('default dialogs keep the close and copy controls reachable on short viewports', async () => {
  Reflect.set(window, '__CHRONICLE_RUNTIME_CONFIG__', {
    allowPrivateServerUrl: true,
    localCa: true,
    serverUrl: 'https://public-study.example.org',
  });
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === '/local-ca.crt') return Promise.resolve(new Response(TRIAL_CA_PEM));
    return Promise.resolve(Response.json({ accessCode: 'Viewport_123'.repeat(6) }));
  }) as typeof fetch;
  render(
    <Provider store={createApiStore()}>
      <QrEnrollmentModal onClose={() => {}} studyId="11111111-1111-4111-8111-111111111111" />
    </Provider>,
  );
  fireEvent.change(screen.getByLabelText(english.common.participant_id), { target: { value: 'CL-viewport-fixture' } });
  const show = screen.getByRole<HTMLButtonElement>('button', { name: english.qr_modal.issue });
  await waitFor(() => expect(show.disabled).toBe(false));
  fireEvent.click(show);
  expect((await screen.findByRole('img')).getAttribute('width')).toBe('384');
  const html = screen.getByRole('dialog').outerHTML;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 1366, height: 700 },
      { width: 851, height: 393 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.setContent(`<style>${css}</style>${html}`);
      const dialog = page.getByRole('dialog');
      const rect = await dialog.boundingBox();
      if (!rect) throw new Error('Dialog has no rendered bounds');
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
      const closeControl = page.getByRole('button', { name: 'Close' });
      await closeControl.scrollIntoViewIfNeeded();
      const closeTransition = await closeControl.evaluate((element) => {
        const style = getComputedStyle(element);
        return { property: style.transitionProperty, duration: style.transitionDuration };
      });
      expect(['all', 'none']).toContain(closeTransition.property);
      expect(closeTransition.duration).toBe('0s');
      const close = await closeControl.boundingBox();
      if (!close) throw new Error('Close control has no rendered bounds');
      expect(close.y).toBeGreaterThanOrEqual(0);
      expect(close.y + close.height).toBeLessThanOrEqual(viewport.height);
      await page.getByRole('button', { name: english.qr_modal.copy_link }).scrollIntoViewIfNeeded();
      const copy = await page.getByRole('button', { name: english.qr_modal.copy_link }).boundingBox();
      if (!copy) throw new Error('Copy control has no rendered bounds');
      expect(copy.y).toBeGreaterThanOrEqual(0);
      expect(copy.y + copy.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: `${screenshots}/enrollment-${viewport.width}x${viewport.height}.png` });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}, 20_000);

test('keyboard focused study fields clear the sticky save footer', async () => {
  const fields = Array.from({ length: 24 }, (_, index) => `Field ${index}`);
  render(
    <StudyFormDialogFrame canEdit={false} mode="create" open onOpenChange={() => {}} confirmations={null}>
      <form>
        {fields.map((field) => (
          <label className="block py-4" key={field}>
            {field}
            <input className="block h-10" />
          </label>
        ))}
        <StudySaveFooter canAttemptSave isSubmitting={false} mode="create" onCancel={() => {}} />
      </form>
    </StudyFormDialogFrame>,
  );
  const html = screen.getByRole('dialog').outerHTML;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 851, height: 393 } });
    await page.setContent(`<style>${css}</style><button>Before dialog</button>${html}`);
    await page.getByRole('button', { name: 'Before dialog' }).focus();
    for (let index = 0; index < 24; index += 1) {
      await page.keyboard.press('Tab');
      const geometry = await page.locator('input:focus').evaluate((input) => {
        const footer = input.closest('form')?.lastElementChild;
        if (!footer) throw new Error('Focused field has no save footer');
        return { bottom: input.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top };
      });
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.footerTop);
    }
    await page.screenshot({ path: `${screenshots}/study-form-keyboard-landscape.png` });
  } finally {
    await browser.close();
  }
}, 20_000);
