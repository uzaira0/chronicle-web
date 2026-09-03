import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from './copy-button';

const writeTextMock = mock((text: string) => Promise.resolve(text).then(() => undefined));

await mock.module('@/lib/participant-links', () => ({
  copyToClipboard: async (text: string) => {
    await writeTextMock(text);
    return true;
  },
}));

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    writeTextMock.mockClear();
  });

  it('renders with copy icon initially', () => {
    render(<CopyButton value="test-value" />);
    expect(screen.getByLabelText('Copy to clipboard')).toBeTruthy();
    expect(document.querySelector('svg.lucide-copy')).toBeTruthy();
  });

  it('shows check icon after clicking', async () => {
    render(<CopyButton value="test-value" />);
    const button = screen.getByLabelText('Copy to clipboard');

    fireEvent.click(button);

    expect(writeTextMock).toHaveBeenCalledWith('test-value');
    expect(await screen.findByLabelText('Copied!')).toBeTruthy();
    expect(document.querySelector('svg.lucide-check')).toBeTruthy();
  });

  it('reverts to copy icon after timeout', async () => {
    render(<CopyButton value="test-value" />);
    const button = screen.getByLabelText('Copy to clipboard');

    fireEvent.click(button);
    expect(await screen.findByLabelText('Copied!')).toBeTruthy();

    // Fast-forward 2 seconds
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });

    expect(screen.getByLabelText('Copy to clipboard')).toBeTruthy();
    expect(document.querySelector('svg.lucide-copy')).toBeTruthy();
  });

  it('applies custom aria-label', () => {
    render(<CopyButton aria-label="Copy PID" value="test-value" />);
    expect(screen.getByLabelText('Copy PID')).toBeTruthy();
  });
});
