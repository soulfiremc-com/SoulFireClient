# Repository instructions

These instructions apply to coding agents working in this repository.

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
- `@shadcn/lint` enforces unknown classes, raw colors, arbitrary values, component restyling, static classes, and inline styles as errors.
- Arbitrary layout values are allowed. Component restyling uses explicit contracts for existing consumer styling, with broader spacing or typography contracts only where those component parts need them.
- Inline styles are restricted to the listed properties in specific chart, editor, and positioning files. Three files with dynamic style objects have file-specific exemptions.
- All six shadcn rules are off in `src/components/ui/`.
- Oxlint's other checks still run in `src/components/ui/`.
- Oxfmt leaves `src/components/ui/` unchanged.
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

## React conventions

- Use PascalCase for React component names. Match the existing component filename convention.
- Use kebab-case for new hook and utility filenames, unless this repository documents another convention.
- Use stable domain identities as React keys. Do not use array indexes as keys.
- Use an existing `generateN` helper or stable placeholder IDs for fixed skeleton slots.
- Keep page structure, headings, navigation, labels, and independent content mounted while data loads.
- Show skeletons only for unresolved values, rows, and permission-dependent actions. Do not block a page on its slowest query.

## Tailwind spacing

- Use `gap-*` utilities for spacing between elements. Do not use `space-*` utilities.

## shadcn/ui

- For shadcn/ui work, use the `shadcn` skill and component documentation.
- Compose existing shadcn/ui components before writing custom primitives. Use `Field`, `InputGroup`, and `Item` where appropriate.

## Design skills

- For visual design work, use `frontend-design` and `uncodixfy`.
