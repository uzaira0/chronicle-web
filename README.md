# Chronicle Web

Chronicle Web is the current Bun, TypeScript, and React application. The legacy
Webpack shell has been retired; do not add new legacy entrypoints or compatibility
commands.

## Commands

- `bun run dev` starts the local development shell.
- `bun run dev:local` starts the local backend-integrated development shell.
- `bun run build` builds the production application into `dist/`.
- `bun run preview` serves the current production build.
- `bun run check` runs type, formatting, structural, and E2E-DSL checks.
- `bun run test` runs the Bun-native unit and UI suites.
- `bun run e2e` runs Playwright browser tests.
- `bun run test:e2e:smoke` verifies that the production bundle mounts and its core shell works in Chromium.
- `bun run check:api-types` regenerates OpenAPI TypeScript types and fails on drift.

## Boundaries

The operations, participant, and policy surfaces are being separated into independent
entrypoints. Shared code is limited to pure design primitives and generated wire
types. API behavior is defined by OpenAPI and canonical fixtures so a future Dioxus
or Tauri client can implement the same contract without copying React state or API
logic. See `docs/architecture/RUST-MIGRATION-SEAMS.md` in the repository root.
