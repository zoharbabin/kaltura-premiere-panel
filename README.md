# Kaltura for Adobe Creative Cloud

> **From Timeline to Audience.** A native [Adobe UXP](https://developer.adobe.com/premiere-pro/uxp/) panel integrating [Kaltura's](https://corp.kaltura.com/) enterprise video platform with Adobe Premiere Pro, After Effects, and Audition.

Browse, search, import, and publish video content — all without leaving your Adobe app.

**[Download Latest Release](../../releases/latest)** | [Enterprise Deployment Guide](./docs/enterprise-deployment.md) | [Contributing](./CONTRIBUTING.md)

### What is this?

[Kaltura](https://corp.kaltura.com/) is an enterprise video platform used by Fortune 500 companies, universities, and media organizations for video management, hosting, and streaming. This open-source plugin brings Kaltura directly into Adobe's creative tools — editors can browse their organization's video library, import assets, attach captions to timeline clips, and publish finished work back to Kaltura, all from within Premiere Pro (or After Effects / Audition).

## Features

| Capability          | Description                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browse & Search** | Search your Kaltura library with [eSearch](https://developer.kaltura.com/api-docs/service/eSearch) across titles, tags, and metadata. Grid or list view with filters, infinite scroll, and keyboard navigation. |
| **Import**          | Download Kaltura assets and import them into your project with quality picker and proxy/original workflow                                                                                                       |
| **Publish**         | Export sequences or pick a file, upload to Kaltura with chunked resumable uploads, set metadata, categories, and access controls                                                                                |
| **Captions**        | List, download, and parse caption tracks (SRT, VTT, DFXP, JSON); attach transcripts directly to timeline clips via Premiere's native Transcript API                                                             |
| **Governance**      | Content hold detection, license expiry warnings, access control profiles, local audit trail                                                                                                                     |
| **Offline Cache**   | LRU cache for browsing asset metadata offline; operation queue syncs when reconnected                                                                                                                           |
| **Multi-App**       | Runs in Premiere Pro, After Effects, and Audition with host-specific adapters                                                                                                                                   |

## Quick Start

### Prerequisites

- **Adobe Premiere Pro**, **After Effects**, or **Audition** v25.2 or later
- **Node.js** 18+ and **npm** (for development only)
- A **Kaltura** account with API access ([sign up](https://developer.kaltura.com/))

### Install (End Users)

1. Go to the **[Latest Release](../../releases/latest)** page
2. Download the `kaltura-panel-x.x.x.ccx` file
3. **Double-click** the `.ccx` file to install (works for Premiere Pro, After Effects, and Audition)
4. Open your Adobe app > **Window > UXP Plugins > Kaltura**

### Development Setup

```bash
# 1. Clone and install
git clone https://github.com/zoharbabin/kaltura-premiere-panel.git
cd kaltura-premiere-panel
npm install

# 2. Start the development build (watches for file changes)
npm run dev

# 3. Load the plugin into your Adobe app:
#    a. Install the UXP Developer Tool from https://developer.adobe.com/premiere-pro/uxp/devtools/
#    b. Open UXP Developer Tool
#    c. Click "Add Plugin" and select dist/manifest.json
#    d. Click "Load" to sideload into Premiere Pro (or After Effects / Audition)
#    e. The panel appears under Window > UXP Plugins > Kaltura
#
# Every time you save a source file, webpack rebuilds automatically.
# Click "Reload" in UXP Developer Tool to see your changes.
```

**Optional:** Copy `.env.example` to `.env` for integration testing (never commit real credentials):

```bash
cp .env.example .env
# Edit .env with your Kaltura partner ID and admin secret
```

## Available Scripts

| Script                  | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Development build with watch mode                      |
| `npm run build`         | Production build (outputs to `dist/`)                  |
| `npm test`              | Run all tests                                          |
| `npm run test:coverage` | Run tests with coverage report                         |
| `npm run lint`          | ESLint check                                           |
| `npm run lint:fix`      | ESLint auto-fix                                        |
| `npm run format`        | Prettier formatting check                              |
| `npm run format:fix`    | Prettier auto-fix                                      |
| `npm run typecheck`     | TypeScript type check (no emit)                        |
| `npm run package`       | Build + validate manifest + generate Exchange metadata |
| `npm run ci`            | Full CI pipeline: lint, typecheck, test, build         |

## Architecture

### Technology Stack

- **[Adobe UXP](https://developer.adobe.com/premiere-pro/uxp/)** (Manifest v5) — Adobe's modern JavaScript extensibility platform, replacing CEP/ExtendScript
- **React 18** — functional components, hooks, `React.lazy` for code splitting
- **[Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/)** — Adobe's design system (`sp-button`, `sp-textfield`, etc.) for native look and feel
- **Kaltura REST API** — multi-request batching, chunked resumable uploads, eSearch
- **TypeScript** — strict mode, no `any` types except at API boundaries
- **Webpack** — bundles to a single `index.js` with UXP externals (`uxp`, `premierepro`, `aftereffects`, `audition`)

### Multi-App Support

The plugin runs in three Adobe hosts via a `HostService` abstraction layer:

| Host          | Adapter                   | Capabilities                                                  |
| ------------- | ------------------------- | ------------------------------------------------------------- |
| Premiere Pro  | `PremiereHostAdapter`     | Sequences, video/audio import, timeline markers, project bins |
| After Effects | `AfterEffectsHostService` | Compositions, footage import, layer management                |
| Audition      | `AuditionHostService`     | Audio sessions, audio file import, audio markers              |

The `HostServiceFactory` auto-detects the running host at startup and returns the appropriate adapter.

### Project Structure

```
kaltura-premiere-panel/
  plugin/
    manifest.json             # UXP Manifest v5 — hosts, permissions, entrypoints
    index.html                # HTML shell loaded by UXP
    styles.css                # Spectrum design token CSS
    icons/                    # Plugin icons (24, 48, 96, 192 px)
  src/
    index.tsx                 # UXP entrypoints.setup() + React root render
    App.tsx                   # Auth gate, service initialization, tab router (Browse/Publish/Settings)
    panels/                   # 4 panel components
      LoginPanel.tsx          #   Email/password + SSO login form
      BrowsePanel.tsx         #   Asset browser with search, filters, grid/list, detail flyout
      PublishPanel.tsx         #   Export sequence + upload workflow
      SettingsPanel.tsx        #   Preferences, cache management, about (lazy-loaded)
    components/               # 13 shared UI components
      ErrorBoundary.tsx       #   Top-level crash protection (mandatory for UXP)
      FilterBar.tsx           #   Search filters (media type, date, owner)
      ConfirmDialog.tsx       #   Modal confirmation dialog
      ErrorBanner.tsx         #   Dismissible error display with retry
      LoadingSpinner.tsx      #   Spectrum-styled spinner
      ProgressBar.tsx         #   Upload/download progress (native HTML, not sp-progress-bar)
      StatusBar.tsx           #   Connection state indicator
      QualityPicker.tsx       #   Flavor/quality selection for import
      MetadataEditor.tsx      #   Entry metadata form (name, description, tags, categories)
      Accordion.tsx           #   Collapsible section
      SegmentedControl.tsx    #   Grid/list view toggle
      SkeletonGrid.tsx        #   Loading placeholder grid
      EmptyState.tsx          #   Empty search results / no content guidance
    services/                 # Service modules
      KalturaClient.ts        #   Low-level HTTP: single/multi-request, KS injection, HTTPS validation
      AuthService.ts          #   Email/password, App Token, SSO (three-party OAuth), session refresh
      MediaService.ts         #   Media CRUD, eSearch, batched detail fetching, download URLs
      UploadService.ts        #   Chunked resumable uploads (5 MB chunks, XHR for progress)
      DownloadService.ts      #   Download flavors + import into host app with progress tracking
      MetadataService.ts      #   Standard/custom metadata, tags, category hierarchy
      CaptionService.ts       #   List, download, parse JSON/SRT/VTT/DFXP captions, attach transcripts
      SearchService.ts        #   eSearch: transcript, visual, in-video content search with highlights
      PublishWorkflowService.ts # Multi-destination publish, approval, versioning, scheduling
      BatchService.ts         #   Multi-entry operations, offline cache integration, governance tags
      AuditService.ts         #   Audit trail, access control profiles, license expiry
      OfflineService.ts       #   LRU cache (200 entries / 50 MB), operation queue for offline sync
      PremiereService.ts      #   UXP Premiere API: sequences, import, markers, export
      HostService.ts          #   Abstract host interface definition
      HostServiceFactory.ts   #   Auto-detect host app and create appropriate adapter
      AfterEffectsHostService.ts  # AE compositions, footage import
      AuditionHostService.ts  #   Audio sessions, audio import
    hooks/                    # 3 custom React hooks
      useAuth.ts              #   Authentication state machine with session restore
      useDebounce.ts          #   Debounced value for search input
      useContainerWidth.ts    #   Responsive grid column calculation
    types/                    # TypeScript type definitions
      kaltura.ts              #   Kaltura API types (entries, flavors, captions, filters, enums)
      premiere.ts             #   Premiere Pro UXP API type stubs
      spectrum.d.ts           #   Spectrum Web Components JSX declarations
      index.ts                #   Shared types (AuthState, TabId, ConnectionState, PluginSettings)
    utils/                    # Pure utility functions
      constants.ts            #   All magic numbers, URLs, storage keys, timeouts
      errors.ts               #   Custom error classes (KalturaApiError, NetworkError, AuthenticationError)
      format.ts               #   Date, duration, file size formatters
      logger.ts               #   Namespaced console logger with levels
      thumbnail.ts            #   Kaltura thumbnail CDN URL builder
  tests/                      # Jest unit tests (mirrors src/ structure)
  scripts/                    # Build scripts
    package.js                #   Build validation, manifest sync, Exchange metadata generation
    build-ccx.js              #   Per-host .ccx package builder
  docs/                       # Documentation
    enterprise-deployment.md  #   Admin Console, UPIA, pre-configuration guide
    UXP_LESSONS_LEARNED.md    #   Hard-won UXP patterns and workarounds
```

### Service Layer

12 services are instantiated in `App.tsx` via `useMemo`:

| Service                  | Purpose                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `KalturaClient`          | Low-level HTTP: single/multi-request, KS injection, error normalization     |
| `AuthService`            | Email/password, App Token, SSO (three-party OAuth), session auto-refresh    |
| `MediaService`           | Media CRUD, eSearch, batched detail fetching                                |
| `UploadService`          | Chunked resumable uploads (5 MB chunks, `XMLHttpRequest` for progress)      |
| `DownloadService`        | Download flavors + import into host app with progress tracking              |
| `MetadataService`        | Standard/custom metadata fields, tags, category hierarchy                   |
| `CaptionService`         | List, download, parse SRT/VTT/DFXP/JSON captions, transcript attach         |
| `SearchService`          | eSearch: transcript, visual, in-video content search with highlights        |
| `PublishWorkflowService` | Multi-destination publish, approval, versioning, scheduling                 |
| `BatchService`           | Multi-entry operations, offline cache integration, governance tags          |
| `AuditService`           | Audit trail logging, access control profiles, license expiry                |
| `OfflineService`         | LRU cache (200 entries / 50 MB), operation queue for offline-to-online sync |
| `HostService` (factory)  | Auto-detects host app, returns PremiereHostAdapter / AE / Audition adapter  |

Panels consume services through duck-typed interfaces for loose coupling — no panel imports a concrete service class directly.

## Configuration

Copy `.env.example` to `.env` for integration testing (never commit real credentials):

```bash
KALTURA_PARTNER_ID=your_partner_id
KALTURA_ADMIN_SECRET=your_admin_secret
KALTURA_SERVICE_URL=https://www.kaltura.com
```

At runtime, users configure their Kaltura server URL and authenticate via the **Login** panel (email/password or SSO). Session tokens are stored in UXP `SecureStorage`.

Enterprise admins can pre-configure the plugin with a JSON config file — see the [Enterprise Deployment Guide](./docs/enterprise-deployment.md).

## Testing

**452 tests** across **37 suites** — all passing.

```bash
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report
```

- **Framework:** Jest + jsdom + React Testing Library
- **Coverage thresholds** (enforced in CI): statements 65%, branches 50%, functions 64%, lines 66%
- **Test structure** mirrors `src/`: panels, components, services, hooks, utils
- **Mocking:** UXP and host app modules mocked globally in `tests/setup.ts`; `fetch` mocked globally — no live API calls in CI

## Packaging & Distribution

```bash
npm run package              # Validate build + generate Exchange metadata
node scripts/build-ccx.js   # Build per-host .ccx files into release/
```

`npm run package` validates the build, syncs the manifest version, verifies icons, and generates Exchange metadata. `build-ccx.js` then creates a single `.ccx` containing a multi-host manifest that works across Premiere Pro, After Effects, and Audition.

**Automated releases:** Push a version tag (e.g. `git tag v1.14.0 && git push --tags`) and the [Release workflow](.github/workflows/release.yml) runs CI, builds all `.ccx` files, and publishes a GitHub Release with install instructions and downloadable assets.

### Distribution Options

| Method                  | Use Case                                                          |
| ----------------------- | ----------------------------------------------------------------- |
| **Double-click `.ccx`** | End users: download and double-click to install                   |
| **UPIA CLI**            | IT automation: `UnifiedPluginInstallerAgent --install plugin.ccx` |
| **UXP Developer Tool**  | Development: load `dist/manifest.json` directly                   |
| **Adobe Admin Console** | Enterprise: deploy via managed packages to user groups            |

A `.ccx` file is a ZIP archive — no digital signatures required (unlike legacy `.zxp`).

See the [Enterprise Deployment Guide](./docs/enterprise-deployment.md) for Admin Console, UPIA, and pre-configuration details.

### Network Requirements

The plugin requires access to these domains (configure in corporate firewalls):

| Domain            | Purpose                  |
| ----------------- | ------------------------ |
| `*.kaltura.com`   | Kaltura REST API and CDN |
| `*.kaltura.cloud` | Kaltura cloud endpoints  |

## CI/CD

GitHub Actions runs on every PR and push to `main`:

1. **Lint** — ESLint + Prettier
2. **Type Check** — `tsc --noEmit`
3. **Test** — Jest with coverage (artifact uploaded)
4. **Build** — Production webpack build + manifest validation

## UXP Constraints

Adobe UXP is not a full browser. Key limitations to be aware of when contributing:

- **No CSS Grid** — use Flexbox only (all layouts use `display: flex`)
- **No `box-shadow`** — use borders and background colors for depth
- **No `window` global** — use UXP equivalents
- **No `@font-face`** — system fonts only
- **No `TextEncoder` / `TextDecoder`** — use manual `charCodeAt` conversion for string-to-bytes
- **No `data-*` attribute CSS selectors**
- **`FormData` + `Blob` unreliable for binary uploads** — build multipart bodies manually with `Uint8Array`
- **`fs.readFile(path)` without encoding returns `ArrayBuffer`** — do NOT pass `{ encoding: "buffer" }`
- **`fetch()` available**; `XMLHttpRequest` needed for upload progress tracking
- **Spectrum Web Components crash on rapid create/destroy** — defer view transitions with `setTimeout(0)`
- **Uncaught exceptions corrupt UXP scripting engine** — always use a React ErrorBoundary at the app root

See [UXP Lessons Learned](./docs/UXP_LESSONS_LEARNED.md) for detailed patterns and workarounds.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, coding standards, and how to submit changes.

## Further Reading

- [UXP Lessons Learned](./docs/UXP_LESSONS_LEARNED.md) — hard-won patterns for UXP plugin development, Kaltura upload API, Premiere Pro export API
- [Enterprise Deployment Guide](./docs/enterprise-deployment.md) — Admin Console, UPIA, pre-configuration
- [Adobe UXP for Premiere Pro](https://developer.adobe.com/premiere-pro/uxp/) — official API reference
- [Kaltura Developer Portal](https://developer.kaltura.com/) — API docs, test console, client libraries
- [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) — UI component library

## License

[AGPL-3.0](LICENSE)
