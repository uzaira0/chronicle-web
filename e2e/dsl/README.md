# `chronicleScenario` E2E DSL

A fluent test DSL that drives Chronicle end-to-end through a real backend +
real browser. Same step vocabulary on both layers:

- **Backend (Kotlin)**: `chronicle-server/src/test/kotlin/.../e2e/scenarios/` — runs in-JVM against testcontainer Postgres + full Spring context.
- **Frontend (TypeScript / Playwright)**: `chronicle-web/e2e/dsl/` — runs a real browser against the same backend through a Bun preview proxy.

This README covers the **TypeScript** side. For the Kotlin side see the comparable scope hierarchy under `chronicle-server/.../e2e/dsl/`.

---

## Quick start

```ts
import { chronicleTest as test, expect } from './fixtures/chronicle-test';

test('my flow', async ({ scenario, providers }) => {
  await scenario(async (s) => {
    await s.asUser('test_admin', async (auth) => {
      await auth.study(providers.data.study('Demo'), async (study) => {
        await study.participant(providers.data.participant(), async (part) => {
          await part.device(providers.data.androidDevice(), async (dev) => {
            await dev.upload(providers.data.usageEvents(10), async (data) => {
              await data.flush();
            });
          });
        });
        await study.export({ dataTypes: ['UsageEvents'], participantIds: [/* … */], format: 'CSV' }, async (exp) => {
          const info = await exp.awaitCompletion({ timeoutMs: 30_000 });
          expect(info.status).toBe('COMPLETED');
          const bytes = await exp.download();
          expect(bytes.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
```

Any scope can branch into a **persona** that exercises the UI on top of the API-seeded data:

```ts
await auth.study(providers.data.study('Tab-Walk'), async (study) => {
  await study.asPersona('expert-researcher', async (persona) => {
    await persona.openSeededStudy();
    // persona.page is a Playwright Page authenticated as the user above
    await expect(persona.page.locator('main nav a').first()).toBeVisible();
  });
});
```

---

## Scope hierarchy

```
chronicleScenario
└─ ScenarioScope.asUser(userId)
    └─ AuthScope.study(spec) ────────────── .asPersona(name)  ◄─ no-seed personas
        ├─ StudyScope.participant(spec) ─── .asPersona(name)  ◄─ study-seeded personas
        │   └─ ParticipantScope.device ─── .asPersona(name)   ◄─ participant-seeded personas
        │       └─ DeviceScope.upload(events)
        │           └─ DataScope.flush() / .verify()
        └─ StudyScope.export(req)
            └─ ExportScope.awaitCompletion() / .download()
```

- Every scope owns its own teardown via `ScenarioContext.pushCleanup` (LIFO; failures swallow so one bad teardown doesn't strand the rest). Destructive cleanup uses a standalone cookie+CSRF request context captured immediately after authentication, so a Playwright timeout closing the browser context cannot strand seeded data.
- `asPersona(name, fn)` is mounted on `AuthScope`, `StudyScope`, and `ParticipantScope`; all three delegate to the shared `runPersona()` helper in `scopes/persona-scope.ts` to keep lifecycle (open page → run → close) in one place.

---

## Auth — and the bootstrap rewrite trick

**The bug we hit:** the DSL initially used `Authorization: Bearer <jwt>` for API calls and the browser used cookies for page navigation. They resolved to *different* security principals on the backend (different study-id partition prefixes — `00040000-` vs `00000000-`), so DSL-seeded studies returned 403/401 to subsequent page loads.

**Why:** the frontend's `bootstrap-auth.ts` re-fires `POST /chronicle/v3/auth/testing-login` with body `{}` on **every fresh page load**. `/v3/auth/session` always reports unauthenticated for cookie-bootstrapped sessions because Spring's `userPrincipal` is null for `/v3/auth/*` paths by design (the `ChronicleCookieOrBearerTokenResolver` returns null for those paths so the controllers can handle their own token lifecycle).

The backend defaults the empty body to `test_user1`, overwriting the DSL's `test_admin` cookies.

**The fix (lives in `scopes/scenario-scope.ts`):**

1. The DSL uses **cookie + CSRF** auth, not Bearer. `currentCsrfToken()` reads `ol_csrf_token` from `context.cookies()` *dynamically* on every API call, since the bootstrap rotates it.
2. `ScenarioScope.asUser` installs a `context.route()` handler that intercepts every empty-body POST to `/v3/auth/testing-login` and rewrites the body to inject the userId we authenticated as. The handler is `unroute`'d in a `try/finally` when the `asUser` block exits.
3. Before page bootstrap can rotate the browser cookies, `ScenarioScope.asUser` snapshots the authenticated cookie jar and CSRF token into a standalone request context. Resource cleanup uses `apiDeleteDurably()` with that state and disposes the request context last.

Both rules are pinned by `ast-grep` (`sgrules/no-bearer-in-dsl.yml`, `sgrules/no-inline-client-request-in-scopes.yml`) — regressions trip a CI error.

---

## SSOT: `dsl/constants.ts`

One module owns every well-known string the DSL touches:

| Constant | Value (default) | Override |
|---|---|---|
| `CSRF_COOKIE_NAME` | `ol_csrf_token` | — |
| `AUTH_COOKIE_NAME` | `chronicle_auth` | — |
| `TESTING_LOGIN_PATH` | `/chronicle/v3/auth/testing-login` | — |
| `SESSION_PATH` | `/chronicle/v3/auth/session` | — |
| `STABLE_UNAUTHENTICATED_SESSION` | deterministic public-session fixture | — |
| `FLUSH_PIPELINE_PATH` | `/chronicle/v3/admin/test-only/flush-pipeline` | — |
| `TESTING_LOGIN_ROUTE_GLOB` | `**/chronicle/v3/auth/testing-login` | — |
| `DIRECT_BACKEND_URL` | `http://localhost:40320` | `CHRONICLE_DIRECT_BACKEND_URL` |
| `PROXY_BASE_URL_DEFAULT` | `http://127.0.0.1:4173` | `CHRONICLE_PROXY_BASE_URL` |
| `HEADER_CSRF_TOKEN` | `X-CSRF-Token` | — |

Anywhere outside this module that hand-writes those strings is a regression risk and is enforced by `sgrules/no-raw-cookie-names.yml`, `sgrules/no-raw-auth-paths.yml`, `sgrules/no-hardcoded-test-host.yml`, `sgrules/no-hardcoded-direct-backend.yml`.

---

## Adding a new persona

Three steps:

1. Add the name to the `PersonaName` union in `scopes/persona-scope.ts`. (Stringly-typed; the union is the contract.)
2. Create `e2e/persona-<your-name>.spec.ts` driving through `auth.asPersona(...)` or `study.asPersona(...)`. Keep `test.describe.configure({ mode: 'serial' })` if any test calls `data.flush()` (the flush is process-global on the backend).
3. If the persona needs new helpers (e.g. another a11y-style assertion), add them as methods on `PersonaScope`. Generic helpers belong on the scope; persona-specific assertions live in the spec file.

The five canonical personas (expert-researcher, novice-user, adversary, accessibility, data-integrity-auditor) are documented in `chronicle-web/e2e/persona-*.spec.ts` headers.

The adversary persona is split into `persona-adversary.spec.ts` (UI stress) and `persona-adversary-api.spec.ts` (raw HTTP probes that don't need a browser).

---

## Adding a new scope step

Pattern (e.g. adding a `study.questionnaire(...)` builder):

1. In `scopes/study-scope.ts`, add an async method that:
   - calls `apiPost(this.client, ...)` to create the resource,
   - calls `this.ctx.pushCleanup(() => apiDeleteDurably(this.cleanupClient, ...))` to schedule teardown,
   - constructs a child scope and `await`s `block(child)`.
2. The child scope receives `(ctx, userId, client, cleanupClient, context, ...resourceIds)` and may itself host `asPersona` if a UI surface uses the resource.
3. Add unit tests at `dsl/scopes/<scope>.test.ts` for any non-trivial logic (route handlers, condition checks).

Don't:
- inline `client.request.post/get/delete` (use `apiPost`/`apiGet`/`apiDelete`)
- hand-write a Bearer header
- hand-write a `'http://127.0.0.1:4173'` or `'http://localhost:40320'` literal

All three are pinned by ast-grep.

---

## Running

**The backend is not optional.** `bun run e2e` starts the preview server itself and points it
at `http://localhost:40320` by default, the same address `DIRECT_BACKEND_URL` uses. Without a
backend there the preview has no upstream, every API call 404s, and the specs that create
studies (`e2e/scenarios/*`, `persona-adversary-api`, `study-crud`, `questionnaire`, the
researcher personas) fail on the dead upstream rather than on anything they test. Boot it
first; nothing else needs configuring.

```bash
# Boot the test backend (testcontainer Postgres + Spring on :40320)
./gradlew :chronicle-server:test --tests "*PlaywrightBackendServer*" -Dchronicle.playwright.backend=true

# Then, in another shell — no env vars needed
cd chronicle-web && bun run e2e

# Serve the preview by hand instead (same default upstream)
cd chronicle-web && CHRONICLE_BACKEND_URL=http://localhost:40320 bun run serve

# Run TS DSL unit tests (no browser, ~200ms)
bun test e2e/dsl/

# Run the layered scenario suite (real browser, real backend)
bunx playwright test e2e/scenarios/ --project=desktop-chromium

# Run all 5 personas (real browser, real backend)
bunx playwright test --project=desktop-chromium -g 'persona:'

# Lint the DSL for regression patterns
bun run lint:ast

# All gates
bun run check    # typecheck + biome + ast-grep + DSL unit tests
```

For automated paired runs, do not rely on terminating the long-running Gradle
process. Create a unique evidence directory whose completion file does not yet
exist, then add both bounded backend properties:

```bash
-Dchronicle.playwright.backend.doneFile=/absolute/evidence/run/backend.done
-Dchronicle.playwright.backend.maxWaitSeconds=900
```

Create `backend.done` as a regular file after Playwright exits. The backend
test then returns normally and performs its ordinary JUnit/Testcontainers
cleanup. A missing marker fails the harness after the configured bound.
Use the HTTP health endpoint for readiness rather than Gradle log text, because
the test logger may buffer the server's ready message:

```bash
curl --fail --silent --output /dev/null \
  http://127.0.0.1:40320/chronicle/internal/health/live
```

---

## Why this DSL exists

Before it: Chronicle had isolated component tests (auth, serialization, study CRUD, enrollment) and load tests, but no test that proved the full user journey — auth → study → participant → device → upload → flush → verify → export → poll → download — worked end-to-end at either layer.

After it: 14 Kotlin scenarios + 11 TS scenarios + 36 personas, all driven through one `chronicleScenario` entry point, sharing cleanup, providers, and the auth contract. The shape is intentionally identical on both layers so a regression on either side surfaces by the same test name.
