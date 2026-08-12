import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";
import {
  describeRelevantOptInRules,
  findRelevantDisabledOptInRules,
} from "../src/opt-in-suggestions.ts";

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

test("reports relevant disabled spacing rules without mutating content", () => {
  const frontmatter = "---\ntitle: Test\n---\nBody\n\n- one\n\n- two\n";
  const frontmatterResult = cleanMarkdown(frontmatter, OPTIONS);
  assert.equal(frontmatterResult.changed, false);
  assert.deepEqual(
    findRelevantDisabledOptInRules(
      frontmatter,
      OPTIONS,
      frontmatterResult,
    ),
    ["frontmatter-blank-line", "list-item-blank-lines"],
  );
  assert.equal(frontmatterResult.output, frontmatter);

  const plain = "Body\n";
  assert.deepEqual(findRelevantDisabledOptInRules(plain, OPTIONS), [
    "leading-blank-line",
  ]);
});

test("omits enabled, inapplicable, disabled-by-note, and blocked rules", () => {
  const input = "---\ntitle: Test\n---\nBody\n\n- one\n\n- two\n";
  assert.deepEqual(
    findRelevantDisabledOptInRules(input, {
      ...OPTIONS,
      ensureBlankLineAfterFrontmatter: true,
      removeBlankLinesBetweenListItems: true,
    }),
    [],
  );
  assert.deepEqual(findRelevantDisabledOptInRules("\nBody\n", OPTIONS), []);

  const disabled = [
    "---\n",
    "tps-linter-disabled-rules:\n",
    "  - frontmatter-blank-line\n",
    "  - list-item-blank-lines\n",
    "---\n",
    "Body\n",
    "\n",
    "- one\n",
    "\n",
    "- two\n",
  ].join("");
  assert.deepEqual(findRelevantDisabledOptInRules(disabled, OPTIONS), []);

  const partiallyDisabled = disabled.replace(
    "  - list-item-blank-lines\n",
    "",
  );
  assert.deepEqual(
    findRelevantDisabledOptInRules(partiallyDisabled, OPTIONS),
    ["list-item-blank-lines"],
  );

  const malformedFrontmatter = [
    "---\n",
    "broken: [\n",
    "---\n",
    "Body\n",
    "\n",
    "- one\n",
    "\n",
    "- two\n",
  ].join("");
  assert.deepEqual(
    findRelevantDisabledOptInRules(malformedFrontmatter, OPTIONS),
    ["list-item-blank-lines"],
  );

  const blocked = `${"a".repeat(2_000_001)}\n`;
  assert.deepEqual(findRelevantDisabledOptInRules(blocked, OPTIONS), []);
});

test("uses short deterministic labels for user feedback", () => {
  assert.equal(describeRelevantOptInRules([]), "");
  assert.equal(
    describeRelevantOptInRules(["frontmatter-blank-line"]),
    "Add blank body line after frontmatter",
  );
  assert.equal(
    describeRelevantOptInRules([
      "frontmatter-blank-line",
      "list-item-blank-lines",
    ]),
    "Add blank body line after frontmatter and Remove blank lines between list items",
  );
});
