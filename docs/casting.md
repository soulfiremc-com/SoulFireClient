# Casting instance metrics

Open **Cast** from the account menu in the desktop app. Choose an instance, then connect to a display. Device discovery requires access to the local network. Manual connection accepts a hostname, IPv4 address, or IPv6 address and a Cast port.

**Show on TV** restarts the SoulFire receiver and restores recent metrics and display settings. Use this action after pressing Home on the TV. It does not install an Android TV application. Receiver readiness and visibility are separate states, and some devices report visibility as unknown.

**Reconnect** restores a failed connection. **Stop casting** stops the receiver and releases its resources. Selecting another instance does not change the current broadcast. **Cast selected instance** makes that change explicitly.

Display settings apply to every active display and survive desktop app restarts. Credentials remain in the desktop process and never enter the receiver protocol.

## Ownership and lifetime

The Electron main process owns Cast discovery, sockets, connection workflows, and metrics acquisition through Effect v4 services. Each connection attempt has a generation identifier. Old callbacks cannot change a replacement connection.

A Cast session owns an independent query cache and polling worker. Desktop navigation and renderer focus do not suspend this worker. Metrics requests use the existing SoulFire gRPC-Web API and the current user's credentials. Authentication changes cancel all Cast sessions and clear their instance state.

TanStack Query caches RPC results. Effect owns polling, cancellation, transport recovery, and resource cleanup. The renderer uses TanStack Store to observe main-process status. TanStack Router owns the selected instance in the Cast page URL. Form, Table, Hotkeys, and Pacer handle settings, device rows, scoped shortcuts, and debounced input.

A transient metrics error keeps the receiver connected. The receiver retains its charts and marks old samples as delayed. Transport errors trigger at most five retries with exponential delays. Permission and authentication errors require user action.

## Protocol changes

The authoritative Effect Schema package lives in `SoulFireChromecast/packages/cast-protocol`. This repository consumes a built archive from `vendor/`. Its exports include ESM and CommonJS JavaScript and TypeScript declarations.

To update the dependency:

1. Update and version the protocol package in the receiver repository.
2. Run `bun run protocol:pack` there.
3. Copy its archive into this repository's `vendor/` directory.
4. Remove the previous protocol dependency with `bun remove @soulfiremc/cast-protocol`.
5. Add the new archive with `bun add ./vendor/<archive-name>.tgz`.
6. Remove the previous archive and run the checks below.

The remove/add sequence avoids duplicate archive dependency entries in Bun. Check in the new archive, manifest, and generated lockfile together. Normal client builds require no sibling checkout or package registry access for this contract.

Coordinate the receiver deployment and desktop release. The previous challenge-based protocol is replaced. Preserve the existing receiver app ID and namespace. The new handshake rejects incompatible protocol versions.

## Validation

```sh
bun run typecheck
bun run test:cast
bun run check
bun run build:electron:dir
```

The tests use fake transports, in-process Connect RPC handlers, and Effect's controlled clock. They cover session replacement, cancellation, cleanup, backoff, history transfer, RPC cursors, and authentication changes.

Before release, verify launch, Home followed by Show on TV, network interruption, desktop backgrounding, client restart, competing senders, and Stop casting on physical Cast devices. Automated launch tests do not verify a TV's foreground behavior.
