# Changelog

## 1.0.0

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
