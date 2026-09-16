# TPS Linter

Conservative, explicit Markdown and filename cleanup for TPS notes.

Current release: [0.8.0](https://github.com/ZachTish/tps-linter/releases/tag/0.8.0) · Obsidian 1.10.0+ · Desktop and mobile.

## Install with BRAT

Add `ZachTish/tps-linter` to BRAT. Use manual updates with `Latest`, or freeze an exact numeric tag for a controlled rollout. Each release supplies `main.js`, `manifest.json`, and `styles.css`; release notes record validation and artifact hashes. A published release is not evidence that any device has installed it.

## Clean a note

Use **Check current note** for a read-only report or **Clean current note** to apply enabled rules. **Lint on explicit save** cleans the active editor on Cmd-S/Ctrl-S. Background file changes do not trigger linting; **Also lint on page focus** is separately opt-in and off by default. Automatic linting does not rename files.

**Move tags to frontmatter** is also opt-in. It merges standalone tag-only lines into `tags`, deduplicating case-insensitively. It leaves tags in prose, tasks, fences, indented content, and protected content untouched. Invalid YAML and unsupported tag values are unchanged. Note-level rule exclusions still apply.

## Settings and safeguards

The settings destinations are **Clean notes**, **Headings**, **Frontmatter**, and **Files & safety**. Rules and exclusions are shared vault configuration. Manual filename cleanup, heading rules, whitespace handling, frontmatter order, and diagnostics remain configurable.

Automatic processing respects protected templates and excluded paths. Clean rereads the active content and uses guarded writes; it does not blindly replace a file from an old snapshot. Source-mode content remains Markdown.

See [the detailed reference](REFERENCE.md) for the complete rule list, filename ownership, note-local controls, compatibility behavior, and release-specific validation. The current options and defaults are defined in [src/settings.ts](src/settings.ts).

## Development and repository policy

`main` is the stable source line. Numeric tags identify immutable released artifacts. `optimization` is an unreleased work-in-progress lane; do not install it through BRAT or merge it into stable without separate validation.

The supported build lives inside `Obsidian Plugin Test Vault/Plugin Development`, with `TPS-Linter (Dev)` as the mapped stable source. These repositories depend on adjacent shared tooling including `deploy-runtime.mjs`; a standalone clone is not currently self-contained.

From the contained workspace, prepare dependencies using the shared helper, then run tests and a separate final build:

```sh
# From Plugin Development:
node ./prepare-dependencies.mjs "TPS-Linter (Dev)"
cd "TPS-Linter (Dev)"
npm test
npm run build
```

Dependencies stay in the vault's `.plugin-dev-cache.nosync` through a relative `node_modules` symlink. Use a clean, current checkout; preserve unrelated changes and never build an old dirty worktree into the test runtime. Stable builds deploy only shipped artifacts to the test vault. Optimization builds are build-only. Runtime `data.json`, secrets, caches, and session state never belong in Git.

Documentation-only maintenance does not create a new plugin version. Published release tags and assets are preserved. Do not rely on legacy version/release scripts without reviewing their current behavior. Production updates remain the user's BRAT handoff.

For prior feature details and release-specific evidence, see [REFERENCE.md](REFERENCE.md) and [GitHub releases](https://github.com/ZachTish/tps-linter/releases). The September 16 cleanup changes documentation and repository metadata, not shipped behavior.
