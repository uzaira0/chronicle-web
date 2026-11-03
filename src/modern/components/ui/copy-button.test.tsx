import { afterEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from './copy-button';

const writeTextMock = mock((text: string) => Promise.resolve(text).then(() => undefined));
let copyResult = true;

// Spread the real module: mock.module is process-wide, so a partial stub leaks into later files.
const realParticipantLinks = await import('@/lib/participant-links');

await mock.module('@/lib/participant-links', () => ({
  ...realParticipantLinks,
  copyToClipboard: async (text: string) => {
    await writeTextMock(text);
    return copyResult;
  },
}));

describe('CopyButton', () => {
  afterEach(() => {
    cleanup();
    writeTextMock.mockClear();
    copyResult = true;
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

  it.each(['false', 'rejection'])('shows accessible manual-copy guidance on %s', async (outcome) => {
    copyResult = false;
    if (outcome === 'rejection') writeTextMock.mockRejectedValueOnce(new Error('Clipboard denied'));
    render(<CopyButton aria-label="Copy enrollment link" value="https://chronicle.test/enrollment" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy enrollment link' }));
    const failure = await screen.findByRole('alert');
    expect(failure.textContent).toBe('Copy failed. Select the displayed text and copy it manually.');
    expect(failure.classList.contains('sr-only')).toBe(false);
    expect(screen.queryByLabelText('Copied!')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(document.querySelector('svg.lucide-check')).toBeNull();
  });
});
