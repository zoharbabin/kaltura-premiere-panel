# Kaltura for Adobe Premiere Pro

> **From Timeline to Audience.** A native UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro.

## What This Does

Browse, import, publish, AI-caption, translate, review, and analyze video content — all without leaving Premiere Pro.

| Capability | Description |
|---|---|
| **Browse & Search** | Search your Kaltura library with AI-powered search across titles, transcripts, visual content, and metadata |
| **Import** | Download and import Kaltura assets with proxy/original workflow for remote editing |
| **Publish** | Export sequences and upload to Kaltura with metadata, categories, and access controls |
| **AI Captioning** | One-click REACH captioning: machine, machine+human review, or professional — in 30+ languages |
| **Translation** | Multi-language translation from existing captions, directly importable as Premiere caption tracks |
| **Review** | Kaltura review comments sync as color-coded timeline markers; reply from the panel |
| **Analytics** | Viewer engagement heatmap overlay on the timeline with drop-off markers |

## Architecture

- **Adobe UXP** (Manifest v5) — no legacy CEP/ExtendScript
- **React 18** + **Spectrum Web Components** — native Adobe look and feel
- **Kaltura REST API** with multi-request batching and chunked upload
- **Minimum:** Premiere Pro v25.2+
- **Distribution:** `.ccx` package via Adobe Exchange

## Project Status

See the [Project Roadmap (Issue #36)](https://github.com/zoharbabin/kaltura-premiere-panel/issues/36) for the full implementation plan.

See the [Research & Strategy Document](./docs/Kaltura_Adobe_Premiere_Integration_Research.md) for comprehensive analysis.

## License

[AGPL-3.0](LICENSE)
