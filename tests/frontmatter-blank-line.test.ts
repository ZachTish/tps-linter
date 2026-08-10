import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";

const SPACING_ONLY_OPTIONS: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: false,
  collapseConsecutiveBlankLines: false,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: false,
  ensureBlankLineAtBeginning: false,
  headingCapitalizationStyle: "off",
  normalizeHeadingLevels: false,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: false,
  ensureBlankLineAfterFrontmatter: true,
  frontmatterPriorityKeys: [],
};

function assertBlankLineAdded(input: string, expected: string): void {
  const result = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

  assert.equal(result.output, expected);
  assert.equal(result.changed, true);
  assert.equal(result.changes.frontmatterBlankLineAdded, true);
  assert.equal(result.noteDisabledReason, null);
  assert.equal(result.safetyBlockedReason, null);
}

function assertSpacingUnchanged(input: string): void {
  const result = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.equal(result.changes.frontmatterBlankLineAdded, false);
}

test("adds one blank line after valid frontmatter with every supported line ending", () => {
  for (const [name, ending] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ] as const) {
    const input = [
      "---",
      "title: Test",
      "---",
      "Body",
    ].join(ending);
    const expected = [
      "---",
      "title: Test",
      "---",
      "",
      "Body",
    ].join(ending);

    assertBlankLineAdded(input, expected);
    assert.equal(
      cleanMarkdown(expected, SPACING_ONLY_OPTIONS).changed,
      false,
      name,
    );
  }
});

test("preserves a leading BOM byte-for-byte while adding frontmatter spacing", () => {
  const input = "\uFEFF---\r\ntitle: Test\r\n---\r\nBody\r\n";
  const expected = "\uFEFF---\r\ntitle: Test\r\n---\r\n\r\nBody\r\n";

  assertBlankLineAdded(input, expected);
  assert.equal(expected.startsWith("\uFEFF"), true);
});

test("uses the closing delimiter ending without rewriting mixed existing endings", () => {
  const input = "---\r\ntitle: Test\n---\rBody\n";
  const expected = "---\r\ntitle: Test\n---\r\rBody\n";

  assertBlankLineAdded(input, expected);
});

test("supports both frontmatter closing delimiters", () => {
  for (const closer of ["---", "..."]) {
    assertBlankLineAdded(
      `---\ntitle: Test\n${closer}\nBody\n`,
      `---\ntitle: Test\n${closer}\n\nBody\n`,
    );
  }
});

test("leaves immediate body content untouched when the option is off", () => {
  for (const input of [
    "---\ntitle: Test\n---\nBody\n",
    "---\ntitle: Test\n---",
    "---\ntitle: Test\n---\n",
  ]) {
    const result = cleanMarkdown(input, {
      ...SPACING_ONLY_OPTIONS,
      ensureBlankLineAfterFrontmatter: false,
    });

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.equal(result.changes.frontmatterBlankLineAdded, false);
  }
});

test("accepts mapping, empty, flow-empty, and comment-only frontmatter", () => {
  for (const frontmatterBody of [
    "title: Test\n",
    "",
    "{}\n",
    "# Metadata intentionally empty\n",
  ]) {
    const input = `---\n${frontmatterBody}---\nBody\n`;
    const expected = `---\n${frontmatterBody}---\n\nBody\n`;

    assertBlankLineAdded(input, expected);
  }
});

test("does not add a second separator when the first body line is already blank", () => {
  for (const firstBodySpacing of ["\n", " \t\n", "\n\n", " \n\t\n"]) {
    assertSpacingUnchanged(
      `---\ntitle: Test\n---\n${firstBodySpacing}Body\n`,
    );
  }
});

test("preserves mixed CR and LF separator bytes while cleaning whitespace", () => {
  const input = "---\n---\r \t\nBody";
  const options: MarkdownCleanupOptions = {
    ...SPACING_ONLY_OPTIONS,
    cleanWhitespaceOnlyLines: true,
  };
  const first = cleanMarkdown(input, options);

  assert.equal(first.output, "---\n---\r\r\nBody");
  assert.equal(first.changed, true);
  assert.equal(first.changes.frontmatterBlankLineAdded, true);
  assert.equal(first.changes.whitespaceOnlyLinesCleaned, 1);
  assert.equal(first.safetyBlockedReason, null);

  const second = cleanMarkdown(first.output, options);
  assert.equal(second.output, first.output);
  assert.equal(second.changed, false);
  assert.equal(second.safetyBlockedReason, null);
});

test("creates one usable terminal body slot for frontmatter-only notes", () => {
  for (const [name, ending] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
  ] as const) {
    for (const closer of ["---", "..."]) {
      const withoutEnding = `---${ending}title: Test${ending}${closer}`;
      const withOneEnding = `${withoutEnding}${ending}`;
      const expected = `${withoutEnding}${ending}${ending}`;

      assertBlankLineAdded(withoutEnding, expected);
      assertBlankLineAdded(withOneEnding, expected);
      assertSpacingUnchanged(expected);
      assert.equal(
        cleanMarkdown(expected, SPACING_ONLY_OPTIONS).output,
        expected,
        `${name} ${closer}`,
      );
    }
  }
});

test("preserves a BOM while creating a terminal body slot with either closer", () => {
  for (const closer of ["---", "..."]) {
    const input = `\uFEFF---\r\ntitle: Test\r\n${closer}`;
    const expected = `${input}\r\n\r\n`;

    assertBlankLineAdded(input, expected);
    assert.equal(expected.startsWith("\uFEFF"), true);
    assertSpacingUnchanged(expected);
  }
});

test("terminates a whitespace-only EOF slot without overriding whitespace cleanup", () => {
  const input = "---\ntitle: Test\n---\n \t";
  const preserved = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

  assert.equal(preserved.output, "---\ntitle: Test\n---\n \t\n");
  assert.equal(preserved.changed, true);
  assert.equal(preserved.changes.frontmatterBlankLineAdded, true);
  assert.equal(preserved.changes.whitespaceOnlyLinesCleaned, 0);
  assert.equal(
    cleanMarkdown(preserved.output, SPACING_ONLY_OPTIONS).changed,
    false,
  );

  const cleaned = cleanMarkdown(input, {
    ...SPACING_ONLY_OPTIONS,
    cleanWhitespaceOnlyLines: true,
  });
  assert.equal(cleaned.output, "---\ntitle: Test\n---\n\n");
  assert.equal(cleaned.changed, true);
  assert.equal(cleaned.changes.frontmatterBlankLineAdded, true);
  assert.equal(cleaned.changes.whitespaceOnlyLinesCleaned, 1);
  assert.equal(
    cleanMarkdown(cleaned.output, {
      ...SPACING_ONLY_OPTIONS,
      cleanWhitespaceOnlyLines: true,
    }).changed,
    false,
  );
});

test("preserves a terminal slot when CR and cleaned whitespace LF would merge", () => {
  const input = "---\n---\r \t\n";
  for (const collapseConsecutiveBlankLines of [false, true]) {
    for (const removeTrailingBlankLines of [false, true]) {
      const options: MarkdownCleanupOptions = {
        ...SPACING_ONLY_OPTIONS,
        cleanWhitespaceOnlyLines: true,
        collapseConsecutiveBlankLines,
        removeTrailingBlankLines,
      };
      const expected =
        collapseConsecutiveBlankLines || removeTrailingBlankLines
          ? "---\n---\r\r"
          : "---\n---\r\r\n";
      const first = cleanMarkdown(input, options);

      assert.equal(first.output, expected);
      assert.equal(first.changed, true);
      assert.equal(first.changes.frontmatterBlankLineAdded, true);
      assert.equal(first.changes.whitespaceOnlyLinesCleaned, 1);
      assert.equal(
        first.changes.extraBlankLinesRemoved,
        collapseConsecutiveBlankLines ? 1 : 0,
      );
      assert.equal(
        first.changes.trailingBlankLinesRemoved,
        !collapseConsecutiveBlankLines && removeTrailingBlankLines ? 1 : 0,
      );
      assert.equal(first.safetyBlockedReason, null);

      const second = cleanMarkdown(first.output, options);
      assert.equal(second.output, expected);
      assert.equal(second.changed, false);
      assert.equal(second.safetyBlockedReason, null);
    }
  }
});

test("terminal blank cleanup preserves the requested slot and removes excess", () => {
  const options: MarkdownCleanupOptions = {
    ...SPACING_ONLY_OPTIONS,
    removeTrailingBlankLines: true,
  };
  const withoutSlot = "---\ntitle: Test\n---";
  const expected = "---\ntitle: Test\n---\n\n";
  const added = cleanMarkdown(withoutSlot, options);

  assert.equal(added.output, expected);
  assert.equal(added.changed, true);
  assert.equal(added.changes.frontmatterBlankLineAdded, true);
  assert.equal(added.changes.trailingBlankLinesRemoved, 0);
  assert.equal(cleanMarkdown(expected, options).changed, false);

  const excess = cleanMarkdown(
    "---\ntitle: Test\n---\n\n\n\n",
    options,
  );
  assert.equal(excess.output, expected);
  assert.equal(excess.changed, true);
  assert.equal(excess.changes.frontmatterBlankLineAdded, false);
  assert.equal(excess.changes.trailingBlankLinesRemoved, 2);
  assert.equal(cleanMarkdown(excess.output, options).changed, false);
});

test("fails closed for absent, displaced, unclosed, or unsafe frontmatter", () => {
  for (const input of [
    "Body\n",
    "\n---\ntitle: Test\n---\nBody\n",
    "---\ntitle: Test\nBody\n",
    "---\nvalue: [unterminated\n---\nBody\n",
    "---\nsame: one\nsame: two\n---\nBody\n",
    "---\nStatus: open\nstatus: duplicate\n---\nBody\n",
    "---\n- one\n- two\n---\nBody\n",
    "---\nplain scalar\n---\nBody\n",
    "---\n1: numeric key\n---\nBody\n",
    "---\nvalue: &shared one\nother: *shared\n---\nBody\n",
    "---\nvalue: !custom one\n---\nBody\n",
    "---\nvalue: [unterminated\n---",
    "---\nsame: one\nsame: two\n---\n",
    "---\nvalue: &shared one\nother: *shared\n---",
    "\uFEFF---\r\nvalue: !custom one\r\n...",
  ]) {
    assertSpacingUnchanged(input);
  }
});

test("the note-local frontmatter-blank-line rule ID disables only this rule", () => {
  for (const suffix of ["", "\nBody\n"]) {
    const input = [
      "---\n",
      "title: Test\n",
      "tps-linter-disabled-rules: frontmatter-blank-line\n",
      "---",
      suffix,
    ].join("");
    const result = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.equal(result.changes.frontmatterBlankLineAdded, false);
    assert.deepEqual(result.disabledRules, ["frontmatter-blank-line"]);
    assert.equal(result.noteDisabledReason, null);
    assert.equal(result.safetyBlockedReason, null);
  }
});

test("a note-wide local control also prevents frontmatter spacing", () => {
  for (const suffix of ["", "\nBody\n"]) {
    const input = [
      "---\n",
      "title: Test\n",
      "tps-linter: false\n",
      "---",
      suffix,
    ].join("");
    const result = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.equal(result.changes.frontmatterBlankLineAdded, false);
    assert.match(result.noteDisabledReason ?? "", /tps-linter: false/);
  }
});

test("composes atomically with frontmatter sorting, blank collapse, and final newline", () => {
  const input = [
    "---\n",
    "zeta: last\n",
    "status: open\n",
    "alpha: first\n",
    "---\n",
    "Body\n",
    "\n",
    "\n",
    "Tail",
  ].join("");
  const options: MarkdownCleanupOptions = {
    ...SPACING_ONLY_OPTIONS,
    collapseConsecutiveBlankLines: true,
    ensureFinalNewline: true,
    sortFrontmatterFields: true,
    frontmatterPriorityKeys: ["status"],
  };
  const expected = [
    "---\n",
    "status: open\n",
    "alpha: first\n",
    "zeta: last\n",
    "---\n",
    "\n",
    "Body\n",
    "\n",
    "Tail\n",
  ].join("");
  const first = cleanMarkdown(input, options);

  assert.equal(first.output, expected);
  assert.equal(first.changed, true);
  assert.equal(first.changes.frontmatterBlankLineAdded, true);
  assert.equal(first.changes.frontmatterFieldsReordered, 3);
  assert.equal(first.changes.extraBlankLinesRemoved, 1);
  assert.equal(first.changes.finalNewlineAdded, true);

  const second = cleanMarkdown(first.output, options);
  assert.equal(second.output, expected);
  assert.equal(second.changed, false);
  assert.equal(second.changes.frontmatterBlankLineAdded, false);
});

test("frontmatter spacing is idempotent independently of other rules", () => {
  const input = "---\ntitle: Test\n---\nBody";
  const first = cleanMarkdown(input, SPACING_ONLY_OPTIONS);
  const second = cleanMarkdown(first.output, SPACING_ONLY_OPTIONS);

  assert.equal(first.output, "---\ntitle: Test\n---\n\nBody");
  assert.equal(first.changed, true);
  assert.equal(first.changes.frontmatterBlankLineAdded, true);
  assert.equal(second.output, first.output);
  assert.equal(second.changed, false);
  assert.equal(second.changes.frontmatterBlankLineAdded, false);
});

test("adds spacing without rewriting a protected first body construct", () => {
  const protectedBodies = [
    "```md\n# literal heading\n```\n",
    "%%\n# literal heading\n%%\n",
    "<!--\n# literal heading\n-->\n",
    "<pre>\n# literal heading\n</pre>\n",
    "<%*\nconst value = \"# literal heading\";\n%>\n",
    "$$\n# literal math content\n$$\n",
    "    # indented code\n",
    "<section># literal HTML content</section>\n",
    "<!-- tps-linter-disable -->\n# untouched heading\n<!-- tps-linter-enable -->\n",
  ];

  for (const body of protectedBodies) {
    const input = `---\ntitle: Test\n---\n${body}`;
    const expected = `---\ntitle: Test\n---\n\n${body}`;
    const result = cleanMarkdown(input, SPACING_ONLY_OPTIONS);

    assert.equal(result.output, expected, body);
    assert.equal(result.changed, true, body);
    assert.equal(result.changes.frontmatterBlankLineAdded, true, body);
    assert.equal(result.safetyBlockedReason, null, body);
  }
});
