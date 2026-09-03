export class CleanupStack {
  private readonly stack: Array<() => Promise<void>> = [];

  push(action: () => Promise<void>): void {
    this.stack.push(action);
  }

  async runAll(swallowExceptions = true): Promise<void> {
    const failures: unknown[] = [];

    while (this.stack.length > 0) {
      const action = this.stack.pop();
      if (!action) {
        throw new Error('Cleanup stack invariant violated.');
      }
      try {
        await action();
      } catch (e) {
        if (swallowExceptions) {
          console.warn('[CleanupStack] cleanup action failed (continuing teardown):', e);
        } else {
          failures.push(e);
        }
      }
    }

    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, `${failures.length} cleanup actions failed`);
    }
  }
}
