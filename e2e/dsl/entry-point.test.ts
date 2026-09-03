import { describe, expect, it, mock } from 'bun:test';
import type { BrowserContext } from '@playwright/test';
import type { ProvidersBundle } from './di/providers-bundle.js';
import { chronicleScenario } from './entry-point.js';

const context = {} as BrowserContext;
const providers = {} as ProvidersBundle;

async function captureFailure(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('chronicleScenario cleanup', () => {
  it('fails a successful scenario when cleanup fails, after attempting every action', async () => {
    const cleanupFailure = new Error('cleanup failed');
    const order: number[] = [];

    const failure = await captureFailure(
      chronicleScenario(context, providers, (scenario) => {
        scenario.ctx.pushCleanup(() => {
          order.push(1);
          return Promise.resolve();
        });
        scenario.ctx.pushCleanup(() => {
          order.push(2);
          return Promise.reject(cleanupFailure);
        });
        scenario.ctx.pushCleanup(() => {
          order.push(3);
          return Promise.resolve();
        });
        return Promise.resolve();
      }),
    );

    expect(failure).toBe(cleanupFailure);
    expect(order).toEqual([3, 2, 1]);
  });

  it('preserves the primary scenario failure while still attempting every cleanup action', async () => {
    const primaryFailure = new Error('scenario failed');
    const cleanupFailure = new Error('cleanup failed');
    const order: number[] = [];
    const warn = mock(() => undefined);
    const originalWarn = console.warn;
    console.warn = warn;

    let failure: unknown;
    try {
      failure = await captureFailure(
        chronicleScenario(context, providers, (scenario) => {
          scenario.ctx.pushCleanup(() => {
            order.push(1);
            return Promise.resolve();
          });
          scenario.ctx.pushCleanup(() => {
            order.push(2);
            return Promise.reject(cleanupFailure);
          });
          scenario.ctx.pushCleanup(() => {
            order.push(3);
            return Promise.resolve();
          });
          return Promise.reject(primaryFailure);
        }),
      );
    } finally {
      console.warn = originalWarn;
    }

    expect(failure).toBe(primaryFailure);
    expect(order).toEqual([3, 2, 1]);
    expect(warn).toHaveBeenCalled();
  });
});
