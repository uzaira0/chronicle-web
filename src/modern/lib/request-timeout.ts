/** Budget for one API round trip: a backend that hangs with the socket open fails instead of spinning. */
export const REQUEST_TIMEOUT_MS = 30_000;

/**
 * An AbortSignal that fires a TimeoutError after `ms`. Built on setTimeout rather than
 * AbortSignal.timeout so tests can drive it with fake timers; the behaviour is the same.
 */
export function timeoutSignal(ms: number = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The request timed out.', 'TimeoutError')), ms);
  return controller.signal;
}

/** AbortSignal.any (Baseline 2024) with a fallback for browsers that predate it. */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true, signal: controller.signal });
  }
  return controller.signal;
}
