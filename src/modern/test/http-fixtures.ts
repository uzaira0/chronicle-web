/** Resolves RTK's relative request URLs against a dummy origin outside the browser. */
export function installRelativeRequest(): () => void {
  const SavedRequest = globalThis.Request;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Request');
  class RelativeRequest extends SavedRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
    }
  }
  Object.defineProperty(globalThis, 'Request', { configurable: true, value: RelativeRequest, writable: true });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'Request', descriptor);
    else Reflect.deleteProperty(globalThis, 'Request');
  };
}
