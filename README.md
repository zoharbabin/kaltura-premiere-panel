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

## Quick Start

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

| Script                  | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `npm run dev`           | Development build with watch mode                                      |
| `npm run build`         | Production build (outputs to `dist/`)                                  |
| `npm test`              | Run all tests                                                          |
| `npm run test:coverage` | Run tests with coverage report                                         |
| `npm run lint`          | ESLint check                                                           |
| `npm run lint:fix`      | ESLint auto-fix                                                        |
| `npm run typecheck`     | TypeScript type check (no emit)                                        |
| `npm run package`       | Build + validate manifest + generate Exchange metadata + create `.ccx` |
| `npm run ci`            | Full CI pipeline: lint, typecheck, test, build                         |

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
  App.tsx                       # Auth gate, 19-service initialization, tab router
  panels/                       # 8 tab panels (Login, Browse, Publish, Captions, Review,
                                #   Analytics, Interactive, Settings)
  components/                   # 10 shared UI components (FilterBar, ConfirmDialog,
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

19 services are instantiated in `App.tsx` via `useMemo`, organized by domain:

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

**506 tests** across **45 suites** — all passing.

```bash
npm test                  # Run all tests
npm run test:coverage     # Run with coverage report
```

- **Framework:** Jest + jsdom + React Testing Library
- **Coverage thresholds** (enforced in CI): statements 72%, branches 58%, functions 68%, lines 73%
- **Test structure** mirrors `src/`: panels (8), components (11), services (19), hooks (2), utils (4), integration (1)
- **Mocking:** UXP and host app modules mocked globally in `tests/setup.ts`; `fetch` mocked globally — no live API calls in CI

## Packaging & Distribution

```bash
npm run package
```

This validates the build output, syncs the manifest version, verifies icons, reports bundle size, generates Adobe Exchange listing metadata, and creates a `.ccx` package.

### Distribution Options

| Method                  | Use Case                                                                  |
| ----------------------- | ------------------------------------------------------------------------- |
| **UXP Developer Tool**  | Development: load `dist/manifest.json` directly                           |
| **`.ccx` package**      | End users: double-click to install via Creative Cloud Desktop             |
| **Adobe Admin Console** | Enterprise: deploy via managed packages to user groups                    |
| **UPIA CLI**            | IT automation: `upia install --path "plugin.ccx" --targets "premierepro"` |

A `.ccx` file is a ZIP archive recognized by Creative Cloud Desktop — no digital signatures required (unlike legacy `.zxp`).

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

- **No CSS Grid** — use Flexbox only
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
