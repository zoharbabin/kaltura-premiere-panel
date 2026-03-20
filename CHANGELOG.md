# Changelog

## 1.16.3

### Improvements

- **Simplified installation** — `.ccx` double-click install now works for Premiere Pro, After Effects, and Audition. Removed installer scripts (`install-mac.sh`, `install-win.bat`, `quick-install.sh`, `quick-install.ps1`) that are no longer needed.
- **Simplified README** — Installation instructions reduced to: download `.ccx`, double-click, done.
- **Simplified release workflow** — GitHub Releases now only include `.ccx` files as assets.

## 1.16.2

### Features

- **eSearch for all browsing** — Replaced `media/list` entirely with eSearch (`elasticsearch_esearch/searchEntry`) for both initial browse and search queries. Uses `display_in_search=1` as default filter with `updated_at desc` sort for initial load.
- **Sort By dropdown** — Added sort options (Relevance, Recently updated, Recently created, Name A-Z, Most played, Last played) inside the "Filters and sort" panel. Auto-switches to Relevance when searching, back to Recently updated when cleared.
- **Visual search highlighting** — Search terms are highlighted in orange bold within entry titles in both grid and list views via `HighlightText` component.
- **Highlight snippets** — Search result hints now show the matched text (e.g., `title/tags: "PathFactory"` or `transcript at 1:23: "PathFactory integration..."`) instead of just "Found in title/tags".
- **My Content filter** — "My content" ownership filter uses structured eSearch OR across `kuser_id`, `creator_kuser_id`, `entitled_kusers_edit`, and `entitled_kusers_publish` fields, showing entries the user owns, created, or can edit/publish.

### Bug Fixes

- **Fix responsive UI overlap** — Login, Settings, and Publish panels now scroll properly when the plugin window is resized small. Uses `panel-scroll` layout pattern consistently.
- **Fix search box not rendering** — Replaced `<sp-search>` (unsupported in UXP) with `<sp-textfield>` for the search input.
- **Fix eSearch service name** — Corrected API service from `"eSearch"` to `"elasticsearch_esearch"` across MediaService and SearchService.
- **Fix highlight parsing** — Reads both top-level `highlight[]` and `itemsData[]` from eSearch response for complete highlight coverage. Fixed `stripHighlightTags` to handle non-string inputs.
- **Fix My Content highlight pollution** — Ownership filter items use `addHighlight: false` and proper AND/OR query hierarchy so highlights only come from the search term, not user field matches.
- **Fix eSearch field names** — Use valid `KalturaESearchEntryFieldName` enum values (`kuser_id`, `creator_kuser_id`, `entitled_kusers_edit`, `entitled_kusers_publish`).
- **Fix search precision** — Changed unified search from `PARTIAL` (itemType 2) to `STARTS_WITH` (itemType 3) for more precise matching.

### Improvements

- **Compact toolbar** — Sort dropdown moved inside the "Filters and sort" collapsible panel. Result count shown as a compact single line that's always visible.
- **eSearch query structure** — Properly structured as `AND[ OR[user fields], AND[search/filter fields] ]` per Kaltura best practices.
- **eSearch types** — Added nested operator support (`operator`, `searchItems` fields) to `KalturaESearchItem` type for sub-group queries.

### Tests

- Updated all BrowsePanel tests for eSearch-only browse (removed media.list mocks)
- Updated FilterBar tests for "Filters and sort" rename and sort dropdown
- Updated MediaService tests for query structure, ownership OR operator, `STARTS_WITH` item type, and highlight extraction

## 1.15.4

## 1.15.4

### Documentation

- **README audit against actual implementation** — removed REACH/AI captioning ordering claim (not implemented), fixed service counts (12 instantiated, not 13), removed unused NotificationService/ProxyService from project tree and service tables, removed WebSocket network requirement and UXP constraint (not wired up), clarified governance and offline cache descriptions

## 1.15.3

### Cleanup

- Removed internal strategy/research document (`Kaltura_Adobe_Premiere_Integration_Research.md`) from public repository

## 1.15.2

### Improvements

- **README rewritten for public release** — added "What is this?" intro for newcomers, prominent download link at top, reordered install instructions (manual download first, `gh` CLI second), added download table to release notes
- **Release notes install section updated** — matches new README ordering with clearer steps
- Removed hardcoded test counts from CONTRIBUTING.md (won't go stale)
- Fixed coverage threshold mismatch in README (branches 50%, not 52%)

## 1.15.1

### Bug Fixes

- **Fix SWC assertion crash on tab switch** — Switching from the Publish success screen back to Browse caused a UXP Spectrum Web Components `preCreateCallback` assertion (`false == true`) crash. Root cause: simultaneous SWC element unmount/mount during view transitions. Fixed with a two-phase tab switch that unmounts the current panel first, waits 50ms for SWC teardown, then mounts the new panel.

## 1.15.0

### Features

- **Image entry import** — Image entries (photos, graphics) can now be downloaded and imported directly into Premiere Pro. Previously showed "No ready renditions available" because images have no flavor assets. Uses `baseEntry/getDownloadUrl` API for direct source file download. (#82 related)
- **Transcript attachment to clips** — "Attach to Clip" button in the Captions tab connects Kaltura caption/transcript data directly to a video clip's project item using Premiere's native Transcript API. Captions appear in Premiere's Transcript panel for native caption workflow. (Closes #82)

### Dependency Upgrades

- **Jest** 29.7 → 30.3 — eliminates deprecated `abab`, `domexception`, `rimraf@3`
- **ESLint** 8.57 → 9.39 — migrated from `.eslintrc.json` to flat config (`eslint.config.mjs`); eliminates deprecated `@humanwhocodes/*` packages
- **copy-webpack-plugin** 12 → 14 — fixes high-severity `serialize-javascript` RCE vulnerability (CVE)
- **GitHub Actions** — `checkout` v4→v6, `setup-node` v4→v6, `upload-artifact` v4→v7, `download-artifact` v4→v8; eliminates Node.js 20 deprecation warnings

### Improvements

- Codebase review: replaced magic numbers with `ProjectItemType` enum, added `lockedAccess()` result checking
- Removed 23 unnecessary `eslint-disable-next-line` directives
- 8 new lessons documented in `docs/UXP_LESSONS_LEARNED.md` covering transcript API patterns
- Updated all documentation (README, CONTRIBUTING, CLAUDE.md) with current test counts and coverage thresholds

### Security

- Resolved 2 high-severity npm audit vulnerabilities (serialize-javascript RCE)
- npm deprecation warnings reduced from 10 to 4 (remaining are deep Jest/jsdom internals)

### Tests

- 452 tests across 37 suites (up from 442)
- New tests: `importTranscriptToClip` (7), `downloadAndImportEntry` (4), `downloadCaptionAsJson` (3), `parseKalturaJson` (3), `getEntryDownloadUrl` (1)

## 1.14.2

### Bug Fixes

- Fix download 404 on entries with `enforce_delivery:static_content` — use `flavorAsset/getDownloadUrl` instead of `playManifest`
- Fix caption format parsing for SRT/VTT/DFXP
- Fix `serveAsJson` API parameter name (`captionAssetId` not `id`)

## 1.14.1

### Bug Fixes

- Fix download 404 errors on enforce_delivery entries
- Fix caption import parsing errors for various formats

## 1.14.0

### Improvements

- Documentation overhaul
- Dead code removal and code quality improvements
