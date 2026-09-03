import { describe, expect, it, mock } from 'bun:test';
import { CleanupStack } from './cleanup-stack';

describe('CleanupStack', () => {
  it('runs actions in LIFO order', async () => {
    const order: number[] = [];
    const stack = new CleanupStack();
    stack.push(() => {
      order.push(1);
      return Promise.resolve();
    });
    stack.push(() => {
      order.push(2);
      return Promise.resolve();
    });
    stack.push(() => {
      order.push(3);
      return Promise.resolve();
    });
    await stack.runAll(true);
    expect(order).toEqual([3, 2, 1]);
  });

  it('continues after a teardown failure when swallowExceptions=true', async () => {
    const order: number[] = [];
    const stack = new CleanupStack();
    stack.push(() => {
      order.push(1);
      return Promise.resolve();
    });
    stack.push(() => Promise.reject(new Error('boom')));
    stack.push(() => {
      order.push(3);
      return Promise.resolve();
    });
    const warn = mock(() => undefined);
    const orig = console.warn;
    console.warn = warn;
    try {
      await stack.runAll(true);
    } finally {
      console.warn = orig;
    }
    expect(order).toEqual([3, 1]);
    expect(warn).toHaveBeenCalled();
  });

  it('drains every action before rethrowing when swallowExceptions=false', async () => {
    const order: number[] = [];
    const stack = new CleanupStack();
    stack.push(() => {
      order.push(1);
      return Promise.resolve();
    });
    stack.push(() => {
      order.push(2);
      return Promise.reject(new Error('boom'));
    });
    stack.push(() => {
      order.push(3);
      return Promise.resolve();
    });

    await expect(stack.runAll(false)).rejects.toThrow('boom');
    expect(order).toEqual([3, 2, 1]);
  });

  it('drains the stack after runAll completes', async () => {
    const stack = new CleanupStack();
    stack.push(() => Promise.resolve());
    stack.push(() => Promise.resolve());
    await stack.runAll(true);
    // Pushing again and re-running should run only the new one.
    const order: number[] = [];
    stack.push(() => {
      order.push(99);
      return Promise.resolve();
    });
    await stack.runAll(true);
    expect(order).toEqual([99]);
  });
});
