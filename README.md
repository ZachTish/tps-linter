# TPS Linter

TPS Linter is a lightweight, TPS-specific Obsidian linter for inspecting and safely cleaning one Markdown note at a time. Version `0.7.1` prevents heading capitalization from changing case-sensitive tags, links, forward-slash paths, URLs, URIs, inline code, and related inline syntax. Every released command, setting, rule, fail-closed guard, protected-Markdown contract, save-feedback behavior, and ownership-safe filename behavior remains available.

## Install with BRAT

Add the public repository `ZachTish/tps-linter` to BRAT and track `Latest`, or freeze the exact numeric release `0.7.1`. The release attaches BRAT's required `main.js`, `manifest.json`, and complete `styles.css` artifacts.

The released build is validated in the isolated Obsidian Plugin Test Vault. Publishing the release does not install it in the production vault; the production update remains a separate user-owned BRAT pull.

## Why this is separate from Obsidian Linter

[Obsidian Linter](https://github.com/platers/obsidian-linter) is a mature, configurable formatter with many YAML, heading, content, spacing, footnote, and paste rules. Its current implementation does not rename note files. TPS Linter is an original, intentionally smaller implementation for TPS naming and cleanup contracts; it does not copy or bundle the upstream rule engine.

TPS Linter takes inspiration from upstream's consecutive-blank-line, list-marker spacing, heading-capitalization, heading-increment, YAML-key-sort, ignore-path, and rule-disable concepts. Its implementation and tests are original and narrower: each transformation is defined against TPS ownership rules and protected constructs rather than copying or bundling the upstream rule engine. Rules have stable TPS IDs so a note can disable the whole linter, selected rules, or an exact body range without changing global settings.

## Commands and menus

- **Check current note** is read-only. It reports the filename and Markdown changes that the current rules would make. If an applicable body-spacing or list-gap rule is off, the no-op summary names the exact setting to enable on this device.
- **Clean current note** re-evaluates the live file, atomically cleans eligible Markdown content, and applies an eligible filename change only when filename ownership and collision guards allow it. A no-op Clean provides the same exact opt-in guidance from the final processed bytes.
- The same two actions are available in a Markdown file's context menu and at the top of the settings page.
- **Lint notes on save** is enabled by default. After Obsidian reports that the active Markdown editor was persisted, or after the standard platform save gesture (Cmd-S on Apple devices and Ctrl-S elsewhere) inside that editor, TPS Linter waits 500 ms, coalesces repeated events, rechecks the live note and editor buffer, and applies enabled content rules when the editor is still active, saved, and eligible.

Save linting is content-only: it never plans or applies a filename change and never turns an external or sync burst into a whole-vault cleanup. Enabling the save workflow does not enable individual cleanup rules; default-off rules such as plain-note body spacing, after-frontmatter body spacing, and list-item compaction must also be enabled on each device. A native top-right Obsidian notice briefly lists successfully applied changes. It names at most three cleanup actions, then gives the exact number of remaining fixes, and has a 180-character ceiling. An explicit conventional Cmd-S/Ctrl-S inside the active editor reports no changes under the rules enabled on that device, note-local disablement, or a safety block when it produces no mutation. When the note has a missing frontmatter body line, missing plain-note body line, or compactable list gap whose relevant opt-in rule is off, that explicit notice names the disabled cleanup instead of implying that save lint failed. Routine persisted-modification no-ops and the plugin's own convergence pass remain silent, so one automatic clean never produces a second “already clean” message. Excluded, inactive, preview-only, and unsaved-buffer targets are still skipped without a misleading success notice. There is no startup scan, batch mutation command, paste hook, or inactive-note sweep.

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

**Remove blank lines between list items** is a separate default-off rule. It removes every ASCII space/tab blank-only line between compatible unordered, ordered, or checklist markers, producing a compact Markdown list. Unordered items must keep the same `-`, `+`, or `*` marker; ordered items must keep the same `.` or `)` delimiter; checklists compact with other checklists regardless of status. Both items must have the same provable indentation and blockquote path. The rule preserves plain-to-checklist transitions, mixed marker families, empty or thematic-break-like markers, continuation paragraphs, bare blank lines between quoted blocks, four-space or tab-indented ambiguity, frontmatter, code, math, comments, raw HTML, Templater, disabled ranges, and any line the protected-syntax scanner cannot safely classify. It preserves LF, CRLF, CR, and a byte-zero BOM, reports its own removal count, and remains idempotent when combined with the general blank-line rules.

Removing the final separator changes an eligible CommonMark list from loose to tight, so this rule is never enabled automatically during installation or migration. Enable it under **TPS Linter → Clean notes** on each device whose settings should compact lists.

**Add blank line before plain-note content** is a separate default-off rule for notes without frontmatter. It inserts one empty physical first line before nonblank content, reuses the first existing LF, CRLF, or CR ending, and falls back to LF only for a one-line unterminated note. It leaves an existing empty or whitespace-only first line alone and never manufactures content in an empty, BOM-only, or blank-only note. A UTF-8 BOM remains byte zero and the separator follows it. Any exact first-line `---` opener is never displaced—even when its YAML is malformed, unsafe, or unclosed—because Obsidian requires frontmatter to remain on line one.

**Add blank body line after frontmatter** is the independent default-off choice for frontmatter notes and now sits beside the other body-spacing rules under **Clean notes**. For a safe, closed, top-of-note YAML mapping, it inserts the empty physical line immediately below the closing `---` or `...`, keeps one separator before existing body content, and creates one terminated, editable body slot when the note otherwise ends at frontmatter. It reuses LF, CRLF, or CR, leaves an existing empty or whitespace-only slot alone, preserves a leading BOM, and fails closed for malformed, duplicate-key, non-mapping, tagged, anchored, aliased, or otherwise unsafe YAML. When **Remove trailing blank lines** is also enabled, excess terminal padding is removed but the one body slot requested by this rule is retained. With both insertion options enabled, a plain note receives only plain-note spacing and a frontmatter note receives only after-frontmatter spacing.

When nonblank trailing-whitespace cleanup is enabled, two literal terminal spaces are retained as a Markdown hard break. Optional terminal-blank cleanup removes only unprotected space/tab blank lines and still retains exactly one final newline. Existing UTF-8 BOMs are retained, including before a first-line heading, and rewritten content keeps the note's LF, CRLF, or CR line-ending style.

Body spacing and heading cleanup skip frontmatter; backtick and tilde fences; indented code; `$$` math; Obsidian and HTML comments; multiline Templater; processing instructions, declarations, and CDATA; raw `pre`, `textarea`, `script`, and `style` blocks; and conservative paired HTML regions. Container-aware fence, math, and indented-code recognition supports interleaved list/blockquote prefixes with CommonMark columns, tab stops, and list-padding rules. Literal blank chunks inside container-relative indented code remain byte-identical. Inline code spans, Markdown links and images, wiki links, TPS inline fields, inline math, autolinks, and escaped markup are scanned without allowing tag-looking text to leak false HTML state.

Ambiguous constructs are never guessed. Multiline/unclosed HTML tags, multiline link labels or destinations, multiline reference titles, invalid links containing protected syntax, and reference-style labels whose tag-like meaning depends on a document-wide definition block the entire Markdown cleanup with a visible reason. Unclosed protected constructs remain byte-identical.

Heading capitalization can be disabled, use the conservative first-letter default, or use title case while preserving already-cased terms such as `TPS`, `AI`, and `macOS`. Heading hierarchy can start at H1 or H2. The first ATX heading establishes the shift, repeated siblings remain peers, and a deeper heading may increase by at most one level from its current parent. Shallower returns remain allowed. Setext headings and headings containing TPS/Dataview inline fields, math, any hashtag, URLs, URIs, email markers, wiki or Markdown links, inline code, HTML, entities, escaped Markdown, forward-slash paths, dot-joined domain or file tokens, Templater syntax, template braces, or block IDs keep their complete text byte-identical; their ATX level can still be normalized. This intentionally favors safe false positives over changing case-sensitive inline content.

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

The stable IDs are `filename`, `whitespace-only-lines`, `blank-lines`, `list-item-blank-lines`, `trailing-whitespace`, `trailing-blank-lines`, `final-newline`, `leading-blank-line`, `heading-capitalization`, `heading-levels`, `frontmatter-blank-line`, `frontmatter-sort`, and `all`. Values can be one scalar ID or a sequence. Keys must be exact, top-level keys. Structurally valid root block maps—including uniformly indented maps—flow maps, explicit scalar keys, quoted keys, and escaped quoted keys are recognized. Nested lookalikes remain ordinary note data. Unknown or duplicate IDs, duplicate/case-colliding keys, malformed control-like YAML, aliases, anchors, tags, merge keys, and unsupported YAML fail closed. After the unchanged character and line safety limits, frontmatter with neither a literal control-key candidate nor a backslash returns without loading the YAML parser. A backslash always retains full parsing so escaped control keys remain discoverable; candidate controls still follow every existing structural and fail-closed validation rule.

`leading-blank-line` is a stable API identifier for consistency, but an applicable note has no frontmatter in which to store a note-local override. Configure that rule globally or use a path exclusion. Notes that do have frontmatter can use `frontmatter-blank-line` for the independent after-frontmatter rule.

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

Content mutation uses `Vault.process`, so the transformation runs against the current file revision instead of overwriting a concurrent edit with a stale read. Every changed result must preserve note-local controls and become byte-identical on an immediate second cleanup pass; otherwise the entire content change is rejected. Save linting performs a fresh preflight first and does not enter `Vault.process` for an already-clean or safety-blocked note.

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

No startup scan occurs. Check and manual Clean operate only on the explicitly selected current note. Save linting queues only a modified Markdown file or the current file from the standard platform save gesture when that gesture originates inside the active source-mode Markdown editor and the same file still matches again before mutation; Settings, modals, sidebars, other views, inactive notes, preview-only notes, deleted, replaced, renamed-away, excluded, non-Markdown, and newer-unsaved-buffer targets are skipped.

## Settings design

Check and Clean actions remain first. The always-visible **Choose what to configure** hub has four one-click destinations:

1. **Clean notes** — lint-on-save workflow, body-start spacing, general and list-item blank lines, whitespace, and final newline;
2. **Headings** — capitalization, hierarchy normalization, H1/H2 start, and optional bottom alignment to H6;
3. **Frontmatter** — safe top-level sorting and the GCM property-order handoff; and
4. **Files & safety** — filename rules, ownership, exclusions, note-local control reference, and diagnostics.

**Clean notes** is the default route. Only the active destination is rendered, with one conditional control for the first heading level. Route, focus, disclosure, and scroll state are transient and create no persisted fields. Route buttons use `aria-pressed`; focus is restored after user-invoked rerenders; keyboard focus is visible. On narrow screens the route hub is a horizontally scrollable strip, action cards stack, controls use full width, and labels wrap. Every CSS selector is namespaced under `tps-linter`.

Persisted data uses schema version `7` and contains only workflow/rule choices, exclusion patterns, and the diagnostics toggle. Unknown or invalid saved values normalize to safe defaults. Loading schema v1 preserves custom exclusions and appends `_templates` and `System/Templates`; later schemas preserve intentional exclusion removals and existing rule choices. Schema-v6 and older installations retain every existing choice and receive `removeBlankLinesBetweenListItems: false`, so list compaction is opt-in.

## Diagnostics and safety

Diagnostics are disabled by default. When enabled, TPS Linter logs only compact trigger, path, and result fields. It never logs note bodies or complete settings payloads. Warnings and errors report the affected path without exposing content.

The plugin has no network access, credentials, scheduled sweep, startup scan, create hook, rename hook, file-open hook, deletion, archive movement, or production deployment path. It registers one supported Vault `modify` hook for persisted edits and one passive window-capture observer per open Obsidian workspace document for the standard save chord. Window capture lets TPS Linter observe the gesture before Obsidian consumes its own document-level handler; the observer is mechanically non-canceling and never alters that handler. Main-window, existing-popout, restored-popout, and newly opened popout documents are covered; closed-popout observers are detached. TPS Linter does not replace or patch Obsidian's save command and only schedules the same guarded worker when the chord target is inside the active source-mode Markdown view.

Every manual Clean takes a fresh read, snapshots rule options, and enters one unconditional `Vault.process` callback. Manual Check/Clean inspection performs one initial safety scan and note-control parse for that exact revision and shares the result with Markdown cleanup. Only when an explicit Check/Clean or standard Save is otherwise a no-op, one additional combined read-only cleanup probe identifies applicable body-spacing or list-gap settings that are off; passive modify and convergence paths never pay that cost. When the process callback receives exactly the same bytes, it reuses the already verified preflight result; any byte difference, including BOM or line-ending representation, runs the original cleanup against the current revision. Post-clean note-control comparison and second-pass idempotence verification remain independent. Manual inspection and cleaning require the selected Markdown `TFile` to remain the exact object currently indexed by the vault before and after inspection reads, inside the process callback, after processing, and after the final filename read. A deleted and recreated same-path note never inherits content or filename work; the plugin does not retry, reacquire by path, or use adapter-level mutation. Same-file manual and automatic cleans are serialized. The save scheduler debounces independently per note; an event during a run requests one delayed rerun, worker failures cannot wedge its state, disabling the setting cancels pending timers, and plugin unload invalidates in-flight work before preventing reruns. The automatic worker rechecks enablement, plugin lifecycle, active editor/file identity, source mode, Markdown type, initial-plus-live exclusions, current rule settings, and that the editor buffer still matches the persisted revision at the asynchronous mutation boundaries. Representation-only BOM and LF/CRLF/CR differences are tolerated; exact editor/file matches avoid normalization allocations. Real unsaved edits cause a no-write skip until the next persisted modification. Its own modify event converges through a no-write preflight rather than relying on timing-sensitive suppression; when both the persisted bytes and complete rule options remain identical at `Vault.process`, that verified pure cleanup result is reused instead of cleaning the same revision twice. Manual path exclusions are rechecked without relaxing the initial scope inside the callback, before filename planning, and after the final fresh read. Note-local controls and filename ownership are re-read from the final live content before manual rename eligibility. Markdown success is reported even if a later rename fails.

Bounded-work guards reject notes over 2,000,000 characters or 50,000 physical lines, individual lines over 32,000 characters, container nesting over 64 steps, more than 2,048 protected tokens on one line, more than 4,096 protected tokens across a note, frontmatter over 500,000 characters or 2,000 lines, and sortable frontmatter over 1,000 fields. The complete proposed output is checked again before it can be returned, so adding a blank or final newline cannot push a boundary-sized note beyond those limits. These are deliberate UI-safety limits; blocked notes are unchanged and receive a reason.

## Known limitations

- Filename mutation is deliberately blocked while TPS Global Context Menu automatic rename is active.
- There is no batch clean, inactive-note background sweep, diff modal, Setext-heading rewrite, or custom regular-expression rule.
- List-item gap cleanup is deliberately limited to compatible markers with the same provable indentation and blockquote path. Four-space and tab-indented marker-like lines, mixed marker families, plain/checklist transitions, continuation content, and protected syntax remain unchanged rather than being guessed at.
- Frontmatter sorting intentionally skips advanced YAML features that cannot be moved and verified with high confidence.
- Multiline HTML tags and multiline Markdown link/reference forms are deliberately blocked when the lightweight scanner cannot prove their boundaries. Tag-like shortcut reference labels also require manual review because the scanner does not resolve document-wide reference definitions.
- Heading text changes can affect explicit heading-fragment links. Heading-level normalization separately changes outline and section structure. Because lint on save is enabled by default, disable the relevant heading rule, disable `lintOnSave`, or use note-local rule controls where text or structure must remain fixed.
- Bottom alignment operates on the complete visible ATX outline; a shallow leaf in an uneven tree may remain above H6 to preserve structural relationships.
- ATX headings prefixed by list or blockquote containers are currently preserved rather than normalized.
- Protected-block detection is conservative. A malformed or unclosed protected construct remains untouched rather than being guessed at.
- **Check current note** reads fresh persisted vault bytes but remains a read-only snapshot; it intentionally does not inspect newer, unsaved editor text. **Clean current note** re-reads and processes the live file atomically. A rare target collision with a same-named folder is caught by Obsidian's guarded rename and reported as a partial result rather than being included in the sibling-file preflight.
- Mobile layout is covered by responsive contract tests and desktop-width inspection; final native iOS interaction remains a separate device check.
- The conventional Cmd-S/Ctrl-S gesture can lint an unchanged open note because the key gesture is observable. A user-remapped Save command, menu-based no-op Save, or other no-op invocation that emits neither that gesture nor a Vault modification does not create a public Obsidian save event and therefore cannot be detected.

## Development and validation

Canonical source is `Obsidian Plugin Test Vault/Plugin Development/TPS-Linter (Dev)`. Rebuildable dependencies live in the vault's `.plugin-dev-cache.nosync/tps-linter` cache and are linked with:

```sh
node ../prepare-dependencies.mjs "TPS-Linter (Dev)"
```

From the source repository:

```sh
npm run test:unit
npm run test:settings
TPS_LINTER_BASELINE_SOURCE_ROOT=../.tps-linter-0.5.5-baseline npm run test:differential
npm test
npm run build
```

Stable production-mode builds deploy byte-changed `main.js`, `manifest.json`, and `styles.css` only to the isolated test runtime `.obsidian/plugins/tps-linter`. They do not overwrite runtime-owned `data.json`. Direct production deployment is not part of this workflow.

### 0.7.1 validation

Validation covers ordinary, punctuation-adjacent, nested, escaped, Unicode, and emoji-leading hashtags; wikilinks, aliases, embeds, Markdown inline/reference links and images; HTTP, Obsidian, URN, data, protocol-relative, bare-domain, internationalized-domain, IPv4, localhost, relative, and root path forms; URL and email autolinks; inline code; HTML character references; escaped Markdown; first-letter and title-case modes; independent heading-level normalization; BOM, CRLF, closing hashes, exact counters, idempotence, and maximum-line bounded-work near misses. Exact final counts, hashes, reload evidence, save notices, settings preservation, and QA-note disposition are recorded in `release-notes/0.7.1.md`.

### 0.7.0 validation

Validation covers compatible bullet, ordered, and checklist boundaries; one and multiple blank separators; ASCII whitespace-only gaps; LF, CRLF, CR, and BOM preservation; provable indented same-level lists and explicit blockquote blanks; mixed marker, indentation, task/plain, continuation, empty-marker, thematic-break, and ambiguous-code preservation; every protected-region family; note-local rule disablement; composition with general blank cleanup; exact counters and save notices; read-only relevant-rule suggestions; the relocated body-spacing controls; schema-v7 migration; idempotence; randomized safety properties; TypeScript; the complete declared suite; a separate production build; isolated runtime deployment; and reloaded test-vault QA. Exact final counts, hashes, notices, reload evidence, settings restoration, and QA-note disposition are recorded in `release-notes/0.7.0.md`.

### 0.6.2 validation

Validation covers frontmatter-only body-slot creation with LF, CRLF, CR, BOMs, both closing delimiters, missing and single final endings, whitespace-only EOF, unsafe YAML, note-local controls, idempotence, and precedence over trailing-blank removal. It also covers explicit-save no-change/disabled/safety feedback, silent persisted-modification and self-convergence no-ops, fresh manual Check reads, every existing active-editor and atomic-process guard, TypeScript, the complete declared suite, a separate production build, isolated runtime deployment, and reloaded test-vault QA. Exact final counts, hashes, notices, reload evidence, settings restoration, and QA-note disposition are recorded in `release-notes/0.6.2.md`.

### 0.6.1 validation

Validation covers exact platform Cmd-S/Ctrl-S recognition without consuming Obsidian's shortcut, main/popout document lifecycle, editor-target containment, the existing persisted-modification trigger, active source-mode and file-identity guards, bounded changed-result notices, silent no-change/self-convergence passes, error feedback, blank-line singular/plural summaries, content-only ownership, TypeScript, the complete declared suite, a separate production build, isolated runtime deployment, and reloaded test-vault save-flow QA. Exact final counts, artifact hashes, reload evidence, and QA-note disposition are recorded in `release-notes/0.6.1.md`.

### 0.6.0 validation

Validation covers the default-off leading-spacing setting and schema-v5 migration; LF, CRLF, CR, mixed-ending, and no-ending insertion; BOM preservation; existing and blank-only notes; valid, malformed, unsafe, duplicate-key, and unclosed frontmatter; independence from after-frontmatter spacing; protected first constructs; heading/final-newline/blank-cleanup composition; exact output safety boundaries; and randomized deterministic/idempotent Markdown. The focused suite passes 12 tests, the complete declared suite passes 156 unit/property tests and 15 structural contracts plus TypeScript, and a pinned historical differential preserves exact released behavior across 10,003 cases while the new setting is off.

The required separate production-mode build deployed only byte-changed plugin artifacts to the isolated test runtime and preserved `data.json`; Hot Reload visibly refreshed Obsidian `1.12.7` in **Obsidian Plugin Test Vault**. All four settings destinations were inspected. Runtime Check/Clean QA reported and applied the new action on a messy plain note, kept frontmatter byte zero on a separate guard note, restored the option off, and moved both synthetic notes directly from `Inbox` to `_archive`. Exact artifact hashes, settings-state hashes, notices, reload evidence, and QA-note disposition are recorded in `release-notes/0.6.0.md`.

### 0.5.8 validation

Build-only validation pins exact public `0.5.7` at commit `0f76f1eb962ed1562a299f2d2946831a4ccceced` and source hash `37ecb00b13cec6d2f76adfb1dcd6908a7d6be06625497a99694cd01a1b15833f`. The untouched release passed 142 unit/property tests, 13 structural contracts, TypeScript, and two production-mode builds with runtime deployment suppressed; its generated artifacts matched the public release byte-for-byte. The candidate adds focused first/late/no-collision coverage and a structural one-pass contract. Exact released and candidate filename-decision functions produced zero mismatches across 1,000,000 seeded cases, and the complete `TPSLinterPlugin.createFilenameDecision` path produced zero mismatches across another 100,000 seeded cases.

Across 31 interleaved rounds on 100,000 sibling files, the complete plugin-class path improved from 54.961 ms to 28.430 ms median with no collision (48.3%), from 27.320 ms to 2.155 ms with a collision at index 1 (92.1%), and from 53.948 ms to 28.290 ms with a collision at index 99,998 (47.6%). At the pure decision boundary, the early-collision candidate read 2 sibling-path entries where exact `0.5.7` read all 100,000; the complete class still enumerates the parent once to select sibling files. Final versioned validation passes 143 unit/property tests, 14 structural contracts, TypeScript, the required separate production-mode build, isolated runtime deployment, reload, and read-only command registration inspection. The bundle grows by 24 bytes; exact artifact hashes and test-vault evidence are recorded in `release-notes/0.5.8.md`.

### 0.5.7 validation

Validation covers the exact editor/file comparison contract across 100,000 generated pairs plus an independent 8,225,424-pair exhaustive and 300,000-pair randomized adversarial corpus, BOM plus LF/CRLF/CR representation equivalence, ordinary unequal LF buffers, scheduler and lifecycle behavior, 142 unit/property tests, 13 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and before/after test-vault inspection. On two unequal 1,500,001-character LF buffers, 20 actual released comparisons measured 21.842 ms median and the candidate measured 2.575 ms, an 88.2% reduction at this guard seam. A representation-equivalent 1,000,001-character LF/BOM+CRLF pair remained within ordinary run variance at 255.237 ms versus 253.517 ms across ten comparisons. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.7.md`.

### 0.5.6 validation

Validation covers one shared initial manual-analysis result, unchanged public cleanup output, fresh concurrent-revision cleanup, independent post-output note-control and idempotence verification, final live filename-control rechecks, unchanged safety limits, exact released-source hash pins, a deterministic 10,003-case differential corpus against `0.5.5`, 141 unit/property tests, 13 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. The deterministic manual seam drops from two initial safety/control analyses to one. Synthetic pure-function medians improved 7.6% on a 1,128,890-byte ordinary note, 9.8% on the equivalent control-bearing note, and 50.2% on a 17,031-byte note disabled by one of 1,000 frontmatter fields; these figures are not whole-Obsidian or save-lint speedups. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.6.md`.

### 0.5.5 validation

Validation covers the conservative no-candidate fast path, ordinary and malformed unrelated frontmatter, literal and escaped control keys, unchanged character/line limits, a deterministic 25,007-case differential corpus against the released parser, 140 unit/property tests, 12 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. On the identical 1,000-field no-control fixture, the exact `0.5.4` parser measured 5.499 ms median and `0.5.5` measured 0.059 ms median across 300 calls after warmup, a 98.9% reduction at this seam. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.5.md`.

### 0.5.4 validation

Validation covers the linear string-key semantic verifier, the released right-side snapshot behavior, missing-versus-undefined keys, `NaN`, signed zero, boxed strings, nested structural keys, mixed-key Maps, a deterministic 25,000-case differential corpus against the frozen `0.5.3` comparator, the 1,000-field safety boundary, 139 unit/property tests, 12 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. On the exact 1,000-field reverse-order fixture, end-to-end sorting improved from 33.62 ms to 24.43 ms median, a 27.3% reduction; already-sorted frontmatter still exits before semantic verification. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.4.md`.

### 0.5.3 validation

Validation covers strict current-file identity before and after every manual asynchronous boundary, identical same-path replacement, deletion, non-Markdown replacement, supported same-object rename, precise process rejection, 136 unit/property tests, 12 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.3.md`.

### 0.5.2 validation

Validation covers exact manual-preflight reuse, deterministic full-result equality, concurrent content/control/BOM/line-ending recomputation, the unconditional atomic process and exclusion order, 135 unit/property tests, 11 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. On a deterministic 35,001-line dirty note, the released two-cleanup path measured 125.95 ms median and exact reuse measured 59.67 ms, a 52.6% reduction in Markdown-engine time with equivalent output. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.2.md`.

### 0.5.1 validation

Validation covers exact editor/file fast matching with exhaustive equivalence against the previous BOM/line-ending rules, guarded reuse of an unchanged save preflight, concurrent content/settings fallback behavior, cached frontmatter comparison keys, YAML ordering and safety invariants, 134 unit/property tests, 11 structural contracts, TypeScript, a separate final production-mode build, isolated runtime deployment, and reloaded test-vault inspection. Exact artifact hashes and reload evidence are recorded in `release-notes/0.5.1.md`.

### 0.5.0 validation

Validation covers the schema-v5 default-on save workflow, active-note and Markdown-only event gating, per-note debounce/rerun/error/unload behavior, fresh preflight and atomic live processing, setting/exclusion rechecks, content-only filename isolation, strict frontmatter/body spacing across BOM and LF/CRLF/CR/mixed inputs, malformed-YAML failure, note-local controls, rule composition, idempotence, TypeScript, 133 unit/property tests, 11 structural contracts, a separate final production-mode build, reloaded settings inspection, and active/inactive synthetic-note QA. An additional 196,560-case adversarial probe found no unsafe YAML rewrite, exception, nondeterminism, or non-idempotent result. Exact artifact hashes, reload evidence, and QA-note disposition are recorded in `release-notes/0.5.0.md`.

### 0.4.0 validation

Validation covers note-local full/rule/range controls, terminal-blank and filename switches, filename Unicode/control/device/collision cases, atomic clean and partial-rename reporting, GCM fail-closed ownership, YAML semantic preservation and work caps, BOM and mixed line endings, H1/H2 and H6 heading modes, every protected construct family, CommonMark-column container interleaving and container-relative indented code, adversarial Markdown ambiguity, bounded pathological inputs, deterministic/idempotent cleanup, generated property cases, TypeScript, 110 unit/property tests, 11 structural contracts, a separate final production-mode build, all four reloaded settings destinations, and explicit linting of synthetic messy Inbox notes. Independent CommonMark-oracle sweeps covered 31,693 fence/closer cases, 31,399 indented-code lines, and 13 multiline indented-code boundaries. Exact artifact hashes, reload evidence, and QA-note disposition are recorded in `release-notes/0.4.0.md`.

### 0.3.0 validation

Validation covers the default-off H6 option, a standalone H2-to-H6 transformation, skipped source levels, repeated siblings, uneven branches, multiple roots, protected blocks, inline protected headings, preserved CRLF and closing markers, dormant behavior when normalization is off, schema v2-to-v3 migration, conditional settings visibility, idempotence, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, reloaded settings inspection, and explicit linting of synthetic messy Inbox notes. Exact final counts, artifact hashes, reload evidence, and QA note disposition are recorded in `release-notes/0.3.0.md`.

### 0.2.0 validation

Validation covers safe YAML CST sorting and semantic verification, GCM property-order compatibility, blank-line and heading rules, protected regions, exact line endings, idempotence, schema migration, destination navigation, accessibility/mobile contracts, commands, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, reloaded settings inspection, and explicit linting of synthetic messy Inbox notes. All 51 automated tests passed; exact reload evidence, artifact hashes, and QA note disposition are recorded in `release-notes/0.2.0.md`.

### 0.1.0 validation

Validation covers pure filename planning and collision/ownership guards, TPS filename preservation, exact line-ending and protected-block preservation, idempotence, settings normalization, command and settings contracts, TypeScript, the complete declared suite, a separate final production-mode build, runtime deployment, and a reloaded test-vault UI inspection. Exact final test counts, reload evidence, and artifact hashes are recorded in `release-notes/0.1.0.md`.

## Version history

### 0.7.1

- Preserves the complete text of headings containing case-sensitive tags, links, URLs, URIs, forward-slash paths, inline code, HTML entities, escaped Markdown, and related inline syntax under both capitalization modes.
- Covers punctuation-adjacent and Unicode/emoji tags, wikilinks and embeds, Markdown links and images, custom schemes, internationalized domains, IPv4/localhost/relative forward-slash paths, and autolinks.
- Keeps heading-level normalization independent, so hashes may still be corrected while protected heading text and capitalization counters remain unchanged.
- Uses bounded linear checks at the 32,000-character line limit and changes no setting, default, schema field, exclusion, command, or filename behavior.

### 0.7.0

- Adds default-off **Remove blank lines between list items** under **Clean notes**, with separate manual and save-lint reporting.
- Compacts blank-only gaps between compatible bullet, ordered, and checklist siblings while preserving mixed list types, continuation paragraphs, ambiguous indentation, thematic breaks, and protected Markdown.
- Adds stable note-local rule ID `list-item-blank-lines` and schema-v7 migration that leaves the new mutation disabled on every existing installation.
- Moves both body-start spacing choices into **Clean notes**, names the frontmatter location as immediately below the closing `---`, and clarifies that opt-in rules must be enabled on each device.
- Makes manual Check/Clean and explicit Cmd-S/Ctrl-S identify the exact relevant body-line or list-gap setting that is currently off instead of returning an unexplained no-op.
- Preserves exact LF, CRLF, CR, and BOM representation, bounded work, full-output verification, second-pass idempotence, active-editor save guards, filename ownership, and every existing setting/default/exclusion.

### 0.6.2

- Creates and preserves one usable body slot after safe frontmatter-only notes when the existing default-off **Add blank line after frontmatter** rule is enabled.
- Keeps LF, CRLF, CR, BOM, `---`/`...` closer, YAML safety, note-local control, output-limit, and idempotence guarantees; **Remove trailing blank lines** removes excess padding without erasing the requested slot.
- Reports **no eligible changes**, note-local disablement, or a safety block after an explicit conventional Save that reaches the worker without changing content; ordinary modify and convergence no-ops remain silent.
- Makes manual **Check current note** inspect fresh persisted bytes and describes no-op Markdown as clean under the currently enabled rules.
- Preserves schema v6, every setting/default/exclusion, content-only save ownership, passive shortcut observation, atomic `Vault.process`, and all active-editor/file-revision guards.

### 0.6.1

- Makes Cmd/Ctrl-S schedule the existing guarded save-lint worker even when an already-open note has no new bytes for Obsidian to persist.
- Observes the shortcut without preventing or replacing Obsidian's save behavior; persisted edits continue to use the supported Vault `modify` event and coalesce with the shortcut request.
- Shows one concise native Obsidian notice after content changes are successfully applied, with exact rule counts such as removed blank lines or adjusted headings.
- Keeps no-change, excluded, inactive, safety-blocked, and plugin-generated convergence passes silent; automatic filename cleanup remains disabled.
- Preserves schema v6, every rule/default/exclusion, atomic `Vault.process` mutation, active-editor identity checks, protected Markdown, and all bounded-work guards.

### 0.6.0

- Adds default-off **Add blank line at beginning of note** for plain notes.
- Preserves byte-zero BOMs and existing LF, CRLF, CR, and mixed endings; empty, blank-only, and already-spaced notes stay unchanged.
- Never displaces any first-line `---` opener, including malformed, unsafe, or unclosed frontmatter; frontmatter notes continue to use the independent after-frontmatter option.
- Adds the stable `leading-blank-line` rule ID, manual Check/Clean reporting, schema-v6 migration, output-boundary verification, and BOM-aware leading blank cleanup.
- Preserves lint-on-save scope, filename ownership, all existing rule defaults, commands, exclusions, and protected-Markdown behavior.

### 0.5.8

- Checks case-insensitive, Unicode-normalized sibling filename collisions in one ordered pass.
- Normalizes each sibling path once and stops as soon as the first released-order collision is found.
- Preserves sibling-only scope, source-file exclusion, first-collision detail, GCM ownership, commands, settings, rules, and every fail-closed decision.
- Adds no state, cache, retry, fallback route, monkeypatch, polling, or unsupported Obsidian behavior.

### 0.5.7

- Unequal editor/file buffers that contain neither a leading BOM nor carriage returns now compare directly instead of normalizing both complete strings.
- Representation-only BOM and LF/CRLF/CR equivalence, active-note save guards, commands, settings, rules, and mutation behavior remain unchanged.
- Adds one small pure eligibility helper and no state, cache, retry, fallback route, monkeypatch, polling, or unsupported Obsidian behavior.

### 0.5.6

- Shares one initial safety scan and note-control parse between manual inspection and Markdown cleanup for the same file revision.
- Preserves fresh cleanup for changed process bytes, independent post-output verification, and a final live note-control read before filename eligibility.
- Preserves every released command, setting, default, rule, cleanup result, work limit, and fail-closed guard without adding cache state, fallback routing, retry, monkeypatching, polling, or unsupported Obsidian behavior.

### 0.5.5

- Skips YAML control parsing when bounded frontmatter contains neither a literal TPS Linter control-key candidate nor any escape backslash.
- Retains the full parser for all candidate and escaped-key cases, preserving every note-local control, malformed-control fail-closed guard, size limit, command, setting, default, and cleanup result.
- Adds no persistent cache, fallback route, retry, monkeypatch, polling, or unsupported Obsidian behavior.

### 0.5.4

- Replaces repeated linear searches and entry-array splices with exact string-key lookup for ordinary frontmatter semantic verification.
- Retains one right-side snapshot and the complete structural comparator for complex or mixed nested YAML keys.
- Preserves every command, setting, default, cleanup result, work limit, fail-closed guard, and plugin API without adding persistent state, fallback routing, monkeypatching, or unsupported Obsidian behavior.

### 0.5.3

- Keeps manual inspection, atomic content cleanup, and filename cleanup attached to the exact selected vault file object.
- Rejects deletion, non-Markdown conversion, and a different note recreated at the same path across every asynchronous boundary.
- Uses supported `Vault.getFileByPath`, `Vault.process`, and `FileManager.renameFile` behavior without retry, path handoff, adapter mutation, cache, or monkeypatch.

### 0.5.2

- Reuses the already verified manual-clean preflight only when `Vault.process` receives the exact same note bytes.
- Recomputes with the existing captured options for every concurrent byte change while preserving unconditional atomic processing, live exclusion checks, filename safeguards, notices, settings, and output.
- Adds no persistent cache, migration, fallback route, monkeypatch, or unsupported Obsidian API.

### 0.5.1

- Avoids allocating normalized note copies when the active editor and persisted Markdown already match exactly.
- Reuses the verified save-clean result only when both file bytes and every cleanup option remain unchanged inside the atomic process callback.
- Normalizes frontmatter sort keys and resolves their priority once per field instead of repeatedly inside the comparator.
- Preserves every command, setting, default, mutation guard, YAML safety rule, and output byte contract; no migration is required.

### 0.5.0

- Enabled default-on, active-note Markdown linting after Obsidian persists a modification.
- Added per-note debounce, one-rerun convergence, unload cancellation, fresh no-write preflights, and atomic live-content rechecks.
- Kept all save-triggered work silent and content-only; filename cleanup remains manual, and GCM remains the automatic filename owner.
- Added the default-off **Add blank line after frontmatter** rule and stable `frontmatter-blank-line` note-local rule ID.
- Migrated persisted settings to schema v5 without changing existing rule or exclusion choices.
- Added focused scheduler, frontmatter-spacing, migration, UI, and runtime safety coverage.

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
