# TPS Linter

TPS Linter is a lightweight, TPS-specific Obsidian linter for inspecting and deliberately cleaning one Markdown note at a time. Version `0.4.0` adds note-local controls, opt-in terminal-blank cleanup, an independent filename switch, broader Markdown protection, bounded work guards, and transaction hardening while keeping every mutation behind an explicit Clean action.

## Install with BRAT

Add the public repository `ZachTish/tps-linter` to BRAT and track `Latest`, or freeze the exact numeric release `0.4.0`. The release attaches BRAT's required `main.js`, `manifest.json`, and complete `styles.css` artifacts.

The released build is validated in the isolated Obsidian Plugin Test Vault. Publishing the release does not install it in the production vault; the production update remains a separate user-owned BRAT pull.

## Why this is separate from Obsidian Linter

[Obsidian Linter](https://github.com/platers/obsidian-linter) is a mature, configurable formatter with many YAML, heading, content, spacing, footnote, and paste rules. Its current implementation does not rename note files. TPS Linter is an original, intentionally smaller implementation for TPS naming and cleanup contracts; it does not copy or bundle the upstream rule engine.

TPS Linter takes inspiration from upstream's consecutive-blank-line, heading-capitalization, heading-increment, YAML-key-sort, ignore-path, and rule-disable concepts. Its implementation and tests are original and narrower: each transformation is defined against TPS ownership rules and protected constructs rather than copying or bundling the upstream rule engine. Rules have stable TPS IDs so a note can disable the whole linter, selected rules, or an exact body range without changing global settings.

## Commands and menus

- **Check current note** is read-only. It reports the filename and Markdown changes that the current rules would make.
- **Clean current note** re-evaluates the live file, atomically cleans eligible Markdown content, and applies an eligible filename change only when filename ownership and collision guards allow it.
- The same two actions are available in a Markdown file's context menu and at the top of the settings page.

There is no whole-vault mutation command or background lint trigger in `0.4.0`. “Automatic” cleanup means that enabled rules run together when the user explicitly chooses **Clean current note**.

## Filename rules and ownership

The manual filename plan:

- trims leading and trailing horizontal whitespace;
- collapses repeated Unicode separator whitespace to one ordinary space;
- handles Unicode control characters and cross-platform-unsafe filename characters with the configured replacement style;
- optionally removes Obsidian link-control characters `#`, `^`, `[`, and `]`;
- removes trailing spaces and periods; and
- preserves the folder, `.md` extension, case, Unicode, dates, numeric prefixes, semantic versions, ampersands, punctuation, and emoji.

The filename rule has an independent master switch. It fails closed when a result is empty, `.` or `..`, a Windows reserved device name (including superscript COM/LPT digits), a case-only rename, an unknown GCM ownership state, or a Unicode-normalized case-insensitive sibling collision. Collision checks stay in the selected file's parent folder and the rename itself remains guarded by Obsidian. Literal backslashes are cleaned as filename characters rather than interpreted as path separators. TPS Linter never invents a numeric suffix. Eligible renames use Obsidian's `FileManager.renameFile` so Obsidian retains internal-link update ownership.

TPS Global Context Menu currently owns automatic TPS title and filename synchronization, including scheduled-date filename generation. When its automatic rename setting is active, TPS Linter can report a filename issue but will not mutate the filename. The settings page links directly to TPS Global Context Menu. TPS Linter does not create a second background rename owner.

## Markdown rules

The default Markdown cleanup:

- clears spaces and tabs from otherwise blank lines;
- collapses consecutive body blank lines to one;
- capitalizes the first cased character in plain ATX headings;
- shifts the first ATX heading to H1 and prevents later depth increases greater than one level;
- sorts safe top-level frontmatter fields using the shared TPS order;
- adds a missing final newline to a non-empty file; and
- leaves nonblank trailing whitespace and terminal blank padding alone unless the user explicitly enables those rules.

When nonblank trailing-whitespace cleanup is enabled, two literal terminal spaces are retained as a Markdown hard break. Optional terminal-blank cleanup removes only unprotected space/tab blank lines and still retains exactly one final newline. Existing UTF-8 BOMs are retained, including before a first-line heading, and rewritten content keeps the note's LF, CRLF, or CR line-ending style.

Body spacing and heading cleanup skip frontmatter; backtick and tilde fences; indented code; `$$` math; Obsidian and HTML comments; multiline Templater; processing instructions, declarations, and CDATA; raw `pre`, `textarea`, `script`, and `style` blocks; and conservative paired HTML regions. Container-aware fence, math, and indented-code recognition supports interleaved list/blockquote prefixes with CommonMark columns, tab stops, and list-padding rules. Literal blank chunks inside container-relative indented code remain byte-identical. Inline code spans, Markdown links and images, wiki links, TPS inline fields, inline math, autolinks, and escaped markup are scanned without allowing tag-looking text to leak false HTML state.

Ambiguous constructs are never guessed. Multiline/unclosed HTML tags, multiline link labels or destinations, multiline reference titles, invalid links containing protected syntax, and reference-style labels whose tag-like meaning depends on a document-wide definition block the entire Markdown cleanup with a visible reason. Unclosed protected constructs remain byte-identical.

Heading capitalization can be disabled, use the conservative first-letter default, or use title case while preserving already-cased terms such as `TPS`, `AI`, and `macOS`. Heading hierarchy can start at H1 or H2. The first ATX heading establishes the shift, repeated siblings remain peers, and a deeper heading may increase by at most one level from its current parent. Shallower returns remain allowed. Setext headings and headings containing TPS/Dataview inline fields, math, tags, URLs, email markers, wiki or Markdown links, inline code, HTML, Templater syntax, template braces, or block IDs keep their text byte-identical; their ATX level can still be normalized.

**Push heading hierarchy down to H6** is an optional, default-off alternative to the H1/H2 start. It derives structural depth from the complete visible ATX outline, treats any deeper source heading as one nested step even when the original hashes skip levels, and shifts the outline so its deepest nesting level is H6. A standalone `## Test` becomes `###### Test`; a parent and child become H5/H6. Siblings remain peers, parent/child steps remain exactly one level, protected block headings do not affect the calculation, and visible headings with inline protected syntax still participate.

The H6 shift is global across the visible outline. In an uneven tree, a shallow leaf can remain above H6 when another branch is deeper; this preserves sibling and parent relationships and makes repeated cleaning idempotent. While the option is enabled, **First heading level** is hidden but its saved H1/H2 value is retained. The option is dormant when heading normalization is off.

## Note-local controls

Top-level frontmatter can disable every rule for one note:

```yaml
---
tps-linter: false
---
```

Or it can disable selected stable rule IDs:

```yaml
---
tps-linter-disabled-rules:
  - filename
  - heading-levels
  - frontmatter-sort
---
```

The stable IDs are `filename`, `whitespace-only-lines`, `blank-lines`, `trailing-whitespace`, `trailing-blank-lines`, `final-newline`, `heading-capitalization`, `heading-levels`, `frontmatter-sort`, and `all`. Values can be one scalar ID or a sequence. Keys must be exact, top-level keys. Structurally valid root block maps—including uniformly indented maps—flow maps, explicit scalar keys, quoted keys, and escaped quoted keys are recognized. Nested lookalikes remain ordinary note data. Unknown or duplicate IDs, duplicate/case-colliding keys, malformed control-like YAML, aliases, anchors, tags, merge keys, and unsupported YAML fail closed.

Exact body ranges can be protected with standalone markers:

```md
<!-- tps-linter-disable -->
content that must remain byte-identical
<!-- tps-linter-enable -->
```

The equivalent `%% tps-linter-disable %%` and `%% tps-linter-enable %%` forms are also supported. Markers inside an already protected construct do not change lint state. An unclosed disabled range protects the remainder of the note.

## Frontmatter ordering

Only top-level mapping fields are reordered. When TPS Global Context Menu is loaded, its current property list supplies the priority order. Matching is case-insensitive while original field spelling is preserved. Without GCM, TPS Linter uses `status`, `priority`, `tags`, `recurrence`, `scheduled`, and `folderPath`, then sorts all remaining fields alphabetically with case-insensitive comparison.

The sorter moves complete YAML source blocks rather than rebuilding values. Comments, nested maps and lists, block scalars, quoted values, quoted Templater expressions, and original line endings are preserved. The result is parsed again and compared semantically before it can be written. Invalid YAML, exact or case-insensitive duplicate keys, non-mapping roots, complex keys, directives, document markers, anchors, aliases, merge keys, explicit tags, an unverifiable source layout, more than 1,000 top-level fields, or more than 2,000 physical frontmatter lines fail closed. Other enabled body rules may still clean the note, and the Check/Clean result reports that frontmatter sorting was skipped.

Content mutation uses `Vault.process`, so the transformation runs against the current file revision instead of overwriting a concurrent edit with a stale read. Every changed result must preserve note-local controls and become byte-identical on an immediate second cleanup pass; otherwise the entire content change is rejected.

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
2. **Headings** — capitalization, hierarchy normalization, H1/H2 start, and optional bottom alignment to H6;
3. **Frontmatter** — safe top-level sorting and the GCM property-order handoff; and
4. **Files & safety** — filename rules, ownership, exclusions, note-local control reference, and diagnostics.

**Clean notes** is the default route. Only the active destination is rendered, with one conditional control for the first heading level. Route, focus, disclosure, and scroll state are transient and create no persisted fields. Route buttons use `aria-pressed`; focus is restored after user-invoked rerenders; keyboard focus is visible. On narrow screens the route hub is a horizontally scrollable strip, action cards stack, controls use full width, and labels wrap. Every CSS selector is namespaced under `tps-linter`.

Persisted data uses schema version `4` and contains only rule choices, exclusion patterns, and the diagnostics toggle. Unknown or invalid saved values normalize to safe defaults. Loading schema v1 preserves custom exclusions and appends `_templates` and `System/Templates`; schema v2 and v3 preserve intentional exclusion removals. Existing installations retain their H6 choice, receive filename cleaning enabled, and receive terminal-blank removal disabled.

## Diagnostics and safety

Diagnostics are disabled by default. When enabled, TPS Linter logs only compact trigger, path, and result fields. It never logs note bodies or complete settings payloads. Warnings and errors report the affected path without exposing content.

The plugin has no network access, credentials, scheduled work, startup sweep, save hook, create hook, modify hook, rename hook, file-open hook, deletion, archive movement, or production deployment path.

Every Clean takes a fresh read, snapshots rule options, and enters one unconditional `Vault.process` callback. Same-file cleans are serialized. Path exclusions are rechecked without relaxing the initial scope inside the callback, before filename planning, and after the final fresh read. Note-local controls and filename ownership are re-read before rename eligibility. Markdown success is reported even if a later rename fails.

Bounded-work guards reject notes over 2,000,000 characters or 50,000 physical lines, individual lines over 32,000 characters, container nesting over 64 steps, more than 2,048 protected tokens on one line, more than 4,096 protected tokens across a note, frontmatter over 500,000 characters or 2,000 lines, and sortable frontmatter over 1,000 fields. These are deliberate UI-safety limits; blocked notes are unchanged and receive a reason.

## Known limitations

- Filename mutation is deliberately blocked while TPS Global Context Menu automatic rename is active.
- There is no batch clean, background clean, diff modal, Setext-heading rewrite, or custom regular-expression rule.
- Frontmatter sorting intentionally skips advanced YAML features that cannot be moved and verified with high confidence.
- Multiline HTML tags and multiline Markdown link/reference forms are deliberately blocked when the lightweight scanner cannot prove their boundaries. Tag-like shortcut reference labels also require manual review because the scanner does not resolve document-wide reference definitions.
- Heading text changes can affect explicit heading-fragment links, so structural and capitalization rules remain part of the user-invoked Clean action rather than a save hook.
- Bottom alignment operates on the complete visible ATX outline; a shallow leaf in an uneven tree may remain above H6 to preserve structural relationships.
- ATX headings prefixed by list or blockquote containers are currently preserved rather than normalized.
- Protected-block detection is conservative. A malformed or unclosed protected construct remains untouched rather than being guessed at.
- **Check current note** is advisory and may briefly reflect Obsidian's cached read; **Clean current note** always re-reads and processes the live file. A rare target collision with a same-named folder is caught by Obsidian's guarded rename and reported as a partial result rather than being included in the sibling-file preflight.
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

### 0.4.0 validation

Validation covers note-local full/rule/range controls, terminal-blank and filename switches, filename Unicode/control/device/collision cases, atomic clean and partial-rename reporting, GCM fail-closed ownership, YAML semantic preservation and work caps, BOM and mixed line endings, H1/H2 and H6 heading modes, every protected construct family, CommonMark-column container interleaving and container-relative indented code, adversarial Markdown ambiguity, bounded pathological inputs, deterministic/idempotent cleanup, generated property cases, TypeScript, 110 unit/property tests, 11 structural contracts, a separate final production-mode build, all four reloaded settings destinations, and explicit linting of synthetic messy Inbox notes. Independent CommonMark-oracle sweeps covered 31,693 fence/closer cases, 31,399 indented-code lines, and 13 multiline indented-code boundaries. Exact artifact hashes, reload evidence, and QA-note disposition are recorded in `release-notes/0.4.0.md`.

### 0.3.0 validation

Validation covers the default-off H6 option, a standalone H2-to-H6 transformation, skipped source levels, repeated siblings, uneven branches, multiple roots, protected blocks, inline protected headings, preserved CRLF and closing markers, dormant behavior when normalization is off, schema v2-to-v3 migration, conditional settings visibility, idempotence, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, reloaded settings inspection, and explicit linting of synthetic messy Inbox notes. Exact final counts, artifact hashes, reload evidence, and QA note disposition are recorded in `release-notes/0.3.0.md`.

### 0.2.0 validation

Validation covers safe YAML CST sorting and semantic verification, GCM property-order compatibility, blank-line and heading rules, protected regions, exact line endings, idempotence, schema migration, destination navigation, accessibility/mobile contracts, commands, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, reloaded settings inspection, and explicit linting of synthetic messy Inbox notes. All 51 automated tests passed; exact reload evidence, artifact hashes, and QA note disposition are recorded in `release-notes/0.2.0.md`.

### 0.1.0 validation

Validation covers pure filename planning and collision/ownership guards, TPS filename preservation, exact line-ending and protected-block preservation, idempotence, settings normalization, command and settings contracts, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, and a reloaded test-vault UI inspection. Exact final test counts, reload evidence, and artifact hashes are recorded in `release-notes/0.1.0.md`.

## Version history

### 0.4.0

- Added exact note-local all/rule/range controls with stable rule IDs, structural root-key discovery, and fail-closed YAML parsing.
- Added independent filename cleaning and default-off terminal-blank cleanup controls.
- Hardened explicit cleaning with fresh atomic processing, same-file serialization, non-relaxing exclusions, current control/ownership checks, partial-success reporting, and a post-clean idempotence verifier.
- Expanded byte-preserving Markdown protection across comments, fenced and container-relative indented code, math, HTML, Templater, links, references, inline fields, and interleaved list/blockquote containers.
- Added note, line, protected-token, container-depth, frontmatter-line, frontmatter-field, and frontmatter-character work limits.
- Expanded deterministic and property-based coverage for Markdown, frontmatter, filenames, controls, compatibility, settings, and runtime contracts.

### 0.3.0

- Added the default-off **Push heading hierarchy down to H6** option.
- Bottom-aligns the complete visible ATX outline while preserving parent, sibling, and one-level nesting relationships.
- Keeps protected block headings out of the outline calculation and preserves inline-protected visible headings as structural participants.
- Migrated settings to schema v3 without restoring intentionally removed v2 exclusions.

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
