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
bun run check              # Run Oxlint and check Oxfmt formatting
bun run fix                # Fix lint findings and format files
bun run generate-routes    # Regenerate TanStack Router route tree
```

## Architecture

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Desktop**: Electron
- **Routing**: TanStack Router (file-based in `src/routes/`)
- **State**: TanStack Store for editor, POV control, and terminal log state; TanStack Query for server state
- **API**: gRPC-Web via Connect RPC using generated bindings in `src/generated/`
- **UI**: shadcn/ui components, Radix primitives, Lucide icons

### Key Directories

- `electron/` - Electron main, preload, native integration, tray, and updater code
- `src/routes/` - File-based routing. `_dashboard.tsx` is authenticated layout, `_dashboard/user/` for admin pages, `_dashboard/instance/$instance/` for instance-scoped pages
- `src/components/script-editor/` - Visual node-based script editor built on React Flow
- `src/lib/web-rpc.ts` - gRPC transport setup and auth token management
- `src/lib/script-service.ts` - Query options and proto↔JS conversion utilities
- `src/stores/` - TanStack Store sessions for the script editor, POV controls, and terminal logs
- `scripts/generate-legacy-updater-assets.mjs` - Legacy updater bridge for already-installed Tauri clients

### Import Alias

Use `@/*` to import from `src/` (e.g., `import { Button } from '@/components/ui/button'`)

### Linting

- Oxlint checks JavaScript and TypeScript. Oxfmt formats the project.
- `@shadcn/lint` checks unknown classes, raw colors, and arbitrary values as errors.
- Arbitrary layout values are allowed. All three shadcn rules are off in `src/components/ui/`.
- Oxlint's other checks still run in `src/components/ui/`.
- Pre-commit hook runs lint-staged with Oxlint and Oxfmt.
- Generated protocol bindings and the route tree are ignored by Oxlint.

### Proto Generation

SoulFire owns the protocol definitions. `buf.gen.yaml` pins their source to a full server commit hash.
Run `bun run protocol:generate` after changing that pin. Commit the generated files in `src/generated/` with the pin.
Do not edit generated files by hand. CI regenerates them and checks for differences.
Normal builds use the checked-in bindings and do not need an SDK release.
Conversion utilities in `src/lib/script-service.ts` may need updates after protocol changes.

### Demo Mode

The app supports a demo mode (no server connection) using fallback data from `src/demo-data.ts`. Check `getTransport()` returning null for demo detection.
