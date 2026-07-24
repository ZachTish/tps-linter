import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS,
  SETTINGS_SCHEMA_VERSION,
  normalizeSettings,
  resolveFrontmatterPriorityKeys,
} from "../src/settings.ts";

const EXPECTED_SETTING_KEYS = [
  "cleanWhitespaceOnlyLines",
  "collapseConsecutiveBlankLines",
  "diagnostics",
  "ensureFinalNewline",
  "excludedPaths",
  "filenameUnsafeCharacterStyle",
  "headingCapitalizationStyle",
  "headingStartLevel",
  "normalizeHeadingLevels",
  "removeObsidianLinkCharacters",
  "schemaVersion",
  "sortFrontmatterFields",
  "trimNonblankTrailingWhitespace",
];

test("settings defaults are conservative and TPS-specific", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    schemaVersion: 2,
    filenameUnsafeCharacterStyle: "space",
    removeObsidianLinkCharacters: false,
    cleanWhitespaceOnlyLines: true,
    collapseConsecutiveBlankLines: true,
    trimNonblankTrailingWhitespace: false,
    ensureFinalNewline: true,
    headingCapitalizationStyle: "first-letter",
    normalizeHeadingLevels: true,
    headingStartLevel: 1,
    sortFrontmatterFields: true,
    excludedPaths: [
      "Templates",
      "Recurring Templates",
      "Fixtures",
      "Archive",
      "_archive",
      "_templates",
      "System/Templates",
      "README.md",
    ],
    diagnostics: false,
  });
});

test("GCM property priority is trimmed, case-deduplicated, and fail-safe", () => {
  assert.deepEqual(
    resolveFrontmatterPriorityKeys([
      { key: " status " },
      { key: "Priority" },
      { key: "STATUS" },
      { key: "" },
      { key: 42 },
      null,
    ]),
    ["status", "Priority"],
  );
  assert.deepEqual(
    resolveFrontmatterPriorityKeys(undefined),
    DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS,
  );
  assert.notEqual(
    resolveFrontmatterPriorityKeys(undefined),
    DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS,
  );
});

test("v2 settings contain no automatic mutation option", () => {
  for (const key of [
    "automatic",
    "automaticMutation",
    "lintOnSave",
    "lintOnFileChange",
    "cleanOnSave",
  ]) {
    assert.equal(key in DEFAULT_SETTINGS, false);
    assert.equal(
      key in normalizeSettings({ [key]: true }),
      false,
      `${key} must remain ignored`,
    );
  }
});

test("normalization accepts valid values and stamps schema v2", () => {
  assert.deepEqual(
    normalizeSettings({
      schemaVersion: 999,
      filenameUnsafeCharacterStyle: "dash",
      removeObsidianLinkCharacters: true,
      cleanWhitespaceOnlyLines: false,
      collapseConsecutiveBlankLines: false,
      trimNonblankTrailingWhitespace: true,
      ensureFinalNewline: false,
      headingCapitalizationStyle: "title-case",
      normalizeHeadingLevels: false,
      headingStartLevel: 2,
      sortFrontmatterFields: false,
      excludedPaths: [],
      diagnostics: true,
    }),
    {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      filenameUnsafeCharacterStyle: "dash",
      removeObsidianLinkCharacters: true,
      cleanWhitespaceOnlyLines: false,
      collapseConsecutiveBlankLines: false,
      trimNonblankTrailingWhitespace: true,
      ensureFinalNewline: false,
      headingCapitalizationStyle: "title-case",
      normalizeHeadingLevels: false,
      headingStartLevel: 2,
      sortFrontmatterFields: false,
      excludedPaths: [],
      diagnostics: true,
    },
  );
});

test("invalid enum and primitive values safely fall back", () => {
  assert.deepEqual(
    normalizeSettings({
      filenameUnsafeCharacterStyle: "underscore",
      removeObsidianLinkCharacters: "true",
      cleanWhitespaceOnlyLines: 0,
      collapseConsecutiveBlankLines: "yes",
      trimNonblankTrailingWhitespace: null,
      ensureFinalNewline: {},
      headingCapitalizationStyle: "sentence-case",
      normalizeHeadingLevels: "true",
      headingStartLevel: 3,
      sortFrontmatterFields: null,
      excludedPaths: "Templates",
      diagnostics: 1,
    }),
    {
      ...normalizeSettings(undefined),
      excludedPaths: [...DEFAULT_SETTINGS.excludedPaths],
    },
  );
});

test("v1 migration appends new template exclusions without removing custom entries", () => {
  assert.deepEqual(
    normalizeSettings({
      schemaVersion: 1,
      excludedPaths: ["Custom/Safe", "_templates", "Archive"],
    }).excludedPaths,
    ["Custom/Safe", "_templates", "Archive", "System/Templates"],
  );
});

test("v2 preserves an explicit exclusion list, including intentional removals", () => {
  assert.deepEqual(
    normalizeSettings({
      schemaVersion: 2,
      excludedPaths: ["Custom/Safe"],
    }).excludedPaths,
    ["Custom/Safe"],
  );
});

test("unknown keys are ignored", () => {
  const normalized = normalizeSettings({
    diagnostics: true,
    noteBody: "private content",
    settingsDump: { secret: "not retained" },
    futureSetting: true,
  });

  assert.deepEqual(Object.keys(normalized).sort(), EXPECTED_SETTING_KEYS);
  assert.equal(normalized.diagnostics, true);
});

test("excluded paths are trimmed, deduplicated, and type-safe", () => {
  assert.deepEqual(
    normalizeSettings({
      schemaVersion: 2,
      excludedPaths: [
        " Templates ",
        "Templates",
        "",
        "   ",
        42,
        null,
        "_archive",
        " _archive ",
        "README.md",
      ],
    }).excludedPaths,
    ["Templates", "_archive", "README.md"],
  );
});

test("defaults and normalized path arrays do not share mutable state", () => {
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS), true);
  assert.equal(Object.isFrozen(DEFAULT_SETTINGS.excludedPaths), true);

  const first = normalizeSettings(undefined);
  const second = normalizeSettings(undefined);
  assert.notEqual(first.excludedPaths, second.excludedPaths);

  first.excludedPaths.push("Scratch");
  assert.equal(second.excludedPaths.includes("Scratch"), false);
  assert.equal(DEFAULT_SETTINGS.excludedPaths.includes("Scratch"), false);
});

test("settings UI preserves controls behind four accessible transient routes", () => {
  const source = readFileSync(
    new URL("../src/settings-tab.ts", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../styles.css", import.meta.url),
    "utf8",
  );

  for (const label of [
    "Clean notes",
    "Headings",
    "Frontmatter",
    "Files & safety",
  ]) {
    assert.equal(source.includes(`label: "${label}"`), true);
  }

  for (const settingName of [
    "Remove extra blank lines",
    "Clear whitespace-only lines",
    "Trim nonblank trailing whitespace",
    "Ensure a final newline",
    "Capitalize headings",
    "Normalize heading levels",
    "First heading level",
    "Sort frontmatter fields",
    "Unsafe character replacement",
    "Remove Obsidian link-control characters",
    "Excluded paths",
    "Log cleanup decisions",
  ]) {
    assert.match(source, new RegExp(`setName\\("${settingName}"\\)`));
  }

  assert.match(source, /Choose what to configure/);
  assert.match(source, /activeDestination: SettingsDestination = "clean-notes"/);
  assert.match(source, /"aria-pressed"/);
  assert.match(source, /routeButtons\.get\(destination\.id\)\?\.focus\(\)/);
  assert.match(source, /focusSettingControl\("Normalize heading levels"\)/);
  assert.match(source, /if \(this\.plugin\.settings\.normalizeHeadingLevels\)/);
  assert.doesNotMatch(source, /createEl\(\s*["']details["']/);
  assert.doesNotMatch(source, /createEl\(\s*["']summary["']/);

  assert.match(styles, /\.tps-linter-settings-route-strip/);
  assert.match(styles, /\.tps-linter-settings-route:focus-visible/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(
    styles,
    /@media \(max-width: 640px\)[\s\S]*\.tps-linter-settings-route-strip[\s\S]*overflow-x:\s*auto/,
  );

  for (const selector of styles
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("."))) {
    assert.match(selector, /^\.tps-linter-/, `unscoped CSS selector: ${selector}`);
  }
});
