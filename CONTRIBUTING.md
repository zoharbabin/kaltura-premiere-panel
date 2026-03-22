# Contributing to Kaltura for Adobe Creative Cloud

Thank you for your interest in contributing! This guide will help you get up and running.

## Development Environment

### Prerequisites

- **Node.js 18+** and **npm**
- **Adobe Premiere Pro** v25.6+ or **Photoshop** v25.1+
- **[UXP Developer Tool](https://developer.adobe.com/premiere-pro/uxp/devtools/)** for loading the plugin during development

### Setup

```bash
git clone https://github.com/zoharbabin/kaltura-premiere-panel.git
cd kaltura-premiere-panel
npm install
```

### Development Workflow

1. **Start the dev build** — watches for file changes and rebuilds automatically:

   ```bash
   npm run dev
   ```

2. **Load into your Adobe app:**
   - Open UXP Developer Tool
   - Click **Add Plugin** and select `dist/manifest.json`
   - Click **Load** to sideload the plugin
   - The panel appears under **Window > UXP Plugins > Kaltura**

3. **Make your changes** in `src/`. Webpack rebuilds on save.

4. **Reload the plugin** — click **Reload** in UXP Developer Tool to see changes.

5. **Run checks before committing:**
   ```bash
   npm run lint        # ESLint
   npm run typecheck   # TypeScript
   npm test            # Jest (all tests must pass)
   ```

### Debugging

- **UXP Developer Tool** has a built-in Chrome DevTools inspector — use it for breakpoints, console, and network inspection.
- All services use `createLogger("ServiceName")` for namespaced logging. Check the DevTools console for `[INFO]`, `[DEBUG]`, `[ERROR]` prefixed messages.
- If Premiere Pro crashes, check the crash dumps at `~/Library/Caches/Adobe/Premiere Pro/{version}/SentryIO-db/` (macOS). See `docs/UXP_LESSONS_LEARNED.md` for details.

## Code Standards

### TypeScript

- **Strict mode** is enabled. No `any` types except at API boundaries.
- Use `interface` for object shapes. Export shared types from `src/types/`.
- New files should follow the existing patterns in the same directory.

### React

- **Functional components** with hooks. The only class component is `ErrorBoundary` (required by React).
- Use `useMemo` and `useCallback` to prevent unnecessary re-renders.
- Name props interfaces `{ComponentName}Props`.

### UXP Gotchas

UXP is **not** a full browser. Before writing UI code, review these critical constraints:

- **No CSS Grid** — Flexbox only for all layouts
- **No `TextEncoder`** — use `charCodeAt` loops for string-to-bytes
- **`FormData` + `Blob` don't work** for binary uploads — build multipart bodies manually
- **Spectrum Web Components crash** on rapid create/destroy — defer view transitions with `setTimeout(0)`
- **Uncaught exceptions crash Premiere** — never let errors escape the React tree

Read [docs/UXP_LESSONS_LEARNED.md](./docs/UXP_LESSONS_LEARNED.md) before making changes to upload, download, or UI transition code.

### Testing

- Tests live in `tests/` and mirror the `src/` directory structure.
- **Never make live API calls** in tests. `fetch` is mocked globally in `tests/setup.ts`.
- UXP and host app modules (`premierepro`, `uxp`) are also mocked globally.
- Use React Testing Library for component tests. Use `renderHook` for hook tests.

**Running tests:**

```bash
npm test                    # All tests
npm test -- --watch         # Watch mode (re-runs on file change)
npm run test:coverage       # With coverage report
```

### Style

- **ESLint + Prettier** enforce formatting. Pre-commit hooks run automatically via Husky.
- No `console.log` in production code — use `createLogger()` from `src/utils/logger.ts`.
- Keep changes minimal. Don't refactor unrelated code in the same PR.

## Project Structure at a Glance

```
src/
  index.tsx           # UXP entrypoints.setup() — registers 2 panels + 2 commands
  panels/             # BrowsePanelRoot, PublishPanelRoot, BrowsePanel, PublishPanel, LoginPanel, SettingsPanel
  commands/           # SettingsCommand (modal dialog), SignOutCommand (session clear)
  components/         # Shared UI: AuthGate, ErrorBoundary, FilterBar, QualityPicker, etc.
  services/           # Service modules + singleton.ts (shared instances across all panels)
  hooks/              # 3 custom hooks (useAuth, useDebounce, useContainerWidth)
  types/              # TypeScript types for Kaltura API, Premiere API, Spectrum
  utils/              # Constants, errors, formatters, logger, thumbnails, settings
```

Panels consume services via **duck-typed prop interfaces** — they declare local interfaces for the service methods they need, rather than importing the concrete class. Service instances are shared singletons from `src/services/singleton.ts`. This keeps coupling loose and testing easy.

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes with tests
3. Run `npm run ci` to verify everything passes (lint + typecheck + test + build)
4. Open a pull request with a clear description of what and why

## Version Bumping

When making a release, update the version in all three locations:

1. `package.json` → `"version"`
2. `plugin/manifest.json` → `"version"`
3. `src/utils/constants.ts` → `PLUGIN_VERSION`

Write a clear commit message describing what changed and why.

## Questions?

Open an issue at [github.com/zoharbabin/kaltura-premiere-panel/issues](https://github.com/zoharbabin/kaltura-premiere-panel/issues).
