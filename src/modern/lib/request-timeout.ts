/** Budget for one API round trip: a backend that hangs with the socket open fails instead of spinning. */
export const REQUEST_TIMEOUT_MS = 30_000;
/** Downloads stream a whole export, so they get a long budget rather than none. */
export const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

/**
 * An AbortSignal that fires a TimeoutError after `ms`. Built on setTimeout rather than
 * AbortSignal.timeout so tests can drive it with fake timers; the behaviour is the same.
 */
export function timeoutSignal(ms: number = REQUEST_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The request timed out.', 'TimeoutError')), ms);
  return controller.signal;
}
