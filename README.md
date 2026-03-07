# Kaltura for Adobe Creative Cloud

> **From Timeline to Audience.** A native UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro, After Effects, and Audition.

## What This Does

Browse, import, publish, AI-caption, translate, review, and analyze video content — all without leaving your Adobe app.

| Capability          | Description                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Browse & Search** | Search your Kaltura library with AI-powered search across titles, transcripts, visual content, and metadata |
| **Import**          | Download and import Kaltura assets with proxy/original workflow for remote editing                          |
| **Publish**         | Export sequences and upload to Kaltura with metadata, categories, and access controls                       |
| **AI Captioning**   | One-click REACH captioning: machine, machine+human review, or professional — in 30+ languages               |
| **Translation**     | Multi-language translation from existing captions, directly importable as caption tracks                    |
| **Review**          | Kaltura review comments sync as color-coded timeline markers; reply from the panel                          |
| **Analytics**       | Viewer engagement heatmap overlay on the timeline with drop-off markers                                     |
| **Governance**      | Content holds, audit trail, license expiry warnings, access control, DRM indicators                         |
| **Offline Mode**    | Browse cached assets offline, queue operations for sync when reconnected                                    |

## Architecture

- **Adobe UXP** (Manifest v5) — no legacy CEP/ExtendScript
- **React 18** + **Spectrum Web Components** — native Adobe look and feel
- **Kaltura REST API** with multi-request batching and chunked upload
- **Multi-app:** Premiere Pro, After Effects, Audition via HostService abstraction
- **Minimum:** Premiere Pro / After Effects / Audition v25.2+
- **Distribution:** `.ccx` package via Adobe Exchange

## Test Suite

- **387 tests** across **34 suites** — all passing
- Jest + jsdom with React Testing Library
- CI: Lint, Type Check, Test, Build on every PR

## Quick Start

```bash
npm install
npm run dev          # Development build with watch
npm run test         # Run all tests
npm run build        # Production build
npm run package      # Build + validate + Exchange metadata
```

## Project Status

All phases complete (Foundation, AI & Captioning, Collaboration, Advanced Features). See the [Research & Strategy Document](./docs/Kaltura_Adobe_Premiere_Integration_Research.md) for comprehensive analysis.

## License

[AGPL-3.0](LICENSE)
