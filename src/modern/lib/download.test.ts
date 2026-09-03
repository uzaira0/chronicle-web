import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { triggerBlobDownload } from './download';

type MockAnchor = {
  click: () => void;
  download: string;
  href: string;
  remove: () => void;
};

describe('triggerBlobDownload()', () => {
  let appendedChild: MockAnchor | null;
  let removedElement: MockAnchor | null;
  let clickedElement: MockAnchor | null;
  let createdObjectUrl: string;
  let revokedUrl: string;
  let savedDocument: Document;
  let savedURL: typeof URL;

  beforeEach(() => {
    appendedChild = null;
    removedElement = null;
    clickedElement = null;
    createdObjectUrl = '';
    revokedUrl = '';

    savedDocument = globalThis.document;
    savedURL = globalThis.URL;

    const anchor: MockAnchor = {
      click: () => {
        clickedElement = anchor;
      },
      download: '',
      href: '',
      remove: () => {
        removedElement = anchor;
      },
    };

    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          appendChild(child: MockAnchor) {
            appendedChild = child;
            return child;
          },
        },
        createElement(tag: string) {
          if (tag === 'a') return anchor;
          throw new Error(`Unexpected tag: ${tag}`);
        },
      },
      writable: true,
    });

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      value: {
        createObjectURL(blob: Blob) {
          createdObjectUrl = `blob:mock/${blob.size}`;
          return createdObjectUrl;
        },
        revokeObjectURL(url: string) {
          revokedUrl = url;
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: savedDocument, writable: true });
    Object.defineProperty(globalThis, 'URL', { configurable: true, value: savedURL, writable: true });
  });

  it('creates a temporary anchor, clicks it, and cleans up', () => {
    const blob = new Blob(['test data'], { type: 'text/csv' });
    triggerBlobDownload(blob, 'export.csv');

    expect(appendedChild).toBeTruthy();
    expect(clickedElement).toBe(appendedChild);
    expect(removedElement).toBe(appendedChild);
    expect(appendedChild?.download).toBe('export.csv');
  });

  it('creates and revokes an object URL', () => {
    const blob = new Blob(['x']);
    triggerBlobDownload(blob, 'file.txt');

    expect(createdObjectUrl).toStartWith('blob:');
    expect(revokedUrl).toBe(createdObjectUrl);
  });

  it('sets the href to the object URL', () => {
    const blob = new Blob(['data']);
    triggerBlobDownload(blob, 'out.bin');

    expect(appendedChild?.href).toBe(createdObjectUrl);
  });

  it('sanitizes illegal path separators in filenames', () => {
    const blob = new Blob(['data']);
    triggerBlobDownload(blob, 'path/to/file.txt');
    expect(appendedChild?.download).toBe('path_to_file.txt');

    // Windows-style backslash separators AND the drive-colon are both replaced.
    triggerBlobDownload(blob, 'C:\\windows\\system32\\cmd.exe');
    expect(appendedChild?.download).toBe('C__windows_system32_cmd.exe');
  });

  it('sanitizes path traversal sequences in filenames', () => {
    const blob = new Blob(['data']);
    triggerBlobDownload(blob, '../../etc/passwd');
    expect(appendedChild?.download).toBe('______etc_passwd');
  });

  it('sanitizes Windows reserved characters', () => {
    const blob = new Blob(['data']);
    triggerBlobDownload(blob, 'a:b*c?d"e<f>g|h.txt');
    // Each of : * ? " < > | becomes _
    expect(appendedChild?.download).toBe('a_b_c_d_e_f_g_h.txt');
  });
});
