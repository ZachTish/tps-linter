# TPS Linter

TPS Linter is a small, TPS-specific Obsidian cleaner for inspecting and deliberately cleaning one Markdown note at a time. Version `0.2.0` adds conservative spacing, heading, and frontmatter rules while keeping every mutation behind an explicit Clean action.

## Install with BRAT

Add the public repository `ZachTish/tps-linter` to BRAT and track `Latest`, or freeze the exact numeric release `0.2.0`. The release attaches BRAT's required `main.js`, `manifest.json`, and complete `styles.css` artifacts.

The released build is validated in the isolated Obsidian Plugin Test Vault. Publishing the release does not install it in the production vault; the production update remains a separate user-owned BRAT pull.

## Why this is separate from Obsidian Linter

[Obsidian Linter](https://github.com/platers/obsidian-linter) is a mature, configurable formatter with many YAML, heading, content, spacing, footnote, and paste rules. Its current implementation does not rename note files. TPS Linter is an original, intentionally smaller implementation for TPS naming and cleanup contracts; it does not copy or bundle the upstream rule engine.

TPS Linter takes inspiration from upstream's consecutive-blank-line, heading-capitalization, heading-increment, YAML-key-sort, and ignore-path concepts. Its implementation and tests are original and narrower: each transformation is defined against TPS ownership rules and protected constructs rather than copying or bundling the upstream rule engine.

## Commands and menus

- **Check current note** is read-only. It reports the filename and Markdown changes that the current rules would make.
- **Clean current note** re-evaluates the live file, atomically cleans eligible Markdown content, and applies an eligible filename change only when filename ownership and collision guards allow it.
- The same two actions are available in a Markdown file's context menu and at the top of the settings page.

There is no whole-vault mutation command or background lint trigger in `0.2.0`. “Automatic” cleanup means that enabled rules run together when the user explicitly chooses **Clean current note**.

## Filename rules and ownership

The manual filename plan:

- trims leading and trailing horizontal whitespace;
- collapses repeated horizontal whitespace to one ordinary space;
- handles control and cross-platform-unsafe filename characters with the configured replacement style;
- optionally removes Obsidian link-control characters `#`, `^`, `[`, and `]`;
- removes trailing spaces and periods; and
- preserves the folder, `.md` extension, case, Unicode, dates, numeric prefixes, semantic versions, ampersands, punctuation, and emoji.

The cleaner fails closed when a result is empty, `.` or `..`, a Windows reserved device name, a case-only rename, or a case-insensitive sibling collision. It never invents a numeric suffix. Eligible renames use Obsidian's `FileManager.renameFile` so Obsidian retains internal-link update ownership.

TPS Global Context Menu currently owns automatic TPS title and filename synchronization, including scheduled-date filename generation. When its automatic rename setting is active, TPS Linter can report a filename issue but will not mutate the filename. The settings page links directly to TPS Global Context Menu. TPS Linter does not create a second background rename owner.

## Markdown rules

The default Markdown cleanup:

- clears spaces and tabs from otherwise blank lines;
- collapses consecutive body blank lines to one;
- capitalizes the first cased character in plain ATX headings;
- shifts the first ATX heading to H1 and prevents later depth increases greater than one level;
- sorts safe top-level frontmatter fields using the shared TPS order;
- adds a missing final newline to a non-empty file; and
- leaves nonblank trailing whitespace alone unless the user explicitly enables that rule.

When nonblank trailing-whitespace cleanup is enabled, two literal terminal spaces are retained as a Markdown hard break. Existing UTF-8 BOMs are retained, and rewritten content keeps the note's LF, CRLF, or CR line-ending style. Body spacing and heading cleanup skip frontmatter, backtick and tilde code fences, indented code blocks, `$$` math blocks, Obsidian `%%` comments, HTML comments, multiline Templater regions, and raw `pre`, `textarea`, `script`, and `style` blocks. Unclosed protected constructs remain untouched.

Heading capitalization can be disabled, use the conservative first-letter default, or use title case while preserving already-cased terms such as `TPS`, `AI`, and `macOS`. Heading hierarchy can start at H1 or H2. The first ATX heading establishes the shift, repeated siblings remain peers, and a deeper heading may increase by at most one level from its current parent. Shallower returns remain allowed. Setext headings and headings containing TPS/Dataview inline fields, math, tags, URLs, email markers, wiki or Markdown links, inline code, HTML, Templater syntax, template braces, or block IDs keep their text byte-identical; their ATX level can still be normalized.

## Frontmatter ordering

Only top-level mapping fields are reordered. When TPS Global Context Menu is loaded, its current property list supplies the priority order. Matching is case-insensitive while original field spelling is preserved. Without GCM, TPS Linter uses `status`, `priority`, `tags`, `recurrence`, `scheduled`, and `folderPath`, then sorts all remaining fields alphabetically with case-insensitive comparison.

The sorter moves complete YAML source blocks rather than rebuilding values. Comments, nested maps and lists, block scalars, quoted values, quoted Templater expressions, and original line endings are preserved. The result is parsed again and compared semantically before it can be written. Invalid YAML, exact or case-insensitive duplicate keys, non-mapping roots, complex keys, directives, document markers, anchors, aliases, merge keys, explicit tags, or an unverifiable source layout fail closed. Other enabled body rules may still clean the note, and the Check/Clean result reports that frontmatter sorting was skipped.

Content mutation uses `Vault.process`, so the transformation runs against the current file revision instead of overwriting a concurrent edit with a stale read.

## Scope and exclusions

Hard guards always exclude Obsidian/internal paths, plugin source, the TPS AI queue, root agent instructions, internal sentinel notes, and non-Markdown files. User exclusions are newline-separated exact files or folder prefixes, with segment-safe `*` wildcards.

The initial editable exclusions are:

- `Templates`
- `Recurring Templates`
- `Fixtures`
- `Archive`
- `_archive`
- `_templates`
- `System/Templates`
- `README.md`

No startup scan occurs. Check and clean operate only on the explicitly selected current note.

## Settings design

Check and Clean actions remain first. The always-visible **Choose what to configure** hub has four one-click destinations:

1. **Clean notes** — blank lines, whitespace, and final newline;
2. **Headings** — capitalization, hierarchy normalization, and H1/H2 start;
3. **Frontmatter** — safe top-level sorting and the GCM property-order handoff; and
4. **Files & safety** — filename rules, filename ownership, exclusions, and diagnostics.

**Clean notes** is the default route. Only the active destination is rendered, with one conditional control for the first heading level. Route, focus, disclosure, and scroll state are transient and create no persisted fields. Route buttons use `aria-pressed`; focus is restored after user-invoked rerenders; keyboard focus is visible. On narrow screens the route hub is a horizontally scrollable strip, action cards stack, controls use full width, and labels wrap. Every CSS selector is namespaced under `tps-linter`.

Persisted data uses schema version `2` and contains only rule choices, exclusion patterns, and the diagnostics toggle. Unknown or invalid saved values normalize to safe defaults. Loading schema v1 preserves custom exclusions and appends `_templates` and `System/Templates`; subsequent schema v2 saves preserve intentional exclusion removals.

## Diagnostics and safety

Diagnostics are disabled by default. When enabled, TPS Linter logs only compact trigger, path, and result fields. It never logs note bodies or complete settings payloads. Warnings and errors report the affected path without exposing content.

The plugin has no network access, credentials, scheduled work, startup sweep, save hook, create hook, modify hook, rename hook, file-open hook, deletion, archive movement, or production deployment path.

## Known limitations

- Filename mutation is deliberately blocked while TPS Global Context Menu automatic rename is active.
- There is no batch clean, background clean, diff modal, Setext-heading rewrite, or custom regular-expression rule.
- Frontmatter sorting intentionally skips advanced YAML features that cannot be moved and verified with high confidence.
- Heading text changes can affect explicit heading-fragment links, so structural and capitalization rules remain part of the user-invoked Clean action rather than a save hook.
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

### 0.2.0 validation

Validation covers safe YAML CST sorting and semantic verification, GCM property-order compatibility, blank-line and heading rules, protected regions, exact line endings, idempotence, schema migration, destination navigation, accessibility/mobile contracts, commands, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, reloaded settings inspection, and explicit linting of synthetic messy Inbox notes. All 51 automated tests passed; exact reload evidence, artifact hashes, and QA note disposition are recorded in `release-notes/0.2.0.md`.

### 0.1.0 validation

Validation covers pure filename planning and collision/ownership guards, TPS filename preservation, exact line-ending and protected-block preservation, idempotence, settings normalization, command and settings contracts, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, and a reloaded test-vault UI inspection. Exact final test counts, reload evidence, and artifact hashes are recorded in `release-notes/0.1.0.md`.

## Version history

### 0.2.0

- Added explicit-clean consecutive blank-line removal with code, math, YAML, raw HTML, and Templater protection.
- Added conservative heading capitalization plus configurable H1/H2 hierarchy normalization.
- Added GCM-aligned, YAML-preserving top-level frontmatter sorting with fail-closed semantic verification.
- Added schema v2 template exclusions and a four-destination accessible, responsive settings surface.

### 0.1.0

- Introduced the manual check/clean workflow and thin Obsidian integration.
- Added ownership-safe filename planning with collision and TPS Global Context Menu guards.
- Added conservative, byte-preserving Markdown cleanup.
- Added a flat accessible settings surface, exclusions, diagnostics, focused tests, contained build/deploy support, and BRAT-compatible release metadata.
