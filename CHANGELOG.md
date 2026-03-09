# Changelog

## 1.8.11

### Fixed

- **Premiere Pro crash on timeline click after publish** — uncaught UXP `AssertionError` from Spectrum Web Components corrupted the scripting engine state, causing a SIGSEGV (signal 11) when Premiere dispatched `SequenceEvent.ClipSelectionChanged` to the plugin context minutes later
- **ErrorBoundary added** — new top-level React error boundary wraps the entire app, preventing any uncaught JS exception from leaking into UXP's scripting engine (which can corrupt state and crash Premiere Pro); shows a "Something went wrong" recovery screen instead
- **View transition crash** (`AssertionError: false == true` in `preCreateCallback`) — UXP's Spectrum Web Components crash when rapidly destroying and creating SWC elements in the same React render cycle; fixed by deferring tab switches with `setTimeout(0)`
- **"Publish Another" button crash** — calling both `onPublished()` (parent navigation) and `handleReset()` (local state reset) simultaneously caused conflicting renders; separated into distinct actions: "Publish Another" resets form only, "Back to Browse" navigates only

### Added

- `ErrorBoundary` component (`src/components/ErrorBoundary.tsx`) — class-based React error boundary with `getDerivedStateFromError`, `componentDidCatch` logging, and one-click recovery
- "Back to Browse" button on publish success screen for explicit navigation
- Deferred `onPublished` callback — success screen now stays visible until user explicitly navigates away

## 1.8.7

### Fixed

- **Kaltura upload `UPLOAD_ERROR`** — three root causes identified and fixed per the [Python](https://github.com/zoharbabin/kaltura_uploader) and [jQuery](https://github.com/kaltura/jQuery-File-Upload) Kaltura upload reference implementations:
  1. `resume` and `finalChunk` sent as `"true"/"false"` but Kaltura API expects `"1"/"0"`
  2. `uploadTokenId` and `ks` sent in the multipart body but Kaltura expects them as URL query parameters
  3. `format` moved from multipart body to URL query parameters
- **`TextEncoder is not defined`** — UXP runtime lacks `TextEncoder`; replaced with manual ASCII-to-`Uint8Array` conversion using `charCodeAt`

### Changed

- Upload multipart body now contains only `resume`, `resumeAt`, `finalChunk`, and `fileData` (matching Kaltura's expected format)
- Upload URL now includes `uploadTokenId`, `ks`, and `format` as query parameters

## 1.8.0 – 1.8.5

### Added

- **Sequence export** — `PremiereService.exportActiveSequence()` using `EncoderManager.exportSequence()` with `pp.Constants.ExportType.IMMEDIATELY` runtime constant, automatic preset discovery, and multi-layer completion detection (events + conservative file polling)
- **End-to-end publish pipeline** — export sequence → read file → create upload token → chunked upload → create/update Kaltura entry, all with unified progress bar
- **File picker source mode** — publish from a selected file on disk as alternative to sequence export
- **Manual multipart upload body** — UXP's `FormData+Blob` doesn't transmit binary data reliably; builds multipart request body manually with `Uint8Array` concatenation
- `readFileAsArrayBuffer()` — reads files via UXP `fs.readFile()` without encoding (returns `ArrayBuffer`)
- `pickFile()` — opens UXP file picker (`uxp.storage.localFileSystem.getFileForOpening`) for media files
- `MediaService.addFromUploadedFile()` — creates entry from upload token in a single API call
- `MediaService.updateContent()` — replaces content on an existing entry via upload token
- `HostService.exportActiveSequence()` added to the host interface

### Changed

- `ProgressBar` component rewritten with native HTML (no `sp-progress-bar`) for reliable rendering in UXP
- Publish flow now uses upload-first approach (create token → upload → create entry) instead of create-first
- NotificationService WebSocket auto-connect disabled — no components consume its events yet
- AuditService `logAction()` changed from async to fire-and-forget (removed unnecessary `auditTrail` API calls)

### Fixed

- Export completion detection: Premiere writes container headers immediately, making file appear "stable" too early; now requires 30s file stability + >100KB minimum + event confirmation
- No absolute timeout for export — large projects can take hours; only idle-based detection
- `fs.readFile({ encoding: "buffer" })` throws in UXP ("undefined encoding is not supported") — use `fs.readFile(path)` without options instead

## 1.5.4 – 1.5.8

### Fixed

- Download pipeline: switched from `flavorAsset.getUrl` to direct CDN URL construction
- Binary file writes: UXP `fs.writeFile` defaults to UTF-8, corrupting binary data; fixed with proper binary write
- Import to Premiere: pass UXP File Entry objects to `importFiles()` instead of string paths
- `importFiles()` parameter order corrected (suppressUI before targetBin)
- Retry import to root project when bin import fails
- `playManifest` URL construction: added `disableentitlement` to KS for CDN access
- `arrayBuffer()` for download response instead of `blob()` for proper binary handling
- Diagnostic logging for 0-byte file investigations
- Removed unnecessary `drmPolicy` API calls from AuditService

## 1.1.0

### Changed

- Complete UI overhaul: migrated all inline styles to CSS classes using Adobe Spectrum design tokens
- External stylesheet (`plugin/styles.css`) loaded via `<link>` for automatic Premiere Pro theme adaptation
- Added comprehensive CSS class system: layout helpers, sub-tab pills, card items, stat cards, badges, alerts, selectable items, catalog cards, text helpers, and flex/gap utilities
- All colors use `var(--spectrum-global-color-*)` tokens — zero hardcoded hex values in components
- Fixed CSS specificity: all `--active`/`--selected` modifiers have compound `:hover` rules to prevent regressions
- Fixed layout shift on catalog card selection (unified 2px border)
- Added `.badge-inline` class for inline-flow badges in list views
- FilterBar component uses `.filter-bar` CSS class instead of inline styles
- Plugin entry point changed from `index.js` to `index.html` in manifest
- Webpack CopyPlugin now copies `styles.css` to dist; `scripts/package.js` validates its presence
- Added one-click curl-based install command for macOS and Windows

### Fixed

- Dead ternary in BrowsePanel license status (both branches returned same class)
- Empty `className=""` on non-error caption task status (now uses `undefined`)
- Redundant inline `marginTop` on `.section-info` elements (CSS already provides it)
- Installer scripts updated: correct UXP plugin directory paths for direct file placement

## 1.0.2

### Fixed

- Fixed plugin installation for Premiere Pro, After Effects, and Audition: `.ccx` double-click install only works for Photoshop — replaced with installer scripts that use Adobe's UPIA
- Added `install-mac.sh` and `install-win.bat` installer scripts included in every release
- Updated README, release notes, and enterprise guide with correct install instructions

## 1.0.1

### Fixed

- Fixed metadata update failures when saving custom metadata on existing entries
- Fixed stale closure in publish workflow that could use outdated access control settings
- Fixed unhandled promise rejections when double-clicking assets during network issues
- Fixed .ccx packages to exclude development-only files (.d.ts, source maps)
- Fixed .ccx packaging to correctly include nested directory structures
- Fixed release notes formatting in automated GitHub Releases
- Improved documentation accuracy across README, enterprise guide, and changelog

### Changed

- Added `repository`, `license`, and `engines` fields to package.json
- Documented test mock strategy for After Effects and Audition host modules

## 1.0.0 - 2025-01-15

### Added

- ProxyService wired to App.tsx and BrowsePanel for proxy/original editing workflow
- Component test suites: ConfirmDialog, EmptyState, ErrorBanner, FilterBar, LoadingSpinner, ProgressBar, StatusBar
- App.tsx integration test with full service mocking and session restore
- React.lazy code splitting for CaptionsPanel, ReviewPanel, AnalyticsPanel, InteractivePanel, SettingsPanel
- Jest coverage thresholds enforced (statements 72%, branches 58%, functions 68%, lines 73%)
- Multi-app support: Premiere Pro, After Effects, Audition via HostService abstraction

### Changed

- ProxyService uses duck-typed HostService interface instead of direct PremiereService dependency
- Plugin name updated to "Kaltura for Adobe Creative Cloud"
- Package version bumped to 1.0.0 across manifest.json, package.json, constants.ts

### Fixed

- Silent catch in PublishPanel now logs debug message instead of swallowing errors
