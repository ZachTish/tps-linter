import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  inspectFrontmatterEnvelopePreservation,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";

const ALL_CONTENT_RULES: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
  removeBlankLinesBetweenListItems: true,
  trimNonblankTrailingWhitespace: true,
  removeTrailingBlankLines: true,
  ensureFinalNewline: true,
  ensureBlankLineAtBeginning: true,
  headingCapitalizationStyle: "title-case",
  normalizeHeadingLevels: true,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: true,
  ensureBlankLineAfterFrontmatter: true,
  frontmatterPriorityKeys: ["status", "tags"],
};

test("rejects any proposed cleanup that removes or changes a closed frontmatter delimiter", () => {
  for (const [input, output] of [
    ["---\ntitle: Test\n---\nBody\n", "---\ntitle: Test\nBody\n"],
    ["---\ntitle: Test\n...\nBody\n", "---\ntitle: Test\n---\nBody\n"],
    ["\uFEFF---\r\ntitle: Test\r\n---\r\n", "title: Test\r\n---\r\n"],
    ["--- \ntitle: Test\n---\t\n", "---\ntitle: Test\n---\t\n"],
    [
      "---\ntitle: Test\n---\nBody\n---\nTail\n",
      "---\ntitle: Test\nBody\n---\nTail\n",
    ],
  ] as const) {
    assert.equal(
      inspectFrontmatterEnvelopePreservation(input, output),
      "cleanup would alter or remove a frontmatter delimiter",
    );
  }
});

test("allows only the frontmatter-aware stage to reorder a verified body", () => {
  const input = "---\nzeta: last\nstatus: open\n---\nBody\n";
  const sorted = "---\nstatus: open\nzeta: last\n---\nBody\n";

  assert.equal(
    inspectFrontmatterEnvelopePreservation(input, sorted, true),
    null,
  );
  assert.equal(
    inspectFrontmatterEnvelopePreservation(input, sorted),
    "cleanup would alter or remove a frontmatter delimiter",
  );
});

test("allows body cleanup and frontmatter spacing while preserving the exact delimiter lines", () => {
  for (const input of [
    "---\nzeta: last\nstatus: open\n---\n## heading\n\n\nBody   ",
    "\uFEFF---\r\ntags: [test]\r\nstatus: open\r\n...\r\n- one\r\n\r\n- two\r\n",
    "--- \rstatus: open\r---\t\rBody\r",
  ]) {
    const result = cleanMarkdown(input, ALL_CONTENT_RULES);

    assert.equal(result.safetyBlockedReason, null, input);
    assert.equal(
      inspectFrontmatterEnvelopePreservation(input, result.output, true),
      null,
      input,
    );
    assert.equal(
      cleanMarkdown(result.output, ALL_CONTENT_RULES).output,
      result.output,
      input,
    );
  }
});

test("does not invent a delimiter contract for plain or already-unclosed notes", () => {
  assert.equal(
    inspectFrontmatterEnvelopePreservation("Body\n", "Body cleaned\n"),
    null,
  );
  assert.equal(
    inspectFrontmatterEnvelopePreservation(
      "---\ntitle: Incomplete\n",
      "---\ntitle: Incomplete\n",
    ),
    null,
  );
});
