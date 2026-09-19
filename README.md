<img align="right" src="https://github.com/soulfiremc-com/SoulFire/blob/main/mod/src/main/resources/icons/icon.png?raw=true" height="150" width="150">

[![discord](https://cdn.jsdelivr.net/npm/@intergrav/devins-badges@3/assets/cozy/social/discord-singular_vector.svg)](https://discord.gg/vHgRd6YZmH) [![kofi](https://cdn.jsdelivr.net/npm/@intergrav/devins-badges@3/assets/cozy/donate/kofi-singular_vector.svg)](https://ko-fi.com/alexprogrammerde)

# SoulFireClient

This is a frontend for the [SoulFire server](https://github.com/soulfiremc-com/SoulFire).
It is now packaged as a desktop app with Electron while still using the official SoulFire gRPC API.

> [!NOTE]
> For more info about SoulFire, take a look at the main [SoulFire repository](https://github.com/soulfiremc-com/SoulFire).

## About the client

Built using latest web tech to consistently work on both web, desktop and mobile.
The client is the GUI for the SoulFire server, but it uses the official SoulFire gRPC API.
Anything that can be done using the SF client can also be done using gRPC HTTP API calls directly.

## Installation

> [!TIP]
> Want to check out how SoulFire looks before installing it? Take a look at the official [demo page](https://demo.soulfiremc.com).

For installing SoulFire, please refer to the [installation guide](https://soulfiremc.com/docs/installation).

<a href='https://flathub.org/apps/com.soulfiremc.soulfire'>
<img width='240' alt='Get it on Flathub' src='https://flathub.org/api/badge?locale=en'/>
</a>

## Deployments

See which branches are at which URLs:

- [`release`](https://app.soulfiremc.com) -> app.soulfiremc.com
- [`main`](https://preview.soulfiremc.com) -> preview.soulfiremc.com
- [`demo`](https://demo.soulfiremc.com) -> demo.soulfiremc.com

## Building

Install Bun 1.4.0 and a current Node.js release before you build the client.
Take a look at the scripts in `package.json` to see how to run a dev env locally.
You can also refer to the GitHub actions workflows to see how production builds are made.

### Update RPC bindings

The client generates its RPC bindings directly from the SoulFire repository with [Buf](https://buf.build/docs/generate/).
`buf.gen.yaml` pins the source to a full Git commit hash, independent of server and SDK releases.
The server revision also pins the imported schemas through its `buf.lock`.

1. Push the protocol changes to the SoulFire repository.
2. Set `inputs[0].ref` in `buf.gen.yaml` to that commit's full hash.
3. Run `bun run protocol:generate`.
4. Update affected client code and run `bun run typecheck`, `bun test`, and `bun run build:web`.
5. Commit the pin, generated bindings, and client changes together.

The generated files in `src/generated/` are checked in. Normal builds do not fetch schemas or require a server checkout.
CI regenerates the bindings and checks for differences. Generation requires Git and network access to GitHub and the Buf Schema Registry.
The generator versions are pinned in `package.json` and `bun.lock`.

For local protocol development, run `bun run protocol:generate -- ../SoulFire` to generate from a local server checkout.
Before committing the client changes, update the remote pin and regenerate without the local path.

New client features must handle older servers that omit optional fields or do not implement new RPC methods.

## Sponsors

<table>
 <tbody>
  <tr>
   <td align="center"><img alt="[SignPath]" src="https://avatars.githubusercontent.com/u/34448643" height="30"/></td>
   <td>Free code signing on Windows provided by <a href="https://signpath.io/?utm_source=foundation&utm_medium=github&utm_campaign=soulfire">SignPath.io</a>, certificate by <a href="https://signpath.org/?utm_source=foundation&utm_medium=github&utm_campaign=soulfire">SignPath Foundation</a></td>
  </tr>
 </tbody>
</table>
