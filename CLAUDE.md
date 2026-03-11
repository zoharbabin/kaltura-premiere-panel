# Kaltura for Adobe Creative Cloud — Development Guidelines

## Project Overview

Native Adobe UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro, After Effects, and Audition.
UXP-only (no CEP/ExtendScript). React 18 + Spectrum Web Components. Minimum host version v25.2.

## Architecture

- **Runtime:** Adobe UXP (Manifest v5) — lightweight JS engine, NOT a browser
- **UI:** React 18 + Spectrum Web Components (custom elements: `sp-button`, `sp-textfield`, etc.)
- **API Client:** Custom `KalturaClient` with multi-request batching and error normalization
- **Host API:** HostService interface → PremiereHostAdapter, AfterEffectsHostService, AuditionHostService
- **Auth:** Email/password login + App Token (`appToken.startSession`) + SSO (three-party OAuth)
- **Distribution:** `.ccx` package via installer scripts or Adobe Admin Console

## Directory Structure

```
plugin/manifest.json          # UXP manifest v5
src/
  index.tsx                   # UXP entrypoints.setup() + React render
  App.tsx                     # Root: auth gate, tab router (Browse/Publish/Settings), 13 services
  panels/                     # 4 panels
    LoginPanel.tsx            # Email/password + SSO login
    BrowsePanel.tsx           # Asset browser: search, filters, grid/list, detail flyout
    PublishPanel.tsx           # Export + upload workflow
    SettingsPanel.tsx          # Preferences, cache, about (lazy-loaded)
  components/                 # 13 shared UI components (incl. ErrorBoundary at app root)
  services/                   # 19 service modules
    KalturaClient.ts          # Low-level HTTP: single/multi-request, KS injection, HTTPS validation
    AuthService.ts            # Login, session persistence, auto-refresh
    MediaService.ts           # CRUD, eSearch, batched detail fetching, download URLs
    UploadService.ts          # Chunked resumable uploads (5 MB chunks, XHR for progress)
    DownloadService.ts        # Download + import with progress tracking
    MetadataService.ts        # Metadata, tags, categories, custom schemas
    CaptionService.ts         # REACH captioning/translation, JSON/SRT/VTT parsing, serveAsJson transcript
    NotificationService.ts    # WebSocket push notifications with polling fallback
    SearchService.ts          # eSearch-powered transcript/visual/in-video search
    ProxyService.ts           # Proxy download for editing, reconnect to original
    PublishWorkflowService.ts # Multi-destination, approval, versioning, scheduling
    BatchService.ts           # Multi-request batch ops, offline cache, governance
    PremiereService.ts        # UXP API: sequence, import, markers, transcript attach, export
    AuditService.ts           # Audit trail, access control, DRM, license expiry
    OfflineService.ts         # LRU cache, operation queue, offline/online detection
    HostService.ts            # Host app abstraction interface
    AfterEffectsHostService.ts # AE compositions, footage import
    AuditionHostService.ts    # Audio sessions, audio import
    HostServiceFactory.ts     # Auto-detect host app and create service
  hooks/                      # 3 custom React hooks (useAuth, useDebounce, useContainerWidth)
  types/                      # TypeScript type definitions
  utils/                      # Constants, error classes, formatters, logger, thumbnail URLs
tests/                        # Jest unit tests (mirrors src/ structure)
scripts/                      # Build, package, install, and dev scripts
docs/                         # Documentation
```

## Code Standards

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types except at API boundaries with explicit `// eslint-disable-next-line`
- Prefer `interface` over `type` for object shapes
- Export types from `src/types/` — co-locate only when truly private

### React

- Functional components only (except ErrorBoundary which must be a class)
- Custom hooks for shared logic; prefix with `use`
- Memoize expensive computations with `useMemo`/`useCallback`
- Props interfaces named `{ComponentName}Props`

### UXP Constraints (Critical)

- **No CSS Grid** — use Flexbox only
- **No `window` global** — use UXP equivalents
- **No `@font-face`** — use system fonts only
- **No `TextEncoder` / `TextDecoder`** — use manual `charCodeAt` for string-to-bytes
- **No `data-*` attribute CSS selectors**
- **No Node.js APIs** — no `fs`, `path`, `crypto` from Node; use UXP `uxp.storage`
- **No `float` CSS** — Flexbox only
- **`FormData` + `Blob` unreliable for binary uploads** — build multipart bodies manually
- **`fs.readFile(path)` without encoding returns `ArrayBuffer`** — never pass `{ encoding: "buffer" }`
- **`fetch()` is available** but `XMLHttpRequest` needed for upload progress tracking
- **`WebSocket` is available** in UXP runtime
- **Spectrum Web Components** are custom HTML elements, typed in `src/types/spectrum.d.ts`
- **SWC `preCreateCallback` assertion** — defer view transitions with `setTimeout(0)` to avoid crash
- **Uncaught exceptions crash Premiere** — ErrorBoundary at app root is mandatory
- See `docs/UXP_LESSONS_LEARNED.md` for comprehensive patterns and workarounds

### Kaltura API

- Always use multi-request batching when making 2+ related API calls
- Thumbnail URLs constructed client-side (no API call)
- KS (Kaltura Session) stored in `SecureStorage`, never in `localStorage`
- Error responses: check `objectType === 'KalturaAPIException'` on every response
- Client tag: `kaltura-premiere-panel:v{version}`

### Testing

- Jest + jsdom for unit tests; `tests/` mirrors `src/` directory structure
- Mock `premierepro` and `uxp` modules globally in `tests/setup.ts` (`aftereffects` and `audition` are NOT mocked — host services test unavailable state)
- Mock `fetch` globally — never hit live API in CI
- 452 tests across 37 suites — all passing
- Panel tests use duck-typed service mocks and React Testing Library
- Use `renderHook` + `act` for hook tests; `jest.useFakeTimers()` for debounce tests
- Coverage thresholds enforced (jest.config.js): statements 65%, branches 50%, functions 64%, lines 66%

### Quality

- ESLint + Prettier enforced via pre-commit hooks and CI
- No `console.log` in production code — use `createLogger()` utility
- All async operations must have error handling
- Secrets: NEVER commit `KALTURA_ADMIN_SECRET` or any API secrets

## Build Commands

- `npm run dev` — development build with watch mode
- `npm run build` — production build
- `npm test` — run all tests
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript type checking
- `npm run package` — build + verify + Exchange metadata for .ccx distribution

## Service Wiring (App.tsx)

13 services instantiated in `App.tsx` via `useMemo` (including host service via factory):

- `KalturaClient` → base HTTP client
- `AuthService`, `MediaService`, `UploadService`, `MetadataService` → core CRUD
- `DownloadService`, `CaptionService`, `SearchService` → import/search
- `PublishWorkflowService`, `BatchService` → publish/batch
- `AuditService` → governance audit trail, access control, DRM, compliance
- `OfflineService` → offline caching and operation queue
- `createHostService()` → auto-detects host app, returns PremiereHostAdapter | AfterEffectsHostService | AuditionHostService

Not directly instantiated in App.tsx (used internally or available for future wiring):

- `PremiereService` → wrapped by `PremiereHostAdapter` inside factory
- `NotificationService` → WebSocket push (available but not currently wired)
- `ProxyService` → proxy download/reconnect (available for BrowsePanel wiring)

## Panel Architecture

Panels use duck-typed service interfaces for loose coupling. All panels follow:

1. No `entryId` → `<EmptyState>` with guidance
2. Loading → `<LoadingSpinner>` with descriptive label
3. Error → `<ErrorBanner>` with dismiss/retry
4. Loaded → tabbed sub-views with data display and action forms

## Version Management

Version must be updated in 3 files when bumping:

1. `package.json` → `"version"`
2. `plugin/manifest.json` → `"version"`
3. `src/utils/constants.ts` → `PLUGIN_VERSION`
