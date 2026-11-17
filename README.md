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

## Support reminders

The app offers a support reminder on a later instance overview visit after 14 days, three active days, and a successful bot spawn.
It waits during loading, bot startup, errors, other dialogs, and cookie consent.
The reminder leaves the overview usable and appears at most once every six months.
**Don't remind me again** and **I already support SoulFire** disable automatic reminders.
The account menu always includes a support link.

Eligibility and preferences stay in local storage without user or bot identifiers and do not depend on PostHog consent.
Only three active dates are retained.
Existing users start the new usage criteria when they first use this version. Previous dismissals retain a six-month cooldown.

## Installation

> [!TIP]
> Want to check out how SoulFire looks before installing it? Take a look at the official [demo page](https://demo.soulfiremc.com).

For installing SoulFire, please refer to the [installation guide](https://soulfiremc.com/docs/installation).

<a href='https://flathub.org/apps/com.soulfiremc.soulfire'>
<img width='240' alt='Get it on Flathub' src='https://flathub.org/api/badge?locale=en'/>
</a>

## Cast displays

The desktop app can show instance metrics on Chromecast and Cast-enabled TVs. Read the [casting guide](docs/casting.md) for controls, recovery, and development.

## Deployments

Cloudflare Workers serve the web app. Each release channel is one Worker with two domains:

| Branch    | Worker                    | App                                                      | Demo                                                               |
| --------- | ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `release` | `soulfire-client`         | [app.soulfiremc.com](https://app.soulfiremc.com)         | [demo.soulfiremc.com](https://demo.soulfiremc.com)                 |
| `main`    | `soulfire-client-preview` | [preview.soulfiremc.com](https://preview.soulfiremc.com) | [preview-demo.soulfiremc.com](https://preview-demo.soulfiremc.com) |

The demo domains serve the same build as the app domains. The hostname turns on demo mode.
Demo links on preview builds open the preview demo, and links between channels keep demo mode.

`cloudflare.config.ts` defines both Workers and their domains. The `preview` mode selects `soulfire-client-preview` and the preview app environment.
The Workers are assets-only, so no Worker code runs. Paths that match no file get `index.html`, so client-side routes work.
A missing chunk from an older deploy also gets `index.html`. The app reloads the page when a chunk fails to load.

The Deploy Web workflow builds and deploys with the [`cf` CLI](https://developers.cloudflare.com/cf/):

- Pushes to `release` deploy production with `cf deploy --mode production`.
- Pushes to `main` deploy preview with `cf deploy --mode preview`.
- Pull requests from this repository get a Worker Preview, and the workflow comments its URL.

The workflow needs the `CLOUDFLARE_API_TOKEN` secret. It is an account API token that can edit Workers scripts and the routes in the `soulfiremc.com` zone.

To deploy by hand, sign in with `bunx cf auth login`, then run:

```bash
bunx cf build --mode preview
bunx cf deploy --prebuilt --mode preview
```

Use `--mode production` for production. `bunx vite preview --mode preview` serves the last build locally in the Workers runtime.

## Building

Install Bun at the version in `package.json` and the Node.js LTS used by CI before you build the client.
Take a look at the scripts in `package.json` to see how to run a dev env locally.
You can also refer to the GitHub actions workflows to see how production builds are made.

### Analytics consent

PostHog waits for a choice in the cookie banner before it captures events.
Acceptance enables analytics cookies, user identification, and per-user activation tracking.
Rejection enables limited cookieless analytics without user identification or activation storage.
Users can change their choice through **Cookie preferences** on the login screen or in the account menu.

Servers store a persistent installation UUID in the database and return it through `ServerInfo.installation_id`.
After consent, the client identifies each user with `soulfire:<installation UUID>:<user UUID>`.
This keeps root accounts from different installations separate. Database copies preserve the installation UUID.
The client resets legacy analytics identities without changing consent. Older servers without this field keep anonymous analytics.

For each client PostHog project, enable **Settings > Project > Web analytics > Enable cookieless tracking**.
PostHog drops cookieless events if this setting is disabled.

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

## Contributing and support

Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and review expectations.
Use [SUPPORT.md](SUPPORT.md) for questions and issue routing.
Follow the [community code of conduct](https://github.com/soulfiremc-com/.github/blob/main/CODE_OF_CONDUCT.md) and report vulnerabilities through the [private security contacts](https://github.com/soulfiremc-com/.github/blob/main/SECURITY.md).
