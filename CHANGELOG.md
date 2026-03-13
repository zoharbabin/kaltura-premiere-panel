# Changelog

## 1.16.0

### Features

- **eSearch-powered browse** — BrowsePanel now uses Kaltura's Elasticsearch-backed `eSearch/searchEntry` API when search text is entered. Searches across entry names, descriptions, tags, captions/transcripts, and metadata simultaneously using `KalturaESearchUnifiedItem` with partial matching and synonym support. (Closes #83)
- **Caption content search** — Users can now find videos by what was _said_ in them. eSearch returns timecoded highlights showing exactly where matches occur in transcripts
- **"Has Captions" filter** — New checkbox toggle in FilterBar filters results to entries that have caption/transcript tracks (`KalturaESearchCaptionItem` with `EXISTS` item type)
- **Search highlight display** — Grid cards show a subtle hint below the title ("in transcript ⏱ 1:23") and list rows append match source to metadata line when eSearch highlights are available

### Improvements

- **Shared eSearch types** — Added typed interfaces and enums (`ESearchItemType`, `ESearchOperatorType`, `KalturaESearchEntryParams`, `ESearchResponse`, etc.) to `types/kaltura.ts`, replacing inline `Record<string, unknown>` objects
- **SearchService type consolidation** — Moved private eSearch response interfaces from `SearchService` to shared `types/kaltura.ts`
- **Graceful fallback** — If eSearch call fails, BrowsePanel automatically falls back to `media/list` with error logging (no crash)
- **Dual-path browse** — Empty search (initial browse) still uses `media/list` with chronological ordering; eSearch only activates when search text or caption filter is present

### Tests

- New tests: `eSearchBrowse()` parameter construction, response unwrapping, highlight extraction, filter combinations, eSearch/list dual path in BrowsePanel, FilterBar caption checkbox

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
