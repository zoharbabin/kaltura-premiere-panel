# Kaltura for Adobe Premiere Pro — Development Guidelines

## Project Overview

Native Adobe UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro.
UXP-only (no CEP/ExtendScript). React 18 + Spectrum Web Components. Minimum Premiere Pro v25.2.

## Architecture

- **Runtime:** Adobe UXP (Manifest v5) — lightweight JS engine, NOT a browser
- **UI:** React 18 + Spectrum Web Components (custom elements: `sp-button`, `sp-textfield`, etc.)
- **API Client:** Custom `KalturaClient` with multi-request batching and error normalization
- **Host API:** `premierepro` UXP module (only available inside Premiere Pro runtime)
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
    SettingsPanel.tsx          # Preferences, cache, about
  components/                 # Shared UI components
    FilterBar.tsx             # Media type, date, owner filters
    QualityPicker.tsx         # Flavor selection for import
    MetadataEditor.tsx        # Title/description/tags inline editor
    ConfirmDialog.tsx         # Modal confirmation dialog
    LoadingSpinner.tsx        # Spectrum loading indicator
    ErrorBanner.tsx           # Dismissible error display
    EmptyState.tsx            # Empty state with icon
    ProgressBar.tsx           # Progress indicator
    StatusBar.tsx             # Connection status
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
  hooks/                      # React custom hooks
    useAuth.ts                # Auth state management + session restore
    useDebounce.ts            # Input debounce
  types/                      # TypeScript type definitions
    kaltura.ts                # Kaltura API types (entries, flavors, captions, etc.)
    premiere.ts               # Premiere types (markers, sequences, mappings)
    spectrum.d.ts             # JSX declarations for Spectrum Web Components
    index.ts                  # Shared types (AuthState, PluginSettings, etc.)
  utils/                      # Pure utility functions
    constants.ts              # All magic values and storage keys
    errors.ts                 # Error hierarchy + user-friendly messages
    format.ts                 # Duration, file size, bitrate, resolution formatters
    thumbnail.ts              # URL-based thumbnail construction (zero API calls)
    logger.ts                 # Timestamped logger with module prefix
tests/                        # Jest unit tests (mirrors src/ structure)
scripts/                      # Build, package, and dev scripts
docs/                         # Documentation
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
- Tag search via `tag.search` for autocomplete
- Category management via `categoryEntry.add/delete`
- REACH captioning: `reach_entryVendorTask.add` with `serviceFeature=1` (captions) or `2` (translation)
- REACH catalog: `reach_vendorCatalogItem.list` to discover available captioning/translation services
- Caption assets: `caption_captionAsset.list/add/setContent/getUrl` for SRT/VTT/DFXP
- eSearch: `eSearch.searchEntry` with `KalturaESearchCaptionItem` for transcript search
- WebSocket notifications via `push.getUrl` with HTTP polling fallback
- Annotations: `annotation_annotation.list/add/update/delete` for timed comments
- Category assignment: `categoryEntry.add` for multi-destination publishing
- Moderation: `media.update` with `moderationStatus` field for approval workflow
- Version replace: `media.updateContent` with `KalturaUploadedFileTokenResource`
- Analytics: `analytics.query` with semicolon-delimited `columns`/`results` response format
- Cue points: `cuePoint_cuePoint.add/list/delete` with tag-based type discrimination (`premiere-panel-{type}`)
- Batch operations: `client.multiRequest()` for parallel API calls, check `objectType === 'KalturaAPIException'` per response
- Audit trail: `auditTrail.list` filtered by `relatedObjectIdEqual` for entry governance
- Content hold: `media.update` with `adminTags` containing `content-hold:{reason}`

### Premiere UXP API

- All state-changing operations wrapped in `project.executeTransaction()`
- Use `CompoundAction` to group multiple operations into single undo step
- Time conversion: always use `TickTime.fromSeconds()` / `TickTime.toSeconds()`
- The `premierepro` module is only available at runtime — mock in tests
- Feature-gate by Premiere version via `Application.version`
- Asset mappings persisted in `localStorage` for import tracking

### Testing

- Jest + jsdom for unit tests; `tests/` mirrors `src/` directory structure
- Mock `premierepro` and `uxp` modules globally in `tests/setup.ts`
- Mock `fetch` globally — never hit live API in CI
- Test files: `*.test.ts` / `*.test.tsx`
- Coverage thresholds will increase as more component tests are added

### Quality

- ESLint + Prettier enforced via pre-commit hooks and CI
- No `console.log` in production code — use `createLogger()` utility
- No hardcoded strings for user-visible text — use constants
- All async operations must have error handling
- Secrets: NEVER commit `KALTURA_ADMIN_SECRET` or any API secrets

## Build Commands

- `npm run dev` — development build with watch mode
- `npm run build` — production build
- `npm run test` — run all tests
- `npm run test:coverage` — run tests with coverage report
- `npm run lint` — ESLint check
- `npm run lint:fix` — ESLint auto-fix
- `npm run format` — Prettier check
- `npm run typecheck` — TypeScript type checking
- `npm run package` — build + verify for .ccx distribution

## Branch Strategy

- `main` — stable, production-ready
- `phase/N-name` — phase implementation branches (PR to main)
- Never commit directly to main

## PR Requirements

- All CI checks pass (lint, typecheck, test, build)
- Tests cover new functionality
- Documentation updated
- No `any` types without justification
- No `console.log` statements
