# Troubleshooting

See the [README](README.md) for what the plugin does and how to install it. This page covers what to do when something isn't working.

**Sidebar won't open.**
Run "Toggle TODO sidebar" from the command palette, or use the ribbon icon. Default hotkey is `Cmd/Ctrl+Shift+T`.

**A `#todo` I wrote isn't showing up.**
Check that it's not inside a code block or wrapped in backticks; the scanner skips both so documentation about the tag syntax doesn't get picked up as a real TODO. Also confirm the file isn't in an excluded folder (Settings → excluded folders).

**Projects tab is empty.**
Three common causes: no base folder is set (Settings → Projects → "Projects base folder"), `git` isn't installed or isn't on your PATH, or none of the folders under the base path are git repos with a top-level `.git` directory (submodules are skipped on purpose).

**Projects sync isn't picking up a change I made to `BUGS.md` or `TODO.md`.**
The background watcher should catch it automatically. If it doesn't, run the "Sync Projects" command or use **Sync** in the Projects tab's kebab menu to force a rescan.

**A prose-style bug write-up won't move to "Fixed."**
The mover refuses to relocate a block if the file has uncommitted changes, so a mistake can't strand your work partway through a move. Commit or stash first, then try again.

**Projects, or the whole plugin, doesn't load on mobile.**
That's expected. Projects needs Node's `fs` and `child_process`, so the entire plugin is marked desktop only (`isDesktopOnly: true`).

**Still stuck?**
[Open an issue](https://github.com/robotpony/warped-command/issues) with your plugin version (`manifest.json`), Obsidian version, and steps to reproduce.

## Known limitations

- **Desktop only.** The whole plugin, not just Projects, is unavailable on Obsidian mobile.
- **Not on the Community Plugins list yet.** Install from source (see [README](README.md#installation)) rather than through Obsidian's plugin browser.
- **Projects tracks folders on disk, not other vaults.** It's for git repos alongside your vault, not for linking two Obsidian vaults together.
- **Git submodules are skipped** when scanning for project repos.
