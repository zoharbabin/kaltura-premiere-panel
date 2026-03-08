# Changelog

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
