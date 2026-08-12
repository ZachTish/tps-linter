import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
  type MarkdownCleanupResult,
} from "../src/cleaner.ts";
import {
  formatExplicitSaveNoChangeNotice,
  formatSaveLintNotice,
} from "../src/save-lint-feedback.ts";

const OPTIONS: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
  removeBlankLinesBetweenListItems: false,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: true,
  ensureBlankLineAtBeginning: false,
  headingCapitalizationStyle: "first-letter",
  normalizeHeadingLevels: true,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: false,
  ensureBlankLineAfterFrontmatter: false,
  frontmatterPriorityKeys: [],
};

test("save feedback reports applied blank-line and heading changes", () => {
  const result = cleanMarkdown("## heading\n\n\nBody\n", OPTIONS);

  assert.equal(result.output, "# Heading\n\nBody\n");
  assert.equal(
    formatSaveLintNotice(result),
    "TPS Linter: removed 1 extra blank line, capitalized 1 heading, and adjusted 1 heading level.",
  );
});

test("save feedback names compacted list-item gaps", () => {
  const result = cleanMarkdown("- one\n\n- two\n\n- three\n", {
    ...OPTIONS,
    removeBlankLinesBetweenListItems: true,
  });

  assert.equal(result.changes.listItemBlankLinesRemoved, 2);
  assert.equal(
    formatSaveLintNotice(result),
    "TPS Linter: removed 2 blank lines between list items.",
  );
});

test("save feedback stays silent for the convergent self-triggered rerun", () => {
  const first = cleanMarkdown("A\n\n\nB\n", OPTIONS);
  const second = cleanMarkdown(first.output, OPTIONS);

  assert.equal(first.output, "A\n\nB\n");
  assert.equal(formatSaveLintNotice(first), "TPS Linter: removed 1 extra blank line.");
  assert.equal(second.changed, false);
  assert.equal(formatSaveLintNotice(second), null);
  assert.equal(
    formatExplicitSaveNoChangeNotice(second),
    "TPS Linter: no changes under the rules enabled on this device.",
  );
});

test("explicit-save feedback names relevant opt-in rules that are off", () => {
  const clean = cleanMarkdown("Body\n", OPTIONS);
  assert.equal(
    formatExplicitSaveNoChangeNotice(clean, ["leading-blank-line"]),
    "TPS Linter: no changes; Add blank line before plain-note content is off on this device.",
  );
  assert.equal(
    formatExplicitSaveNoChangeNotice(clean, [
      "frontmatter-blank-line",
      "list-item-blank-lines",
    ]),
    "TPS Linter: no changes; Add blank body line after frontmatter and Remove blank lines between list items are off on this device.",
  );
});

test("explicit-save no-change feedback distinguishes disabled and blocked notes", () => {
  const clean = cleanMarkdown("Body\n", OPTIONS);
  assert.equal(
    formatExplicitSaveNoChangeNotice(clean),
    "TPS Linter: no changes under the rules enabled on this device.",
  );
  assert.equal(
    formatExplicitSaveNoChangeNotice({
      ...clean,
      noteDisabledReason: "tps-linter: false",
    }),
    "TPS Linter: skipped because this note disables cleanup.",
  );
  assert.equal(
    formatExplicitSaveNoChangeNotice({
      ...clean,
      safetyBlockedReason: "a line is too long",
    }),
    "TPS Linter: skipped by the safety verifier.",
  );
  assert.equal(
    formatExplicitSaveNoChangeNotice({
      ...clean,
      changes: {
        ...clean.changes,
        frontmatterSortSkippedReason: "Duplicate top-level key",
      },
    }),
    "TPS Linter: no changes; frontmatter sorting was skipped for safety.",
  );
  assert.equal(
    formatExplicitSaveNoChangeNotice({ ...clean, changed: true }),
    null,
  );
});

test("save feedback uses a bounded fallback for an unclassified change", () => {
  const result: MarkdownCleanupResult = {
    output: "changed",
    changed: true,
    changes: {
      whitespaceOnlyLinesCleaned: 0,
      extraBlankLinesRemoved: 0,
      listItemBlankLinesRemoved: 0,
      nonblankTrailingWhitespaceLinesCleaned: 0,
      trailingBlankLinesRemoved: 0,
      headingsCapitalized: 0,
      headingLevelsAdjusted: 0,
      frontmatterFieldsReordered: 0,
      leadingBlankLineAdded: false,
      frontmatterBlankLineAdded: false,
      frontmatterSortSkippedReason: null,
      finalNewlineAdded: false,
    },
    disabledRules: [],
    noteDisabledReason: null,
    safetyBlockedReason: null,
  };

  assert.equal(formatSaveLintNotice(result), "TPS Linter cleaned this note.");
});

test("save feedback bounds a many-rule result to three named actions", () => {
  const result: MarkdownCleanupResult = {
    output: "changed",
    changed: true,
    changes: {
      whitespaceOnlyLinesCleaned: 2,
      extraBlankLinesRemoved: 3,
      listItemBlankLinesRemoved: 0,
      nonblankTrailingWhitespaceLinesCleaned: 4,
      trailingBlankLinesRemoved: 5,
      headingsCapitalized: 6,
      headingLevelsAdjusted: 7,
      frontmatterFieldsReordered: 8,
      leadingBlankLineAdded: true,
      frontmatterBlankLineAdded: true,
      frontmatterSortSkippedReason: null,
      finalNewlineAdded: true,
    },
    disabledRules: [],
    noteDisabledReason: null,
    safetyBlockedReason: null,
  };

  const message = formatSaveLintNotice(result);
  assert.equal(
    message,
    "TPS Linter: cleared 2 whitespace-only lines, removed 3 extra blank lines, trimmed trailing whitespace on 4 lines, and applied 29 more fixes.",
  );
  assert.ok((message?.length ?? 0) <= 180);
});
