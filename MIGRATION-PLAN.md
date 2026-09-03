# Chronicle Web: Legacy to Modern Frontend Migration Plan

**Created:** 2026-04-05
**Status:** Active
**Scope:** `src/core/` + `src/containers/` + `src/common/` --> `src/modern/`

---

## 1. Architecture Overview

| Layer | Legacy Stack | Modern Stack |
|-------|-------------|-------------|
| Language | TypeScript (migrated from Flow) | TypeScript (native) |
| State | Redux + Immutable.js + redux-reqseq | RTK Query + Zustand |
| Side effects | redux-saga | RTK Query mutations/queries |
| Routing | react-router-dom v5 | react-router (v8) |
| API calls | Axios via `core/api/axios/` | `fetchBaseQuery` / native fetch |
| UI | FontAwesome + lattice-fabricate + polished | Tailwind + Radix UI + Lucide |

**Shell routing:** `src/index.ts` checks `isModernShellRoute()` and loads either the modern or legacy shell. The modern shell already handles `/`, `/dashboard`, `/studies/*`, `/questionnaire`, `/participant`, `/survey`, `/time-use-diary`, and all `/chronicle/*` equivalents.

**Cross-stack dependency:** Modern code imports one file from core: `bootstrap-auth.ts` imports `authEndpoints.ts` from `core/auth/bootstrap/`.

---

## 2. File Inventory & Migration Status

### 2.1 `src/core/` (138 files)

#### core/api/ (47 files) -- MEDIUM
All API functions use Axios via `getApiAxiosInstance`. Each maps to a single REST endpoint.

| Directory | Files | Modern Equivalent | Status |
|-----------|-------|-------------------|--------|
| `core/api/axios/` | 4 | `fetchBaseQuery` in `study-operations-api.ts` | **Superseded** -- modern uses native fetch |
| `core/api/study/` | 24 | `studyOperationsApi` RTK Query endpoints | **Superseded** -- all 24 endpoints have RTK Query equivalents |
| `core/api/questionnaire/` | 5 | `studyOperationsApi` CRUD mutations | **Superseded** |
| `core/api/timeusediary/` | 3 | `studyOperationsApi.getStudyTudSubmissionGroups` | **Partially superseded** (submit not yet in RTK Query) |
| `core/api/appusagesurvey/` | 3 | None yet | **Not migrated** |
| `core/api/authorizations/` | 2 | None yet | **Not migrated** |
| `core/api/organization/` | 2 | None yet (org selection commented out) | **Not migrated** |
| `core/api/principal/` | 2 | None yet | **Not migrated** |

#### core/auth/ (27 files) -- HARD
Deeply coupled to redux-saga for auth flow orchestration (attempt/success/failure/expired/logout watchers). The modern stack has `session-slice.ts` (RTK createAsyncThunk) + `bootstrap-auth.ts` which replaces the bootstrap flow.

| Sub-area | Files | Modern Equivalent | Status |
|----------|-------|-------------------|--------|
| `auth/actions/` | 1 | `session-slice.ts` extraReducers | **Superseded** |
| `auth/bootstrap/` | 6 | `bootstrap-auth.ts` + `authEndpoints.ts` (shared) | **Mostly superseded** |
| `auth/reducers/` | 1 | `session-slice.ts` | **Superseded** |
| `auth/sagas/` | 6 | `bootstrapSession` async thunk | **Superseded** (modern uses thunk, not saga) |
| `auth/storage/` | 1 | Cookie-based auth in modern | **Superseded** |
| `auth/utils/` | 11 | `bootstrap-auth.ts` covers session init | **Partially superseded** |

#### core/bootstrap/ (8 files) -- MEDIUM
Shell routing already delegates to modern. `LegacyShellScaffold.tsx` + `renderLegacyShell.tsx` are the legacy shell entry points that will be deleted last.

| File | Status |
|------|--------|
| `shellRouting.ts` | **Shared** -- used by `src/index.ts` for route delegation |
| `shellRouting.property.test.ts` | **Shared** -- test for above |
| `renderLegacyShell.tsx` | **Legacy only** -- delete when legacy removed |
| `renderEnrollmentShell.tsx` | **Legacy only** -- needs modern equivalent or keep |
| `renderBootstrapError.tsx` | **Shared** -- used by both shells |
| `LegacyShellScaffold.tsx` | **Legacy only** |
| `resolveLegacyBootstrapToken.ts` | **Legacy only** |
| `useLegacyStudyBootstrap.ts` | **Legacy only** |

#### core/config/ (2 files) -- EASY
`Configuration.ts` uses Immutable.js to store `baseUrl`/`authToken`/`csrfToken`. Modern stack derives base URL from `window.location` and reads CSRF from cookie directly.

**Status:** **Superseded** -- can be deleted once legacy shell is removed.

#### core/i18n/ (7 files) -- MEDIUM
Translation files (en/de/es/sv) + i18next setup. Used by legacy containers (survey, TUD, questionnaire). Modern stack does not use i18n yet.

**Status:** **Keep for now** -- needed by survey/TUD legacy containers. Will need modern i18n strategy.

#### core/orgs/ (5 files) -- EASY
Organization fetching + reducer. Org selection is currently commented out in the app saga.

**Status:** **Dead feature** -- org selection disabled. Can be deleted.

#### core/permissions/ (5 files) -- MEDIUM
Manages `myKeys` (ownership check). Used only by legacy initializeStudy flow.

**Status:** **Legacy only** -- modern uses server-side auth checks.

#### core/redux/ (23 files) -- HARD (blocking dependency)
Contains the Redux store, root reducer, all selectors, and the `resetRequestState` infrastructure. This is the central nervous system of the legacy stack.

| Sub-area | Files | Notes |
|----------|-------|-------|
| `ReduxStore.ts` | 1 | Creates store with Immutable.Map initial state |
| `ReduxReducer.ts` | 1 | Combines all legacy reducers |
| `ReduxActions.ts` | 1 | `resetRequestState` action |
| `actions/` | 1 | Re-exports |
| `reducers/` | 2 | `resetRequestStatesReducer` |
| `selectors/` | 17 | All legacy selectors -- most superseded by RTK Query hooks |

#### core/router/ (9 files) -- MEDIUM
Legacy react-router v5 integration: history, route constants, routing sagas, auth route guard.

| File | Status |
|------|--------|
| `Routes.ts` | **Superseded** by `route-links.ts` |
| `history.ts` | **Legacy only** -- used by 5 legacy containers |
| `RoutingActions.ts` | **Legacy only** -- saga-based navigation |
| `RoutingSagas.ts` | **Legacy only** |
| `AuthRoute.tsx` | **Dead code** -- not imported anywhere |
| `DefaultUnauthorized.tsx` | **Dead code** -- not imported anywhere |
| `RouterHistory.ts` | **Dead code** -- not imported anywhere |
| `RouterUtils.ts` | **Dead code** -- not imported anywhere |
| `Spinner.tsx` | **Used** by legacy containers |

#### core/sagas/ (1 file) -- HARD (blocking dependency)
`Sagas.ts` is the root saga that forks all watchers. Must remain until all sagas are migrated.

#### core/tracking/ (4 files) -- EASY
Google Analytics middleware + route change handler. Simple, standalone.

**Status:** Can be replaced with modern analytics integration or kept as-is.

### 2.2 `src/containers/` (263 files)

| Container | Files | Modern Equivalent | Complexity |
|-----------|-------|-------------------|------------|
| `app/` | 9 | `modern-app.tsx` + `session-bootstrap.tsx` | **Superseded** |
| `dashboard/` | 30 | `overview-page.tsx` + RTK Query `getAllStudies` | **Superseded** |
| `enrollment/` | 1 | Legacy enrollment link renderer | **Keep** (public-facing) |
| `participant/` | 4 | `participant-dashboard-page.tsx` | **Superseded** |
| `questionnaire/` | 7 | `questionnaire-page.tsx` (participant-facing) | **Partially superseded** |
| `questionnaires/` | 29 | `study-questionnaires-page.tsx` + RTK Query CRUD | **Superseded** |
| `study/` | 98 | Full modern routes: details, participants, compliance, TUD, audit | **Superseded** |
| `survey/` | 25 | `survey-page.tsx` | **Partially superseded** |
| `tud/` | 60 | `time-use-diary-page.tsx` | **Partially superseded** (complex form wizard) |

### 2.3 `src/common/` (42 files) -- shared infrastructure

| Sub-area | Used by Modern? | Used by Legacy? | Action |
|----------|----------------|-----------------|--------|
| `constants/strings.ts` (174 exports) | No | Yes | Delete with legacy |
| `constants/objects.ts`, `numbers.ts`, etc. | No | Yes | Delete with legacy |
| `utils/toSagaError.ts` | No | Yes | Delete with legacy |
| `utils/useRequestState.ts` | No | Yes | Delete with legacy |
| `utils/getParamFromMatch.ts` | No | Yes | Delete with legacy |
| `utils/FQN.ts` | No | Yes | Delete with legacy |
| `utils/authenticatedDownload.ts` | No | Yes | Delete with legacy |
| `utils/Logger.ts` | No | Yes | Delete with legacy |
| `utils/isNonEmptyString.ts` etc. | No | Yes (via config) | Delete with legacy |
| `components/` | No | Yes | Delete with legacy |
| `types/` | No | Yes | Delete with legacy |

**Key finding:** Modern code (`src/modern/`) has ZERO imports from `src/common/`. It is fully independent except for the single `authEndpoints.ts` import from `core/auth/bootstrap/`.

---

## 3. Migration Waves

### Wave 0: Dead Code Removal (immediate, safe)
Files not imported anywhere -- can be deleted now.

- [x] `core/router/AuthRoute.tsx` -- zero imports (DELETED)
- [x] `core/router/DefaultUnauthorized.tsx` -- zero imports (DELETED)
- [x] `core/router/RouterHistory.ts` -- zero imports (DELETED)
- [x] `core/router/RouterUtils.ts` -- zero imports (DELETED)

### Wave 1 Progress
- [x] **authEndpoints.ts** -- canonical source moved to `modern/lib/auth-endpoints.ts`; legacy re-exports for backward compat
- [x] **Reference Zustand store** -- `modern/stores/selected-org-store.ts` created with tests (4/4 passing)

### Wave 1: Easy Wins (low risk, no behavioral change)

1. **Move `authEndpoints.ts` to `src/modern/lib/`** -- eliminates the only cross-stack import
2. **Delete `core/orgs/`** -- org selection is disabled (commented out in saga)
3. **Delete `core/config/Configuration.ts`** -- only used by legacy shell bootstrap, modern derives config from `window.location`

### Wave 2: Reference Migration -- Redux to Zustand

Pick the `app` container's `selectedOrgId` reducer as a reference implementation:
- Create `src/modern/stores/selected-org-store.ts` (Zustand)
- Document the migration pattern: action + reducer + saga + selector --> Zustand store + RTK Query

### Wave 3: Medium Complexity Migrations

1. **`core/auth/`** -- The modern `session-slice.ts` already covers bootstrap. Remaining: logout flow, token expiration watcher, admin check
2. **`core/permissions/`** -- Simple `myKeys` tracking, low usage
3. **`core/tracking/`** -- Standalone Google Analytics, can be replaced with modern analytics hook
4. **`containers/dashboard/`** -- Fully superseded by `overview-page.tsx` + RTK Query

### Wave 4: Hard Migrations (deep Immutable.js + saga coupling)

1. **`containers/study/`** (98 files) -- Largest area. All API operations already have RTK Query equivalents. The remaining work is deleting the legacy sagas/reducers/containers.
2. **`containers/questionnaires/`** (29 files) -- Fully covered by modern questionnaire pages + RTK Query CRUD.
3. **`containers/survey/`** (25 files) -- Complex form with i18n. Modern `survey-page.tsx` exists but may need feature parity check.
4. **`containers/tud/`** (60 files) -- Most complex: multi-step form wizard with schemas, i18n, and date/time handling. `time-use-diary-page.tsx` exists but needs parity verification.
5. **`core/redux/`** -- Delete last, after all consumers are gone.

### Wave 5: Final Cleanup

1. Delete `src/common/` entirely (zero modern imports)
2. Delete `src/containers/` entirely
3. Delete `src/core/` entirely (except `shellRouting.ts` if still needed by index.ts)
4. Remove legacy dependencies from `package.json`: `immutable`, `redux-immutable`, `redux-reqseq`, `@redux-saga/core`, `redux`, `react-router-dom` (v5), `axios`, `history`, `lattice-fabricate`, `js-cookie`
5. Remove legacy build tooling: webpack configs, babel configs, eslint (replace with biome fully)
6. Update `src/index.ts` to always load modern shell (remove dual-routing)

---

## 4. Blocking Dependencies

| Dependency | Blocks | Removal Condition |
|------------|--------|-------------------|
| `immutable` | All legacy reducers | All reducers migrated to RTK/Zustand |
| `redux-saga` | All legacy side effects | All sagas replaced by RTK Query/thunks |
| `redux-reqseq` | All legacy actions | All request sequences replaced |
| `react-router-dom` v5 | All legacy containers | All routes in modern router |
| `axios` | `core/api/` layer | All API calls via RTK Query `fetchBaseQuery` |
| `redux-immutable` | `ReduxReducer.ts` combineReducers | Legacy store removed |

---

## 5. Migration Pattern Reference

### Before (Legacy): Redux + Immutable.js + Saga

```
actions/index.ts          -- newRequestSequence('GET_FOO')
reducers/getFooReducer.ts -- Immutable.Map setIn/getIn with REQUEST/SUCCESS/FAILURE/FINALLY
sagas/getFoo.tsx          -- takeLatest + worker generator with put/call/select
selectors/selectFoo.ts    -- getIn(state, ['slice', 'foo'])
```

### After (Modern): RTK Query OR Zustand

**For server data (API calls):** Use RTK Query endpoint in `study-operations-api.ts`
```typescript
getStudyFoo: builder.query<FooType, string>({
  providesTags: [...],
  query: (studyId) => `/study/${studyId}/foo`,
})
```

**For client-only state:** Use Zustand store in `stores/`
```typescript
export const useFooStore = create<FooState>()(
  persist((set) => ({
    value: null,
    setValue: (v) => set({ value: v }),
  }), { name: 'chronicle-foo', storage: createJSONStorage(() => localStorage) })
);
```

---

## 6. Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Legacy files (`core/` + `containers/` + `common/`) | 443 | 0 |
| Modern files (`modern/`) | 161 | ~200 (absorbs some legacy features) |
| Immutable.js imports | ~80 files | 0 |
| Redux saga files | ~40 files | 0 |
| Bundle dependencies to remove | 10 packages | 0 legacy deps |
