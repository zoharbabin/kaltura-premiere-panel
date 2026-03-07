# Kaltura for Adobe Premiere Pro — Development Guidelines

## Project Overview

Native Adobe UXP panel integrating Kaltura's enterprise video platform with Adobe Premiere Pro.
UXP-only (no CEP/ExtendScript). React 18 + Spectrum Web Components. Minimum Premiere Pro v25.2.

## Architecture

- **Runtime:** Adobe UXP (Manifest v5) — lightweight JS engine, NOT a browser
- **UI:** React 18 + `@swc-react/*` (Spectrum Web Components React wrappers)
- **API Client:** `kaltura-client` npm package (auto-generated TypeScript SDK)
- **Host API:** `premierepro` UXP module (only available inside Premiere Pro runtime)
- **Auth:** App Token (`appToken.startSession`) preferred; email/password fallback
- **Distribution:** `.ccx` package via Adobe Exchange

## Directory Structure

```
plugin/manifest.json          # UXP manifest v5
src/
  index.tsx                   # UXP entrypoints.setup() + React render
  App.tsx                     # Root: auth gate, tab router, providers
  panels/                     # Tab panels (Browse, Publish, Captions, Review, Analytics, Settings)
  components/                 # Shared UI components
  services/                   # API service layers (Kaltura, Premiere, Auth, Cache)
  hooks/                      # React custom hooks
  types/                      # TypeScript type definitions
  utils/                      # Pure utility functions
tests/                        # Jest unit + integration tests (mirrors src/ structure)
scripts/                      # Build and dev scripts
docs/                         # Documentation
```

## Code Standards

### TypeScript

- Strict mode enabled (`strict: true` in tsconfig)
- No `any` types except at API boundaries with explicit `// eslint-disable-next-line`
- Prefer `interface` over `type` for object shapes
- Export types from `src/types/` — co-locate only when truly private

### React

- Functional components only — no class components
- Custom hooks for shared logic; prefix with `use`
- Memoize expensive computations with `useMemo`/`useCallback`
- Props interfaces named `{ComponentName}Props`
- No inline styles — use CSS modules or Spectrum components

### UXP Constraints (Critical)

- **No CSS Grid** — use Flexbox only
- **No `window` global** — use UXP equivalents
- **No `@font-face`** — use system fonts only
- **No `data-*` attribute CSS selectors**
- **No Node.js APIs** — no `fs`, `path`, `crypto` from Node; use UXP `uxp.storage` and `uxp.crypto`
- **No `float` CSS** — Flexbox only
- **`fetch()` is available** but `XMLHttpRequest` needed for upload progress tracking
- **`WebSocket` is available** in UXP runtime

### Kaltura API

- Always use multi-request batching when making 2+ related API calls
- Thumbnail URLs constructed client-side (no API call): `https://cdnsecakmi.kaltura.com/p/{partnerId}/thumbnail/entry_id/{entryId}/width/{w}/height/{h}`
- KS (Kaltura Session) stored in `SecureStorage`, never in `localStorage`
- Error responses: check `objectType === 'KalturaAPIException'` on every response
- Client tag: `kaltura-premiere-panel:v{version}`

### Premiere UXP API

- All state-changing operations wrapped in `project.executeTransaction()`
- Use `CompoundAction` to group multiple operations into single undo step
- Time conversion: always use `TickTime.fromSeconds()` / `TickTime.toSeconds()`
- The `premierepro` module is only available at runtime — mock in tests
- Feature-gate by Premiere version via `Application.version`

### Testing

- Jest for unit tests; `tests/` mirrors `src/` directory structure
- Mock `premierepro` module globally in test setup
- Mock HTTP layer for Kaltura API tests — never hit live API in CI
- Test files: `*.test.ts` / `*.test.tsx`
- Minimum coverage targets: 80% statements, 70% branches

### Quality

- ESLint + Prettier enforced via pre-commit hooks and CI
- No `console.log` in production code — use a logger utility
- No hardcoded strings for user-visible text — use constants
- All async operations must have error handling
- Secrets: NEVER commit `KALTURA_ADMIN_SECRET` or any API secrets

## Environment Variables

- `KALTURA_PARTNER_ID` — Kaltura account partner ID (for integration testing only)
- `KALTURA_ADMIN_SECRET` — Kaltura admin secret (for integration testing only; NEVER in CI)
- `KALTURA_SERVICE_URL` — Kaltura API endpoint (default: `https://www.kaltura.com`)

## Build Commands

- `npm run dev` — development build with watch mode
- `npm run build` — production build
- `npm run test` — run all tests
- `npm run test:coverage` — run tests with coverage report
- `npm run lint` — ESLint check
- `npm run lint:fix` — ESLint auto-fix
- `npm run typecheck` — TypeScript type checking
- `npm run package` — create .ccx distribution package

## Branch Strategy

- `main` — stable, production-ready
- `phase/N-name` — phase implementation branches (PR to main)
- Never commit directly to main

## PR Requirements

- All CI checks pass (lint, typecheck, test, build)
- Tests cover new functionality
- Documentation updated
- No `any` types without justification
- No `console.log` statements
