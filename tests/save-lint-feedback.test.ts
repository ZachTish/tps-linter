import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
  type MarkdownCleanupResult,
} from "../src/cleaner.ts";
import { formatSaveLintNotice } from "../src/save-lint-feedback.ts";

const OPTIONS: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
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

test("save feedback stays silent for the convergent self-triggered rerun", () => {
  const first = cleanMarkdown("A\n\n\nB\n", OPTIONS);
  const second = cleanMarkdown(first.output, OPTIONS);

  assert.equal(first.output, "A\n\nB\n");
  assert.equal(formatSaveLintNotice(first), "TPS Linter: removed 1 extra blank line.");
  assert.equal(second.changed, false);
  assert.equal(formatSaveLintNotice(second), null);
});

test("save feedback uses a bounded fallback for an unclassified change", () => {
  const result: MarkdownCleanupResult = {
    output: "changed",
    changed: true,
    changes: {
      whitespaceOnlyLinesCleaned: 0,
      extraBlankLinesRemoved: 0,
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
