// Generated from settings UI copy. Run npm run settings:search; do not edit.
export const SETTINGS_SEARCH_ROUTES = {
  "clean-notes": "Clean notes",
  "headings": "Headings",
  "frontmatter": "Frontmatter",
  "files-safety": "Files & safety"
} as const;
export const SETTINGS_SEARCH_ENTRIES = [
  {"name":"Check current note","desc":"","aliases":["Report eligible filename and Markdown changes without writing","Check current note"],"route":"clean-notes"},
  {"name":"Clean current note","desc":"","aliases":["Apply the configured rules to the current eligible note","Clean current note"],"route":"clean-notes"},
  {"name":"Open GCM settings","desc":"","aliases":["Open TPS Global Context Menu settings","Open GCM settings"],"route":"files-safety"},
  {"name":"Obsidian Sync scope","desc":"Downloaded settings apply without reloading TPS Linter when community plugins and their settings are synced on every device connected to the same remote vault. Sync choices are device-local. Separate vaults keep separate settings.","aliases":["Obsidian Sync scope"],"route":"files-safety"},
  {"name":"Clean filenames","desc":"Allow an explicit Clean action to apply an eligible filename plan. Turn this off to lint note content only.","aliases":["Clean filenames"],"route":"files-safety"},
  {"name":"Unsafe character replacement","desc":"How a manual filename plan handles control characters and cross-platform-unsafe filename characters.","aliases":["Unsafe character replacement","Remove","Replace with a dash","Replace with a space"],"route":"files-safety"},
  {"name":"Remove Obsidian link-control characters","desc":"Also remove #, ^, [, and ] from a manual filename plan. Off preserves existing TPS names.","aliases":["Remove Obsidian link-control characters"],"route":"files-safety"},
  {"name":"Move tags to frontmatter","desc":"Move standalone tag-only lines into tags. Leaves tags in prose, tasks, code, and protected content untouched.","aliases":["Move tags to frontmatter"],"route":"clean-notes"},
  {"name":"Add blank line before plain-note content","desc":"In notes without frontmatter, insert one empty line before the first body content.","aliases":["Add blank line before plain-note content"],"route":"clean-notes"},
  {"name":"Add blank body line after frontmatter","desc":"Insert one empty, editable line immediately below the closing --- (or ...) in valid top-of-note frontmatter, including metadata-only notes.","aliases":["Add blank body line after frontmatter"],"route":"clean-notes"},
  {"name":"Remove extra blank lines","desc":"Collapse consecutive blank lines to one outside protected YAML, code, math, raw HTML, and Templater regions.","aliases":["Remove extra blank lines"],"route":"clean-notes"},
  {"name":"Remove blank lines between list items","desc":"Remove blank-only separators between same-indentation Markdown list items and checklists. Eligible items may contain complete same-line HTML comments; item text stays byte-identical. Nested transitions, mixed list types, continuation paragraphs, and multiline or other protected regions stay unchanged.","aliases":["Remove blank lines between list items"],"route":"clean-notes"},
  {"name":"Clear whitespace-only lines","desc":"Remove spaces and tabs from blank lines outside protected YAML, code, raw HTML, and Templater regions.","aliases":["Clear whitespace-only lines"],"route":"clean-notes"},
  {"name":"Trim nonblank trailing whitespace","desc":"Remove trailing spaces and tabs outside protected regions while retaining a two-space Markdown hard break.","aliases":["Trim nonblank trailing whitespace"],"route":"clean-notes"},
  {"name":"Ensure a final newline","desc":"Add one missing final newline to a non-empty note without removing existing terminal blank lines or changing existing line endings.","aliases":["Ensure a final newline"],"route":"clean-notes"},
  {"name":"Remove trailing blank lines","desc":"Remove unprotected blank padding at the end of a note while retaining exactly one final newline. Off preserves existing terminal blank lines.","aliases":["Remove trailing blank lines"],"route":"clean-notes"},
  {"name":"Capitalize headings","desc":"Choose how cleanup adjusts plain ATX heading text. First letter is the conservative TPS default.","aliases":["Capitalize headings","Use title case","Capitalize first letter","Off"],"route":"headings"},
  {"name":"Normalize heading levels","desc":"Start the heading hierarchy at the selected level and prevent a heading from increasing by more than one level.","aliases":["Normalize heading levels"],"route":"headings"},
  {"name":"Push heading hierarchy down to H6","desc":"Move the complete ATX heading outline down so its deepest nested level is H6. A standalone heading becomes H6 while parent and sibling relationships stay intact.","aliases":["Push heading hierarchy down to H6"],"route":"headings"},
  {"name":"First heading level","desc":"Use H1 for normal notes or H2 when another system owns the page title.","aliases":["First heading level","H2","H1"],"route":"headings"},
  {"name":"Sort frontmatter fields","desc":"Order top-level fields using TPS Global Context Menu property priority first, then sort remaining fields alphabetically.","aliases":["Sort frontmatter fields"],"route":"frontmatter"},
  {"name":"Open GCM settings","desc":"","aliases":["Configure TPS Global Context Menu property order","Open GCM settings"],"route":"frontmatter"},
  {"name":"Excluded paths","desc":"One exact file, folder prefix, or segment-safe * wildcard per line. Internal TPS safety guards always remain active.","aliases":["Excluded paths","Templates\nRecurring Templates\n_archive"],"route":"files-safety"},
  {"name":"Log cleanup decisions","desc":"Log compact trigger, path, and result fields. Note bodies and full settings are never logged.","aliases":["Log cleanup decisions"],"route":"files-safety"},
  {"name":"Files & safety","desc":"Open this settings area.","aliases":["TPS Linter","Settings updated from Obsidian Sync or another external change.","Choose what to configure","Automatic filename ownership","TPS Global Context Menu currently owns automatic title and filename synchronization.","Settings sync","Filename rules","Scope","Diagnostics","Note-local controls","tps-linter: false","tps-linter-disabled-rules","filename, whitespace-only-lines, blank-lines, list-item-blank-lines, trailing-whitespace, trailing-blank-lines, final-newline, leading-blank-line, heading-capitalization, heading-levels, frontmatter-blank-line, frontmatter-sort, all","<!-- tps-linter-disable -->","<!-- tps-linter-enable -->","Working…"],"route":"files-safety"},
  {"name":"Clean notes","desc":"Open this settings area.","aliases":["Current note","Check is read-only. Clean rechecks the live file and applies only eligible changes.","Clean notes"],"route":"clean-notes"},
  {"name":"Headings","desc":"Open this settings area.","aliases":["Headings"],"route":"headings"},
  {"name":"Frontmatter","desc":"Open this settings area.","aliases":["Frontmatter","Property order ownership","TPS Global Context Menu owns the shared priority order. TPS Linter follows that order when available and uses its TPS fallback order otherwise; fields not listed there remain alphabetical."],"route":"frontmatter"}
] as const;
