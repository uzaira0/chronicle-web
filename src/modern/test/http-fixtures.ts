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

export type FetchRoutes = Record<string, (request: Request) => Response | Promise<Response>>;

/** Every expected path and method is declared; handlers own state and response creation. */
export function routeFetch(routes: FetchRoutes): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const handler = routes[key];
    if (!handler) throw new Error(`Unexpected request: ${key}`);
    return handler(request);
  }) as typeof fetch;
}
