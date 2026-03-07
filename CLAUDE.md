# Kaltura for Adobe Premiere Pro — Development Guidelines

## Project Overview

Native Adobe UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro.
UXP-only (no CEP/ExtendScript). React 18 + Spectrum Web Components. Minimum Premiere Pro v25.2.
Multi-app support: Premiere Pro, After Effects, Audition via HostService abstraction.

## Architecture

- **Runtime:** Adobe UXP (Manifest v5) — lightweight JS engine, NOT a browser
- **UI:** React 18 + Spectrum Web Components (custom elements: `sp-button`, `sp-textfield`, etc.)
- **API Client:** Custom `KalturaClient` with multi-request batching and error normalization
- **Host API:** HostService interface → PremiereService, AfterEffectsHostService, AuditionHostService
- **Auth:** Email/password login + App Token (`appToken.startSession`) + SSO (three-party OAuth)
- **Distribution:** `.ccx` package via Adobe Exchange

## Directory Structure

```
plugin/manifest.json          # UXP manifest v5
src/
  index.tsx                   # UXP entrypoints.setup() + React render
  App.tsx                     # Root: auth gate, tab router, service initialization
  panels/                     # Tab panels (Browse, Publish, Captions, Settings)
    LoginPanel.tsx            # Email/password + SSO login
    BrowsePanel.tsx           # Asset browser with search, filters, grid/list, detail flyout
    PublishPanel.tsx           # Export + upload workflow
    CaptionsPanel.tsx         # REACH AI captions: order, translate, track management
    ReviewPanel.tsx           # Annotation review: comments, replies, marker sync
    AnalyticsPanel.tsx        # Viewer stats, top moments, drop-off analysis
    InteractivePanel.tsx      # Chapters, cue points, marker-to-chapter sync
    SettingsPanel.tsx          # Preferences, cache, about
  components/                 # Shared UI components
  services/                   # API service layers
    KalturaClient.ts          # Low-level HTTP: single/multi-request, KS injection
    AuthService.ts            # Login, session persistence, auto-refresh
    MediaService.ts           # CRUD, eSearch, batched detail fetching
    UploadService.ts          # Chunked resumable uploads
    DownloadService.ts        # Download + import with progress tracking
    MetadataService.ts        # Metadata, tags, categories, custom schemas
    CaptionService.ts         # REACH captioning/translation, SRT/VTT parsing
    NotificationService.ts    # WebSocket push notifications with polling fallback
    SearchService.ts          # eSearch-powered transcript/visual/in-video search
    ProxyService.ts           # Proxy download for editing, reconnect to original
    ReviewService.ts          # Annotation CRUD, marker sync, threaded replies
    PublishWorkflowService.ts # Multi-destination, approval, versioning, scheduling
    AnalyticsService.ts       # Viewer stats, engagement timeline, top moments, drop-off
    InteractiveService.ts     # Chapters, quizzes, hotspots, CTAs via cue points
    BatchService.ts           # Multi-request batch ops, offline cache, governance
    PremiereService.ts        # UXP API: sequence, import, markers, mappings
    AuditService.ts           # Audit trail logging, access control, DRM policy
    OfflineService.ts         # LRU cache, operation queue, offline/online detection
    HostService.ts            # Host app abstraction interface
    AfterEffectsHostService.ts # AE compositions, footage import
    AuditionHostService.ts    # Audio sessions, audio import
    HostServiceFactory.ts     # Auto-detect host app and create service
  hooks/                      # React custom hooks
  types/                      # TypeScript type definitions
  utils/                      # Pure utility functions
tests/                        # Jest unit tests (mirrors src/ structure)
scripts/                      # Build, package, and dev scripts
docs/                         # Documentation
  enterprise-deployment.md    # Admin Console, UPIA, pre-configuration guide
```

## Code Standards

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types except at API boundaries with explicit `// eslint-disable-next-line`
- Prefer `interface` over `type` for object shapes
- Export types from `src/types/` — co-locate only when truly private

### React

- Functional components only — no class components
- Custom hooks for shared logic; prefix with `use`
- Memoize expensive computations with `useMemo`/`useCallback`
- Props interfaces named `{ComponentName}Props`

### UXP Constraints (Critical)

- **No CSS Grid** — use Flexbox only
- **No `window` global** — use UXP equivalents
- **No `@font-face`** — use system fonts only
- **No `data-*` attribute CSS selectors**
- **No Node.js APIs** — no `fs`, `path`, `crypto` from Node; use UXP `uxp.storage`
- **No `float` CSS** — Flexbox only
- **`fetch()` is available** but `XMLHttpRequest` needed for upload progress tracking
- **`WebSocket` is available** in UXP runtime
- **Spectrum Web Components** are custom HTML elements, typed in `src/types/spectrum.d.ts`

### Kaltura API

- Always use multi-request batching when making 2+ related API calls
- Thumbnail URLs constructed client-side (no API call)
- KS (Kaltura Session) stored in `SecureStorage`, never in `localStorage`
- Error responses: check `objectType === 'KalturaAPIException'` on every response
- Client tag: `kaltura-premiere-panel:v{version}`

### Testing

- Jest + jsdom for unit tests; `tests/` mirrors `src/` directory structure
- Mock `premierepro` and `uxp` modules globally in `tests/setup.ts`
- Mock `fetch` globally — never hit live API in CI
- 374 tests across 34 suites — all passing
- Panel tests use duck-typed service mocks and React Testing Library
- Use `renderHook` + `act` for hook tests; `jest.useFakeTimers()` for debounce tests

### Quality

- ESLint + Prettier enforced via pre-commit hooks and CI
- No `console.log` in production code — use `createLogger()` utility
- All async operations must have error handling
- Secrets: NEVER commit `KALTURA_ADMIN_SECRET` or any API secrets

## Build Commands

- `npm run dev` — development build with watch mode
- `npm run build` — production build
- `npm run test` — run all tests
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript type checking
- `npm run package` — build + verify + Exchange metadata for .ccx distribution

## Service Wiring (App.tsx)

All 20 services are instantiated in `App.tsx` via `useMemo`:

- `KalturaClient` → base HTTP client
- `AuthService`, `MediaService`, `UploadService`, `MetadataService` → core CRUD
- `DownloadService`, `CaptionService`, `NotificationService`, `SearchService`, `ProxyService` → Phase 2
- `ReviewService`, `PublishWorkflowService` → Phase 3
- `AnalyticsService`, `InteractiveService`, `BatchService` → Phase 4
- `AuditService` → governance audit trail, access control, DRM
- `OfflineService` → offline caching and operation queue
- `PremiereService` → host API (Premiere Pro)
- `HostServiceFactory` → creates host-appropriate service (AE/Audition)

## Panel Architecture

Panels use duck-typed service interfaces for loose coupling. All panels follow:

1. No `entryId` → `<EmptyState>` with guidance
2. Loading → `<LoadingSpinner>` with descriptive label
3. Error → `<ErrorBanner>` with dismiss/retry
4. Loaded → tabbed sub-views with data display and action forms
