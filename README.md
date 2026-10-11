# Chronicle Web

Chronicle Web is the current Bun, TypeScript, and React application. The legacy
Webpack shell has been retired; do not add new legacy entrypoints or compatibility
commands.

## Commands

- `bun run dev` starts the local development shell.
- `bun run dev:local` binds to `127.0.0.1`, with synthetic auth and read-only queries against the local production database by default. Set `CHRONICLE_BACKEND_URL` to proxy the API to a backend.
- `bun run build` builds the production application into `dist/`.
- `bun run preview` serves the current production build.
- `bun run check` runs type, formatting, structural, and E2E-DSL checks.
- `bun run test` runs the Bun-native unit and UI suites.
- `bun run e2e` runs Playwright browser tests, building and starting its own preview server.
  Set `CHRONICLE_E2E_REUSE_SERVER=1` to reuse an existing server explicitly;
  `CHRONICLE_PROXY_BASE_URL` sets both the test URL and the started preview server's port.
  The API-backed specs need the backend harness on
  port 40320 first; from the monorepo root run
  `./gradlew :chronicle-server:test --tests "*PlaywrightBackendServer*" -Dchronicle.playwright.backend=true`.
- `bun run test:e2e:smoke` verifies that the production bundle mounts and its core shell works in Chromium.
- `bun run check:api-types` regenerates OpenAPI TypeScript types and fails on drift.

## Boundaries

The operations, participant, and policy surfaces are being separated into independent
entrypoints. Shared code is limited to pure design primitives and generated wire
types. API behavior is defined by OpenAPI and canonical fixtures so a future Dioxus
or Tauri client can implement the same contract without copying React state or API
logic. See `docs/architecture/RUST-MIGRATION-SEAMS.md` in the repository root.

## Preprocessing and icons

The preprocessing fallback opens GitHub Pages at
https://uzaira0.github.io/chronicle-android-raw-data-preprocessing-app/. GitHub receives
request metadata such as the network IP address and User-Agent when the page loads.
Selected export files are processed locally in the browser; they are not uploaded.

Lucide is the default interface icon family. Equal icons use the same 2px stroke weight
through the shared stylesheet.
