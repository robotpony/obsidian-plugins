# Contributing

Warped Command started as a personal tool and the workflows still reflect that, but issues and pull requests are welcome.

## Before you start

- Skim [CLAUDE.md](CLAUDE.md) for build commands, architecture, and the release checklist.
- Skim [plugin-conventions.md](plugin-conventions.md) for UI patterns, CSS naming, and TypeScript conventions this repo follows.
- For anything beyond a small fix, open an issue first to talk through the approach before writing code.

## Setup

```bash
npm install
npm run dev     # watch mode
npm test        # vitest suite
npm run build   # typecheck + production build
```

To test changes in Obsidian, run `./install.sh` to copy the built plugin into a vault (see [README.md](README.md#installation)).

## Pull requests

- Run `npm run build` and `npm test` before opening a PR; both must pass.
- If your change is user-visible, update `README.md` and add a `CHANGELOG.md` entry. Bump the version in `manifest.json` and `package.json` per the [release checklist](CLAUDE.md#release-checklist).
- Keep PRs focused. Unrelated cleanup makes a change harder to review; open a separate PR instead.

## Reporting bugs

[Open an issue](https://github.com/robotpony/warped-command/issues/new/choose) using the bug report template. It'll ask for the plugin version, your Obsidian version, and steps to reproduce; for anything involving the Projects tab, it also asks whether the target folder contains real git repos and what `git --version` reports.
