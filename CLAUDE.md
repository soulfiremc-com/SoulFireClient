# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SoulFireClient is a React/TypeScript frontend for the [SoulFire server](https://github.com/soulfiremc-com/SoulFire). It runs on the web and as a desktop app on Windows, macOS, and Linux through Electron.

## Build Commands

```bash
bun install                # Install dependencies
bun run dev                # Start Electron dev mode with Vite
bun run dev:web            # Start Vite dev server for web only
bun run build:web          # Build web bundle
bun run build:electron     # Build packaged Electron artifacts
bun run build:electron:dir # Build unpacked Electron app
bun run typecheck          # TypeScript type checking
bun run check              # Run Biome linter
bun run fix                # Run Biome with auto-fix
bun run generate-routes    # Regenerate TanStack Router route tree
```

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Desktop**: Electron
- **Routing**: TanStack Router (file-based in `src/routes/`)
- **State**: Zustand for editor state, TanStack Query for server state
- **API**: gRPC-Web via Connect RPC using protocol definitions from `@soulfiremc/sdk`
- **UI**: shadcn/ui components, Radix primitives, Lucide icons

### Key Directories
- `electron/` - Electron main, preload, native integration, tray, and updater code
- `src/routes/` - File-based routing. `_dashboard.tsx` is authenticated layout, `_dashboard/user/` for admin pages, `_dashboard/instance/$instance/` for instance-scoped pages
- `src/components/script-editor/` - Visual node-based script editor built on React Flow
- `src/lib/web-rpc.ts` - gRPC transport setup and auth token management
- `src/lib/script-service.ts` - Query options and proto↔JS conversion utilities
- `src/stores/` - Zustand stores (currently just script editor state)
- `scripts/generate-legacy-updater-assets.mjs` - Legacy updater bridge for already-installed Tauri clients

### Import Alias
Use `@/*` to import from `src/` (e.g., `import { Button } from '@/components/ui/button'`)

### Linting
- Biome handles formatting and linting
- Pre-commit hook runs lint-staged with Biome
- Ignored directories: `src/components/ui/`, `src/components/data-table/`

### Proto Generation
When modifying gRPC API:
Protocol definitions are owned by the SoulFire repository and consumed from
the official `@soulfiremc/sdk` package. Do not copy or regenerate them here.
3. Conversion utilities in `src/lib/script-service.ts` may need updates

### Demo Mode
The app supports a demo mode (no server connection) using fallback data from `src/demo-data.ts`. Check `getTransport()` returning null for demo detection.
