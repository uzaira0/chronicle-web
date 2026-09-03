import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { copyToClipboard } from './participant-links';

// copyToClipboard has two paths:
//   1. modern `navigator.clipboard.writeText` (secure context) — returns true
//      on success, falls through to the legacy path on rejection.
//   2. legacy `document.execCommand('copy')` fallback — returns the boolean
//      execCommand result, or false if the DOM ops throw.
// We stub `navigator` and `document` directly to drive each branch.

type NavStub = { clipboard?: { writeText?: (t: string) => Promise<void> } };

let savedNavigator: PropertyDescriptor | undefined;
let savedDocument: PropertyDescriptor | undefined;

function setNavigator(nav: NavStub | undefined) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: nav,
    writable: true,
  });
}

function setDocument(doc: unknown) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: doc,
    writable: true,
  });
}

// A minimal fake DOM whose execCommand result and append/remove are observable.
function makeFakeDocument(execResult: boolean | (() => boolean)) {
  const created: Array<Record<string, unknown>> = [];
  const appended: unknown[] = [];
  let removed = 0;
  const body = {
    appendChild(node: unknown) {
      appended.push(node);
    },
  };
  return {
    doc: {
      body,
      createElement() {
        const el: Record<string, unknown> = {
          remove() {
            removed += 1;
          },
          select() {},
          style: {},
          value: '',
        };
        created.push(el);
        return el;
      },
      execCommand() {
        return typeof execResult === 'function' ? execResult() : execResult;
      },
    },
    get appended() {
      return appended;
    },
    get created() {
      return created;
    },
    get removed() {
      return removed;
    },
  };
}

describe('copyToClipboard()', () => {
  beforeEach(() => {
    savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  });

  afterEach(() => {
    if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
    else delete (globalThis as Partial<typeof globalThis>).navigator;
    if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
    else delete (globalThis as Partial<typeof globalThis>).document;
  });

  it('returns true and uses the modern clipboard API when available', async () => {
    let written: string | undefined;
    setNavigator({
      clipboard: {
        writeText(t: string) {
          written = t;
          return Promise.resolve();
        },
      },
    });
    // Document should NOT be touched on the modern path; point it at a thrower.
    setDocument({
      createElement() {
        throw new Error('legacy path must not run');
      },
    });

    expect(await copyToClipboard('hello')).toBe(true);
    expect(written).toBe('hello');
  });

  it('falls through to the legacy path when the modern API rejects, returning execCommand result', async () => {
    setNavigator({
      clipboard: {
        writeText: () => Promise.reject(new Error('not allowed')),
      },
    });
    const fake = makeFakeDocument(true);
    setDocument(fake.doc);

    expect(await copyToClipboard('text-A')).toBe(true);
    // Legacy fallback actually ran: created a textarea, appended, and removed it.
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.value).toBe('text-A');
    expect(fake.appended).toHaveLength(1);
    expect(fake.removed).toBe(1);
  });

  it('uses the legacy path when navigator.clipboard is absent (optional-chaining guard)', async () => {
    setNavigator({}); // no .clipboard
    const fake = makeFakeDocument(true);
    setDocument(fake.doc);

    expect(await copyToClipboard('text-B')).toBe(true);
    expect(fake.created).toHaveLength(1);
  });

  it('uses the legacy path when navigator.clipboard exists but writeText is missing', async () => {
    // `navigator.clipboard?.writeText` is falsy → modern path is skipped.
    setNavigator({ clipboard: {} });
    const fake = makeFakeDocument(true);
    setDocument(fake.doc);

    expect(await copyToClipboard('text-C')).toBe(true);
    expect(fake.created).toHaveLength(1);
  });

  it('returns false when the legacy execCommand reports failure', async () => {
    setNavigator({});
    const fake = makeFakeDocument(false);
    setDocument(fake.doc);

    expect(await copyToClipboard('text-D')).toBe(false);
    // textarea is still cleaned up before returning the false result.
    expect(fake.removed).toBe(1);
  });

  it('returns false when the legacy DOM operations throw', async () => {
    setNavigator({});
    setDocument({
      createElement() {
        throw new Error('jsdom-less environment');
      },
    });

    expect(await copyToClipboard('text-E')).toBe(false);
  });

  it('does not fall back to legacy when modern writeText succeeds with empty string', async () => {
    let calls = 0;
    setNavigator({
      clipboard: {
        writeText() {
          calls += 1;
          return Promise.resolve();
        },
      },
    });
    setDocument({
      createElement() {
        throw new Error('legacy path must not run');
      },
    });

    expect(await copyToClipboard('')).toBe(true);
    expect(calls).toBe(1);
  });
});
