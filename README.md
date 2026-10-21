# TPS Linter

## Development workflow

Run `npm test`, then `npm run build` for the separate final production-mode build. Both commands stay inside this checkout and never deploy or reload a vault. The build needs only this repository and its declared dependencies; no parent workspace helper is imported. Deployment is an explicit test-vault operation owned by the workspace release checklist. Runtime artifacts and private settings are never copied back into source. This tooling-only change does not alter the plugin version or runtime behavior.

Conservative, explicit Markdown and filename cleanup for TPS notes.

Current release: [1.0.0](https://github.com/ZachTish/tps-linter/releases/tag/1.0.0) · Obsidian 1.10.0+ · Desktop and mobile.

## Install with BRAT

Add `ZachTish/tps-linter` to BRAT. Use manual updates with `Latest`, or freeze an exact numeric tag for a controlled rollout. Each release supplies `main.js`, `manifest.json`, and `styles.css`; release notes record validation and artifact hashes. A published release is not evidence that any device has installed it.

## Clean a note

Use **Check current note** for a read-only report or **Clean current note** to apply enabled rules. Cleanup runs only through these explicit commands, their file-menu entries, or the settings action buttons. Saving, focusing, opening, and syncing notes do not run cleanup. The save/focus scheduler and controls have been removed in 1.0.0; existing saved flags remain inert.

**Move tags to frontmatter** is also opt-in. It merges standalone tag-only lines into `tags`, deduplicating case-insensitively. It leaves tags in prose, tasks, fences, indented content, and protected content untouched. Invalid YAML and unsupported tag values are unchanged. Note-level rule exclusions still apply.

## Settings and safeguards

The settings destinations are **Clean notes**, **Headings**, **Frontmatter**, and **Files & safety**. Rules and exclusions are shared vault configuration. Manual filename cleanup, heading rules, whitespace handling, frontmatter order, and diagnostics remain configurable.

Manual cleanup respects excluded paths and note-local protections. Clean rereads the active content and uses guarded writes; it does not blindly replace a file from an old snapshot. Source-mode content remains Markdown.

See [the detailed reference](REFERENCE.md) for the complete rule list, filename ownership, note-local controls, compatibility behavior, and release-specific validation. The current options and defaults are defined in [src/settings.ts](src/settings.ts).

## Development and repository policy

`main` is the stable source line. Numeric tags identify immutable released artifacts. `optimization` is an unreleased work-in-progress lane; do not install it through BRAT or merge it into stable without separate validation.

Documentation-only maintenance does not create a new plugin version. Published release tags and assets are preserved. Do not rely on legacy version/release scripts without reviewing their current behavior. Production updates remain the user's BRAT handoff.

For prior feature details and release-specific evidence, see [REFERENCE.md](REFERENCE.md) and [GitHub releases](https://github.com/ZachTish/tps-linter/releases). The September 16 cleanup changes documentation and repository metadata, not shipped behavior.

## 1.0.0 — explicit cleanup only

This release removes 982 net runtime source lines: save/focus event observers, the debounce scheduler, feedback state, automatic mutation checks, and their two settings. Only the explicit file-menu listener remains; command and settings actions are retained. Legacy automation fields are preserved on disk by the existing latest-source settings merge but are absent from normalized runtime settings.

Versioned validation: 258 unit/runtime tests, 18 settings/source contracts, TypeScript/build, and 10,003 historical differential cases pass. The runtime harness bundles the actual entry point with mocked Obsidian boundaries: 100 bursts of seven events produce zero body reads, inventories, writer attempts, settings saves, or timers. Explicit Check/Clean and unload during settings initialization are covered. These counts are isolated tests, not foreground application measurements.

The test-vault runtime was deployed and reloaded. Settings QA covered all four destinations without note writes or provider requests. Combined cleaned TPS measurements (five foreground samples each) showed startup median 6084.7 ms versus 6066.2 ms before cleanup, and 20-note navigation median 838.9 ms versus 897.2 ms. These are suite measurements, not Linter-only attribution, and do not prove production or mobile speed. The ten-minute idle, two-minute typing, and 100-file arrival checks observed no TPS maintenance writes. Core saves and read-only indexing were counted separately.

Version 1.0.0 intentionally removes automatic cleanup; use explicit Check/Clean instead. No notes or stored settings are migrated or deleted. Old automation flags stay inert in this release. Rolling back to 0.8.0 can reactivate those saved flags; review them before re-enabling the older plugin. Physical iPhone acceptance remains pending. Production installation is the user's BRAT pull, not part of test-vault deployment.

Installed 1.0.0 verification: Check left a synthetic note byte-identical; Clean capitalized its heading and preserved its paragraph; repeat Clean was unchanged. The fixture was archived and the original active note restored. Final tests/build and plugin manifest reload completed in the test vault.
