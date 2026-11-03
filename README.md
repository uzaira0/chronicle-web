# Chronicle Web

Chronicle Web uses Bun, TypeScript, and React.

## Commands

- `bun run dev` starts the local development shell.
- `bun run dev:local` is the same loopback development launcher. Set `CHRONICLE_BACKEND_URL` to proxy the API to a backend.
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

## Configuration

The launchers read these optional environment variables. `.env.example` lists safe
local examples; Bun loads a local `.env` when present.

| Variable | Default | Use |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Development listener; the launcher requires loopback. |
| `PORT` | `5173` for development, `4173` for preview | Local HTTP listener port. |
| `CHRONICLE_BACKEND_URL` | Unset | Backend origin used by the API proxy. Without it, development and preview answer with synthetic auth and empty data. Real data is opt-in through this backend, which applies its app role and row-level security. |
| `CHRONICLE_INTERNAL_WEB_SECRET` | Unset | Internal proxy credential, when required by the selected backend. The launcher keeps it on the server. |
| `CHRONICLE_PROXY_BASE_URL` | `http://127.0.0.1:4173` | Playwright browser origin and preview listener port. Required for selfhost tests. |
| `CHRONICLE_E2E_REUSE_SERVER` | Unset | Set to `1` to let Playwright use an already served preview. |
| `CHRONICLE_E2E_SELFHOST` | Unset | Set to `1` to select the deployed selfhost journey. |
| `CHRONICLE_E2E_PUBLIC_BASE_URL` | Unset | Required for the selfhost journey: the deployment's public participant origin. |
| `CHRONICLE_E2E_DASHBOARD_PASSWORD` | Unset | Required for the selfhost journey: the deployment's dashboard password. |
| `CHRONICLE_DIRECT_BACKEND_URL` | `http://localhost:40320` | Backend origin for raw API probes that bypass the proxy. |

Browser error counters use the same-origin API. No telemetry endpoint setting is required.

## Boundaries

The operations, participant, and policy surfaces are being separated into independent
entrypoints. Shared code is limited to pure design primitives and generated wire
types. API behavior is defined by OpenAPI and canonical fixtures so a future Dioxus
or Tauri client can implement the same contract without copying React state or API
logic.

## Icons

Lucide is the default interface icon family. Equal icons use the same 2px stroke weight
through the shared stylesheet.
