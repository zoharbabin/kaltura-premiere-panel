# Kaltura for Adobe Creative Cloud

> **From Timeline to Audience.** A native [Adobe UXP](https://developer.adobe.com/premiere-pro/uxp/) panel integrating [Kaltura's](https://developer.kaltura.com/) enterprise video platform with Adobe Premiere Pro, After Effects, and Audition.

Browse, import, publish, AI-caption, translate, review, and analyze video content — all without leaving your Adobe app.

## Features

| Capability            | Description                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browse & Search**   | Search your Kaltura library with [eSearch](https://developer.kaltura.com/api-docs/service/eSearch) across titles, transcripts, visual content, and metadata |
| **Import**            | Download and import Kaltura assets with proxy/original workflow for remote editing                                                                          |
| **Publish**           | Export sequences and upload to Kaltura with metadata, categories, access controls, and approval workflows                                                   |
| **AI Captioning**     | One-click [REACH](https://corp.kaltura.com/products/video-accessibility-reach/) captioning: machine, human-reviewed, or professional — in 60+ languages     |
| **Translation**       | Multi-language translation from existing captions, directly importable as caption tracks                                                                    |
| **Review**            | Kaltura review annotations sync as color-coded timeline markers; reply with threaded comments from the panel                                                |
| **Analytics**         | Viewer engagement heatmap overlay on the timeline with drop-off markers and top-moments analysis                                                            |
| **Interactive Video** | Author chapters, cue points, quizzes, and hotspots; sync Premiere markers to Kaltura chapters                                                               |
| **Governance**        | Content holds, audit trail, license expiry warnings, access control profiles, DRM indicators                                                                |
| **Offline Mode**      | Browse cached assets offline, queue operations for sync when reconnected                                                                                    |

## Prerequisites

- **Adobe Premiere Pro**, **After Effects**, or **Audition** v25.2 or later
- **Node.js** 18+ and **npm** (for development)
- A **Kaltura** account with API access ([sign up](https://developer.kaltura.com/))
- [UXP Developer Tool](https://developer.adobe.com/premiere-pro/uxp/devtools/) (for loading during development)

## Install (End Users)

### One-Click Install (recommended)

Requires [GitHub CLI](https://cli.github.com/) (`gh`). Open Terminal (macOS) or PowerShell (Windows) and paste:

**macOS:**

```bash
gh release download --repo zoharbabin/kaltura-premiere-panel --pattern 'quick-install.sh' --dir /tmp && bash /tmp/quick-install.sh
```

**Windows (PowerShell as Administrator):**

```powershell
gh release download --repo zoharbabin/kaltura-premiere-panel --pattern 'quick-install.ps1' --dir $env:TEMP; & "$env:TEMP\quick-install.ps1"
```

This downloads the latest release, runs the installer, and opens the plugin in your Adobe app.

> **For After Effects or Audition:** set `KALTURA_HOST_APP=aftereffects` (or `audition`) before running.

### Manual Install

Go to [**Releases**](../../releases/latest) and download the files for your platform.

#### macOS

1. Download `install-mac.sh` and the `.ccx` for your app (e.g. `kaltura-panel-x.x.x-premierepro.ccx`)
2. Place both files in the same folder
3. Open **Terminal**, `cd` to that folder, and run:
   ```bash
   chmod +x install-mac.sh && ./install-mac.sh
   ```
4. Open Premiere Pro → **Window → UXP Plugins → Kaltura**

#### Windows

1. Download `install-win.bat` and the `.ccx` for your app
2. Place both files in the same folder
3. **Double-click** `install-win.bat`
4. Open Premiere Pro → **Window → UXP Plugins → Kaltura**

> **Why not double-click the `.ccx`?** Adobe's Creative Cloud Desktop only recognizes `.ccx` double-click install for Photoshop. For Premiere Pro, After Effects, and Audition, the installer scripts use Adobe's UPIA (Unified Plugin Installer Agent) to install the plugin correctly.

## Development Setup

```bash
# Install dependencies
npm install

# Start development build with file watching
npm run dev

# In a separate step, load the plugin:
# 1. Open UXP Developer Tool
# 2. Click "Add Plugin" and select dist/manifest.json
# 3. Click "Load" to sideload into Premiere Pro
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
| `npm run typecheck`     | TypeScript type check (no emit)                        |
| `npm run package`       | Build + validate manifest + generate Exchange metadata |
| `npm run ci`            | Full CI pipeline: lint, typecheck, test, build         |

## Architecture

### Technology Stack

- **[Adobe UXP](https://developer.adobe.com/premiere-pro/uxp/)** (Manifest v5) — Adobe's modern JavaScript extensibility platform, replacing CEP/ExtendScript
- **React 18** — functional components, hooks, lazy-loaded panels via `React.lazy` + `Suspense`
- **[Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/)** — Adobe's design system as web components (`sp-button`, `sp-textfield`, etc.) for native look and feel
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
plugin/manifest.json            # UXP Manifest v5 — hosts, permissions, entrypoints
src/
  index.tsx                     # UXP entrypoints.setup() + React root render
  App.tsx                       # Auth gate, 18-service initialization, tab router
  panels/                       # 8 tab panels (Login, Browse, Publish, Captions, Review,
                                #   Analytics, Interactive, Settings)
  components/                   # 9 shared UI components (FilterBar, ConfirmDialog,
                                #   ErrorBanner, LoadingSpinner, ProgressBar, etc.)
  services/                     # 22 service modules (see Service Layer below)
  hooks/                        # useAuth, useDebounce
  types/                        # TypeScript types: Kaltura API, Premiere API, Spectrum stubs
  utils/                        # Constants, error classes, formatters, logger, thumbnail URLs
tests/                          # Jest unit + integration tests (mirrors src/ structure)
scripts/package.js              # Build validation, manifest sync, .ccx packaging
docs/                           # Enterprise deployment guide, research document
```

### Service Layer

18 services are instantiated in `App.tsx` via `useMemo`, organized by domain:

| Service                  | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `KalturaClient`          | Low-level HTTP: single/multi-request, KS injection, error normalization                             |
| `AuthService`            | Email/password, App Token, SSO (three-party OAuth), session auto-refresh                            |
| `MediaService`           | Media CRUD, eSearch, batched detail fetching                                                        |
| `UploadService`          | Chunked resumable uploads (5 MB chunks, `XMLHttpRequest` for progress)                              |
| `DownloadService`        | Download flavors + import into host app with progress tracking                                      |
| `MetadataService`        | Standard/custom metadata fields, tags, category hierarchy                                           |
| `CaptionService`         | REACH captioning: order, translate, parse SRT/VTT, track management                                 |
| `SearchService`          | eSearch: transcript, visual, in-video content search with highlights                                |
| `NotificationService`    | WebSocket push notifications with HTTP polling fallback                                             |
| `ReviewService`          | Annotation CRUD, threaded replies, marker color-code sync                                           |
| `PublishWorkflowService` | Multi-destination publish, approval, versioning, scheduling                                         |
| `AnalyticsService`       | Viewer stats, second-level engagement data, top moments, drop-off                                   |
| `InteractiveService`     | Chapters, quizzes, hotspots, CTAs via cue points                                                    |
| `BatchService`           | Multi-entry operations, offline cache integration, governance tags                                  |
| `ProxyService`           | Proxy download for editing, reconnect to original for export                                        |
| `AuditService`           | Audit trail logging, access control profiles, DRM, license expiry                                   |
| `OfflineService`         | LRU cache (200 entries / 50 MB), operation queue for offline-to-online sync                         |
| `HostService` + factory  | Abstract host interface → `PremiereHostAdapter` / `AfterEffectsHostService` / `AuditionHostService` |

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

**495 tests** across **44 suites** — all passing.

```bash
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report
```

- **Framework:** Jest + jsdom + React Testing Library
- **Coverage thresholds** (enforced in CI): statements 72%, branches 58%, functions 68%, lines 73%
- **Test structure** mirrors `src/`: panels (8), components (9 + integration), services (19), hooks (2), utils (4), integration (1)
- **Mocking:** UXP and host app modules mocked globally in `tests/setup.ts`; `fetch` mocked globally — no live API calls in CI

## Packaging & Distribution

```bash
npm run package              # Validate build + generate Exchange metadata
node scripts/build-ccx.js   # Build per-host .ccx files into release/
```

`npm run package` validates the build, syncs the manifest version, verifies icons, and generates Exchange metadata. `build-ccx.js` then creates one `.ccx` per host app (Premiere Pro, After Effects, Audition), each with a single-host manifest as Adobe requires for production distribution.

**Automated releases:** Push a version tag (e.g. `git tag v1.0.0 && git push --tags`) and the [Release workflow](.github/workflows/release.yml) runs CI, builds all `.ccx` files, and publishes a GitHub Release with install instructions and downloadable assets.

### Distribution Options

| Method                  | Use Case                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| **Installer scripts**   | End users: `install-mac.sh` / `install-win.bat` (uses UPIA under the hood) |
| **UPIA CLI**            | IT automation: `UnifiedPluginInstallerAgent --install plugin.ccx`          |
| **UXP Developer Tool**  | Development: load `dist/manifest.json` directly                            |
| **Adobe Admin Console** | Enterprise: deploy via managed packages to user groups                     |

A `.ccx` file is a ZIP archive — no digital signatures required (unlike legacy `.zxp`). Note: `.ccx` double-click install only works for Photoshop; for Premiere Pro, After Effects, and Audition, use the installer scripts or UPIA.

See the [Enterprise Deployment Guide](./docs/enterprise-deployment.md) for Admin Console, UPIA, and pre-configuration details.

### Network Requirements

The plugin requires access to these domains (configure in corporate firewalls):

| Domain                | Purpose                             |
| --------------------- | ----------------------------------- |
| `*.kaltura.com`       | Kaltura REST API and CDN            |
| `*.kaltura.cloud`     | Kaltura cloud endpoints             |
| `wss://*.kaltura.com` | Real-time notifications (WebSocket) |

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
- **No Node.js APIs** — use `uxp.storage` instead of `fs`/`path`
- **No `data-*` attribute CSS selectors**
- **`fetch()` available**; `XMLHttpRequest` used for upload progress tracking
- **`WebSocket` available** in UXP runtime

## Further Reading

- [Research & Strategy Document](./docs/Kaltura_Adobe_Premiere_Integration_Research.md) — market analysis, personas, competitive landscape, phased roadmap
- [Enterprise Deployment Guide](./docs/enterprise-deployment.md) — Admin Console, UPIA, pre-configuration
- [Adobe UXP for Premiere Pro](https://developer.adobe.com/premiere-pro/uxp/) — official API reference
- [Kaltura Developer Portal](https://developer.kaltura.com/) — API docs, test console, client libraries
- [Spectrum Web Components](https://opensource.adobe.com/spectrum-web-components/) — UI component library

## License

[AGPL-3.0](LICENSE)
