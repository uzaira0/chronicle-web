// This is a browser-runtime boundary, not a promise that Vite injects `env`.
// Bun leaves it absent in production bundles.
interface ImportMeta {
  readonly env?: {
    readonly DEV?: boolean;
  };
}
