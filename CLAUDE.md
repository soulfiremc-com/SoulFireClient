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

## Rollout dry runs and logging

Before every deployment or rollout, perform a dry run and review verbose logs of the exact planned changes.
This applies to artifact uploads, staged replacements, configuration changes, migrations, restarts, releases, and pushes that trigger automatic deployments.

- Verify the target environment, cluster context, namespace, service, and destination paths before any mutation.
- Record the current state and a complete artifact inventory, including filenames, plugin identities, versions, and checksums where applicable.
- Build one explicit change plan. List every file or resource to create, replace, remove, migrate, or restart.
- Use exact artifact names and paths for replacements and removals. Do not use broad globs or shared name prefixes.
- Keep related plugins distinct. `AuthMe*.jar` also matches AuthMeVelocity and must never select AuthMeReloaded files for removal.
- Use the tool's native dry-run or plan mode and verbose output when available. Review the resulting diff before applying it.
- If no native dry run exists, produce a non-mutating preview from the same selection logic and explicit change plan.
- For custom scripts, provide dry-run and verbose modes. Both modes must use the same plan as the real operation.
- Log each planned and applied action with its exact target and reason. Include before-and-after identities, versions, and checksums where applicable.
- Redact secrets and personal data before output. Do not print whole credential-bearing configurations or enable shell tracing around secrets.
- Stop if the preview includes unrelated changes, unexpected removals, ambiguous targets, or unverified artifacts. Correct the plan before proceeding.
- Prepare rollback copies outside active and staged artifact directories before replacing or removing artifacts.
- Apply only the reviewed plan. If the target state changes, repeat the dry run before applying it.
- Compare complete inventories after applying the plan. Exclude only the exact intended filenames, never a shared prefix.
- Verify unrelated artifacts remain present and unchanged. Account explicitly for documented self-updating artifacts.
- Verify the affected user flow after rollout. Healthy pods and successful authentication alone do not prove cross-plugin handoffs work.
- For authentication changes, verify login, the message to the proxy, and transfer from the login server to the destination.
- Report the dry-run result, applied changes, rollback location, and live verification. Preserve existing user authorization requirements.
