import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  MARKDOWN_SAFETY_LIMITS,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";

const LEADING_ONLY_OPTIONS: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: false,
  collapseConsecutiveBlankLines: false,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: false,
  ensureBlankLineAtBeginning: true,
  headingCapitalizationStyle: "off",
  normalizeHeadingLevels: false,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: false,
  ensureBlankLineAfterFrontmatter: false,
  frontmatterPriorityKeys: [],
};

function assertLeadingBlankLineAdded(input: string, expected: string): void {
  const result = cleanMarkdown(input, LEADING_ONLY_OPTIONS);

  assert.equal(result.output, expected);
  assert.equal(result.changed, true);
  assert.equal(result.changes.leadingBlankLineAdded, true);
  assert.equal(result.changes.frontmatterBlankLineAdded, false);
  assert.equal(result.noteDisabledReason, null);
  assert.equal(result.safetyBlockedReason, null);

  const repeated = cleanMarkdown(result.output, LEADING_ONLY_OPTIONS);
  assert.equal(repeated.output, expected);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.changes.leadingBlankLineAdded, false);
}

function assertLeadingSpacingUnchanged(input: string): void {
  const result = cleanMarkdown(input, LEADING_ONLY_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.equal(result.changes.leadingBlankLineAdded, false);
}

test("adds one leading blank line using LF, CRLF, CR, or the LF fallback", () => {
  for (const ending of ["\n", "\r\n", "\r"] as const) {
    assertLeadingBlankLineAdded(
      `Body${ending}Tail${ending}`,
      `${ending}Body${ending}Tail${ending}`,
    );
  }

  assertLeadingBlankLineAdded("Body", "\nBody");
});

test("uses the first existing ending and preserves mixed line endings byte-for-byte", () => {
  const input = "Body\r\nSecond\nThird\rFourth";
  assertLeadingBlankLineAdded(input, `\r\n${input}`);
});

test("keeps a leading BOM at byte zero", () => {
  for (const [input, expected] of [
    ["\uFEFFBody\r\nTail", "\uFEFF\r\nBody\r\nTail"],
    ["\uFEFFBody", "\uFEFF\nBody"],
  ] as const) {
    assertLeadingBlankLineAdded(input, expected);
    assert.equal(expected.startsWith("\uFEFF"), true);
    assert.equal(expected.match(/\uFEFF/g)?.length, 1);
  }
});

test("leaves content untouched when the option is off", () => {
  const input = "Body\n";
  const result = cleanMarkdown(input, {
    ...LEADING_ONLY_OPTIONS,
    ensureBlankLineAtBeginning: false,
  });

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.equal(result.changes.leadingBlankLineAdded, false);
});

test("does not add to existing blank or whitespace-only first lines", () => {
  for (const input of [
    "\nBody\n",
    "\r\nBody\r\n",
    "\rBody\r",
    " \t\nBody\n",
    "\n\nBody\n",
    "\uFEFF\nBody\n",
    "\uFEFF \t\r\nBody\r\n",
  ]) {
    assertLeadingSpacingUnchanged(input);
  }
});

test("does not manufacture content in empty or blank-only notes", () => {
  for (const input of ["", "\uFEFF", " ", "\t", " \t", "\n", "\r\n", "\uFEFF \t"]) {
    assertLeadingSpacingUnchanged(input);
  }
});

test("never displaces a first-line frontmatter opener", () => {
  for (const input of [
    "---\ntitle: Safe\n---\nBody\n",
    "---\n---\nBody\n",
    "---\ntitle: [malformed\n---\nBody\n",
    "---\ntitle: !unsafe value\n---\nBody\n",
    "---\ntitle: one\ntitle: two\n---\nBody\n",
    "---\ntitle: Unclosed\nBody\n",
    "--- \t\r\ntitle: Spaced\r\n---\r\nBody\r\n",
    "\uFEFF---\ntitle: BOM\n---\nBody\n",
  ]) {
    assertLeadingSpacingUnchanged(input);
  }
});

test("the beginning and after-frontmatter options remain independent", () => {
  const options: MarkdownCleanupOptions = {
    ...LEADING_ONLY_OPTIONS,
    ensureBlankLineAfterFrontmatter: true,
  };

  const plain = cleanMarkdown("Body\n", options);
  assert.equal(plain.output, "\nBody\n");
  assert.equal(plain.changes.leadingBlankLineAdded, true);
  assert.equal(plain.changes.frontmatterBlankLineAdded, false);

  const frontmatter = cleanMarkdown(
    "---\ntitle: Test\n---\nBody\n",
    options,
  );
  assert.equal(frontmatter.output, "---\ntitle: Test\n---\n\nBody\n");
  assert.equal(frontmatter.changes.leadingBlankLineAdded, false);
  assert.equal(frontmatter.changes.frontmatterBlankLineAdded, true);
});

test("prefixes protected first constructs without changing their bytes", () => {
  for (const input of [
    "```ts\nconst value = 1;  \n```\n",
    "<!-- protected  -->\n",
    "<%* protected  %>\n",
    "$$\nx  +  y\n$$\n",
    "<pre>protected  \n</pre>\n",
    "    indented code  \n",
    "<!-- tps-linter-disable -->\nProtected  \n<!-- tps-linter-enable -->\n",
  ]) {
    assertLeadingBlankLineAdded(input, `\n${input}`);
  }
});

test("composes with heading cleanup and final-newline insertion", () => {
  const result = cleanMarkdown("### lower", {
    ...LEADING_ONLY_OPTIONS,
    ensureFinalNewline: true,
    headingCapitalizationStyle: "first-letter",
    normalizeHeadingLevels: true,
  });

  assert.equal(result.output, "\n# Lower\n");
  assert.equal(result.changes.leadingBlankLineAdded, true);
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 1);
  assert.equal(result.changes.finalNewlineAdded, true);
  assert.equal(
    cleanMarkdown(result.output, {
      ...LEADING_ONLY_OPTIONS,
      ensureFinalNewline: true,
      headingCapitalizationStyle: "first-letter",
      normalizeHeadingLevels: true,
    }).changed,
    false,
  );
});

test("blank cleanup recognizes a BOM-only first line without removing the BOM", () => {
  const result = cleanMarkdown("\uFEFF \t\n\n\nBody", {
    ...LEADING_ONLY_OPTIONS,
    cleanWhitespaceOnlyLines: true,
    collapseConsecutiveBlankLines: true,
  });

  assert.equal(result.output, "\uFEFF\nBody");
  assert.equal(result.changes.leadingBlankLineAdded, false);
  assert.equal(result.changes.whitespaceOnlyLinesCleaned, 1);
  assert.equal(result.changes.extraBlankLinesRemoved, 2);
  assert.equal(result.output.startsWith("\uFEFF"), true);
});

test("post-clean safety verification rejects character or line limit growth", () => {
  const atCharacterLimit = `${"x".repeat(999)}\n`.repeat(
    MARKDOWN_SAFETY_LIMITS.maxCharacters / 1_000,
  );
  const characterResult = cleanMarkdown(
    atCharacterLimit,
    LEADING_ONLY_OPTIONS,
  );
  assert.equal(characterResult.output, atCharacterLimit);
  assert.equal(characterResult.changed, false);
  assert.match(characterResult.safetyBlockedReason ?? "", /safety limit/);

  const atLineLimit = `${"Body\n".repeat(MARKDOWN_SAFETY_LIMITS.maxLines - 1)}Body`;
  const lineResult = cleanMarkdown(atLineLimit, LEADING_ONLY_OPTIONS);
  assert.equal(lineResult.output, atLineLimit);
  assert.equal(lineResult.changed, false);
  assert.match(lineResult.safetyBlockedReason ?? "", /safety limit/);
});
