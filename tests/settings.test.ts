import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  normalizeSettings,
} from "../src/settings.ts";

const EXPECTED_SETTING_KEYS = [
  "cleanWhitespaceOnlyLines",
  "diagnostics",
  "ensureFinalNewline",
  "excludedPaths",
  "filenameUnsafeCharacterStyle",
  "removeObsidianLinkCharacters",
  "schemaVersion",
  "trimNonblankTrailingWhitespace",
];

test("settings defaults are conservative and TPS-specific", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    schemaVersion: 1,
    filenameUnsafeCharacterStyle: "space",
    removeObsidianLinkCharacters: false,
    cleanWhitespaceOnlyLines: true,
    trimNonblankTrailingWhitespace: false,
    ensureFinalNewline: true,
    excludedPaths: [
      "Templates",
      "Recurring Templates",
      "Fixtures",
      "Archive",
      "_archive",
      "README.md",
    ],
    diagnostics: false,
  });
});

test("v1 settings contain no automatic mutation option", () => {
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

test("normalization accepts valid values and stamps schema v1", () => {
  assert.deepEqual(
    normalizeSettings({
      schemaVersion: 999,
      filenameUnsafeCharacterStyle: "dash",
      removeObsidianLinkCharacters: true,
      cleanWhitespaceOnlyLines: false,
      trimNonblankTrailingWhitespace: true,
      ensureFinalNewline: false,
      excludedPaths: [],
      diagnostics: true,
    }),
    {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      filenameUnsafeCharacterStyle: "dash",
      removeObsidianLinkCharacters: true,
      cleanWhitespaceOnlyLines: false,
      trimNonblankTrailingWhitespace: true,
      ensureFinalNewline: false,
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
      trimNonblankTrailingWhitespace: null,
      ensureFinalNewline: {},
      excludedPaths: "Templates",
      diagnostics: 1,
    }),
    {
      ...normalizeSettings(undefined),
      excludedPaths: [...DEFAULT_SETTINGS.excludedPaths],
    },
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
