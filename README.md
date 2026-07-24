# TPS Linter

TPS Linter is a small, TPS-specific Obsidian cleaner for inspecting and deliberately cleaning one Markdown note at a time. Version `0.1.0` establishes the rule, exclusion, preview, and safe-write foundations without adding background automation or a broad Markdown rewrite engine.

## Install with BRAT

Add the public repository `ZachTish/tps-linter` to BRAT and track `Latest`, or freeze the exact numeric release `0.1.0`. The release attaches BRAT's required `main.js`, `manifest.json`, and complete `styles.css` artifacts.

The released build is validated in the isolated Obsidian Plugin Test Vault. Publishing the release does not install it in the production vault; the production update remains a separate user-owned BRAT pull.

## Why this is separate from Obsidian Linter

[Obsidian Linter](https://github.com/platers/obsidian-linter) is a mature, configurable formatter with many YAML, heading, content, spacing, footnote, and paste rules. Its current implementation does not rename note files. TPS Linter is an original, intentionally smaller implementation for TPS naming and cleanup contracts; it does not copy or bundle the upstream rule engine.

The first release borrows the useful product idea of explicit rules plus ignored paths, while keeping transformations narrow enough to prove against TPS fixtures. Broader YAML, task, title, and Markdown formatting is deferred until each TPS contract can be specified and tested.

## Commands and menus

- **Check current note** is read-only. It reports the filename and Markdown changes that the current rules would make.
- **Clean current note** re-evaluates the live file, atomically cleans eligible Markdown content, and applies an eligible filename change only when filename ownership and collision guards allow it.
- The same two actions are available in a Markdown file's context menu and at the top of the settings page.

There is no whole-vault mutation command in `0.1.0`.

## Filename rules and ownership

The manual filename plan:

- trims leading and trailing horizontal whitespace;
- collapses repeated horizontal whitespace to one ordinary space;
- handles control and cross-platform-unsafe filename characters with the configured replacement style;
- optionally removes Obsidian link-control characters `#`, `^`, `[`, and `]`;
- removes trailing spaces and periods; and
- preserves the folder, `.md` extension, case, Unicode, dates, numeric prefixes, semantic versions, ampersands, punctuation, and emoji.

The cleaner fails closed when a result is empty, `.` or `..`, a Windows reserved device name, a case-only rename, or a case-insensitive sibling collision. It never invents a numeric suffix. Eligible renames use Obsidian's `FileManager.renameFile` so Obsidian retains internal-link update ownership.

TPS Global Context Menu currently owns automatic TPS title and filename synchronization, including scheduled-date filename generation. When its automatic rename setting is active, TPS Linter can report a filename issue but will not mutate the filename. The settings page links directly to TPS Global Context Menu. A later cross-plugin release can transfer or delegate that ownership explicitly; `0.1.0` does not create a second background rename owner.

## Markdown rules

The default Markdown cleanup:

- clears spaces and tabs from otherwise blank lines;
- adds a missing final newline to a non-empty file; and
- leaves nonblank trailing whitespace alone unless the user explicitly enables that rule.

When nonblank trailing-whitespace cleanup is enabled, two literal terminal spaces are retained as a Markdown hard break. Existing UTF-8 BOMs and every existing LF, CRLF, or CR separator remain byte-for-byte intact. Cleanup skips YAML frontmatter, backtick and tilde code fences (including unclosed fences), multiline Templater regions, and raw `pre`, `textarea`, `script`, and `style` blocks. It does not sort or rewrite frontmatter, tasks, inline fields, headings, lists, tables, links, or paragraphs.

Content mutation uses `Vault.process`, so the transformation runs against the current file revision instead of overwriting a concurrent edit with a stale read.

## Scope and exclusions

Hard guards always exclude Obsidian/internal paths, plugin source, the TPS AI queue, root agent instructions, internal sentinel notes, and non-Markdown files. User exclusions are newline-separated exact files or folder prefixes, with segment-safe `*` wildcards.

The initial editable exclusions are:

- `Templates`
- `Recurring Templates`
- `Fixtures`
- `Archive`
- `_archive`
- `README.md`

No startup scan occurs. Check and clean operate only on the explicitly selected current note.

## Settings design

The settings surface is one flat page because this release has one small, coherent job. Check and clean actions come first, followed by:

1. the TPS Global Context Menu filename-ownership handoff;
2. filename rules;
3. Markdown rules;
4. exclusions; and
5. off-by-default diagnostics.

There are no disclosures or persisted navigation fields. The default view is the full page. Controls stack on narrow screens, action buttons wrap, labels remain readable, and keyboard focus uses visible `:focus-visible` styling. All CSS selectors are namespaced under `tps-linter`.

Persisted data uses schema version `1` and contains only rule choices, exclusion patterns, and the diagnostics toggle. Unknown or invalid saved values normalize to safe defaults. No settings migration is needed for `0.1.0`.

## Diagnostics and safety

Diagnostics are disabled by default. When enabled, TPS Linter logs only compact trigger, path, and result fields. It never logs note bodies or complete settings payloads. Warnings and errors report the affected path without exposing content.

The plugin has no network access, credentials, scheduled work, startup sweep, save hook, create hook, modify hook, rename hook, file-open hook, deletion, archive movement, or production deployment path.

## Known limitations

- Filename mutation is deliberately blocked while TPS Global Context Menu automatic rename is active.
- There is no batch clean, automatic clean, diff modal, frontmatter formatter, or custom regular-expression rule in this release.
- Protected-block detection is conservative. A malformed or unclosed protected construct remains untouched rather than being guessed at.
- Mobile layout is covered by responsive contract tests and desktop-width inspection; final native iOS interaction remains a separate device check.

## Development and validation

Canonical source is `Obsidian Plugin Test Vault/Plugin Development/TPS-Linter (Dev)`. Rebuildable dependencies live in the vault's `.plugin-dev-cache.nosync/tps-linter` cache and are linked with:

```sh
node ../prepare-dependencies.mjs "TPS-Linter (Dev)"
```

From the source repository:

```sh
npm run test:unit
npm run test:settings
npm test
npm run build
```

Stable production-mode builds deploy byte-changed `main.js`, `manifest.json`, and `styles.css` only to the isolated test runtime `.obsidian/plugins/tps-linter`. They do not overwrite runtime-owned `data.json`. Direct production deployment is not part of this workflow.

### 0.1.0 validation

Validation covers pure filename planning and collision/ownership guards, TPS filename preservation, exact line-ending and protected-block preservation, idempotence, settings normalization, command and settings contracts, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, and a reloaded test-vault UI inspection. Exact final test counts, reload evidence, and artifact hashes are recorded in `release-notes/0.1.0.md`.

## Version history

### 0.1.0

- Introduced the manual check/clean workflow and thin Obsidian integration.
- Added ownership-safe filename planning with collision and TPS Global Context Menu guards.
- Added conservative, byte-preserving Markdown cleanup.
- Added a flat accessible settings surface, exclusions, diagnostics, focused tests, contained build/deploy support, and BRAT-compatible release metadata.
