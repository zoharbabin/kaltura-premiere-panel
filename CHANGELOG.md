# Changelog

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
