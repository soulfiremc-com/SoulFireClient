# Contributing to SoulFireClient

SoulFireClient provides the browser UI and Electron desktop app for SoulFire.
This guide covers local development, validation, and pull requests.

## Before you start

Search [open and closed issues](https://github.com/soulfiremc-com/SoulFireClient/issues) before reporting a problem or proposing a feature.
Small fixes can go directly to a pull request. Discuss substantial changes in an issue before implementation.
For usage questions and issue routing, read [SUPPORT.md](SUPPORT.md).
Follow the [community code of conduct](https://github.com/soulfiremc-com/.github/blob/main/CODE_OF_CONDUCT.md).
Report vulnerabilities privately through the [security policy](https://github.com/soulfiremc-com/.github/blob/main/SECURITY.md).

## Local setup

Install Git, Bun at the version in `package.json`, and the Node.js LTS used by the workflows.
Clone this repository or your fork, then run:

```bash
bun install --frozen-lockfile
bun run dev:web
```

Use `bun run dev` for Electron development on a desktop host.
A browser preview covers the web UI. Native integration needs an Electron session.
Use a local SoulFire server for connected workflows. The client also has demo data for disconnected views.
Do not share development tokens or modify production accounts while reproducing a bug.

### Develop components with Storybook

Run `bun run storybook` and open `http://localhost:6006`.
Storybook shows application components without Electron or a SoulFire server.
The initial stories cover fleet summaries, health and food meters, and server dialogs.
Use the theme toolbar to switch between light and dark mode.
Controls change component props. The Accessibility panel reports problems in the current story.

Place each story beside its component in a `PascalCase.stories.tsx` file.
Import `Meta` and `StoryObj` from `@storybook/react-vite` for typed stories.
Use real application components and representative fixtures for meaningful states.
Create Protobuf fixtures with `create()` and the generated message schema.
Add a `play` function for interactions that need regression checks.
Import assertions and spies from `storybook/test`.

The shared preview loads application styles, English translations, and the tooltip provider.
Add query, router, or transport providers in decorators for stories that need them.
Use local fixtures or mocked transports to keep stories independent of live services.
Storybook uses its own Vite configuration to avoid Electron startup, route generation, and application devtools.

Install Chromium once before running the component tests:

```bash
bunx playwright install chromium
bun run test:storybook
```

These tests render every story in Chromium and run its interactions and accessibility checks.
The server dialog stories cover submission, pending actions, dismissal with an invalid number, and drafts after failed submissions.
Existing unit tests still run with `bun test`.
Run `bun run build:storybook` to create a static preview in `storybook-static/`.
CI builds Storybook and runs its component tests.

## Find the relevant code

| Location          | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `src/routes/`     | File-based routes and authenticated layouts                  |
| `src/components/` | Application UI and the visual script editor                  |
| `src/lib/`        | RPC transport, query helpers, and conversion logic           |
| `src/stores/`     | Editor, POV, and terminal session state                      |
| `electron/`       | Main process, preload, updater, tray, and native integration |
| `src/generated/`  | Checked-in Protobuf bindings                                 |
| `locales/`        | Translation resources synchronized through Crowdin           |

## Code and generated files

Use React components in PascalCase and hook or utility files in kebab-case.
Use stable identities for React keys and `gap-*` utilities for layout spacing.
Keep unresolved values and actions in leaf loading states while headings and navigation remain mounted.
Try changes in application consumers before modifying `src/components/ui/`.
Keep Electron main, preload, and renderer boundaries explicit.
Do not expose unrestricted native APIs to the renderer.

Oxlint and Oxfmt enforce the configured conventions. Run `bun run check` before submission.
For intentional edits, use `bun run fix` and review its diff.
Husky installs the pre-commit hook during dependency installation. The hook runs lint-staged.

Run `bun run generate-routes` after changes that require a route tree update.
Do not edit generated routes or protocol bindings by hand.
For a protocol update, follow [the RPC binding workflow](README.md#update-rpc-bindings).
Commit the remote source pin, generated bindings, and affected client code together.
New client features must handle older servers that omit optional fields or do not implement new methods.
For translations, inspect `crowdin.yml` and keep locale keys aligned with the source language.

## Validate

```bash
bun run typecheck
bun run check
bun test
bun run build:web
```

For Electron JavaScript tests, also run:

```bash
node --test electron/*.test.mjs
```

For desktop integration changes, build an unpacked app with `bun run build:electron:dir` and exercise the affected native workflow.
Report the OS and architecture. Check update, tray, launch, or integrated-server behavior if your change affects it.
For UI changes, check keyboard access, focus, narrow layouts, and loading or error states.
CI regenerates RPC bindings and checks for unexpected changes, typechecks, checks formatting and lint, and builds the web app.
The desktop build matrix covers Windows, macOS, and Linux on the configured architectures.

## Submit a pull request

Keep the change focused on one problem. Avoid unrelated formatting and dependency updates.
Use Conventional Commit subjects such as `docs(contributing): clarify local setup` or `fix(build): correct packaging`.
Use a meaningful scope, imperative wording, and a subject under 72 characters.
For non-trivial changes, add a body that explains the motivation and important tradeoffs.
For breaking changes, include a `BREAKING CHANGE:` footer and migration instructions.
Do not bypass Git hooks. Let all configured checks finish.

Complete the pull request template with the problem, resulting behavior, and affected files.
If a related issue exists, link it.
Use `Closes #123` only if the change fully resolves that issue.
Record exact check commands, results, client/server versions, and platform-specific observations.
Explain any checks that you could not perform.
For visible changes, include screenshots and the environment used to capture them.
Open a draft for early feedback on substantial changes.
Respond to review comments and rerun affected checks after revisions.

Update documentation and examples with behavior changes. Remove obsolete code rather than leaving placeholders or shims.
Do not commit credentials, private logs, dependency directories, or generated build artifacts.
Respect existing license notices and submit only material that you have the right to contribute.
