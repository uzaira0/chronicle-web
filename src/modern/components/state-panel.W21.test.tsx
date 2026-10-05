import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';

import { LanguageProvider } from '@/i18n';

import { StatePanel } from './state-panel';

describe('query error recovery', () => {
  test('route error panels call their query refetch and expose disabled loading feedback', () => {
    const routeFiles = [
      '../routes/study-participants-page.tsx',
      '../routes/study-details-page.tsx',
      '../routes/study-settings-audit-page.tsx',
      '../routes/study-bulk-downloads-page.tsx',
    ];
    for (const path of routeFiles) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf-8');
      expect(source).toContain('onRetry=');
      expect(source).toContain('isRetrying=');
    }

    const retry = mock(() => undefined);
    const view = render(
      <LanguageProvider initialSearch="">
        <StatePanel
          description="The request failed."
          icon={<span />}
          isRetrying
          onRetry={retry}
          title="Failed to load"
          tone="destructive"
        />
      </LanguageProvider>,
    );
    const button = screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();

    view.rerender(
      <LanguageProvider initialSearch="">
        <StatePanel
          description="The request failed."
          icon={<span />}
          isRetrying={false}
          onRetry={retry}
          title="Failed to load"
          tone="destructive"
        />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
