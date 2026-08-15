import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";

const LIST_SPACING_OPTIONS: MarkdownCleanupOptions = {
  cleanWhitespaceOnlyLines: false,
  collapseConsecutiveBlankLines: false,
  removeBlankLinesBetweenListItems: true,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: false,
  ensureBlankLineAtBeginning: false,
  headingCapitalizationStyle: "off",
  normalizeHeadingLevels: false,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: false,
  ensureBlankLineAfterFrontmatter: false,
  frontmatterPriorityKeys: [],
};

function assertCompacted(input: string, expected: string, removed: number): void {
  const first = cleanMarkdown(input, LIST_SPACING_OPTIONS);
  assert.equal(first.output, expected, JSON.stringify(input));
  assert.equal(first.changed, true, JSON.stringify(input));
  assert.equal(first.changes.listItemBlankLinesRemoved, removed);
  assert.equal(first.changes.extraBlankLinesRemoved, 0);
  assert.equal(first.safetyBlockedReason, null);

  const second = cleanMarkdown(first.output, LIST_SPACING_OPTIONS);
  assert.equal(second.output, expected);
  assert.equal(second.changed, false);
  assert.equal(second.changes.listItemBlankLinesRemoved, 0);
  assert.equal(second.safetyBlockedReason, null);
}

function assertPreserved(input: string): void {
  const result = cleanMarkdown(input, LIST_SPACING_OPTIONS);
  assert.equal(result.output, input, JSON.stringify(input));
  assert.equal(result.changed, false, JSON.stringify(input));
  assert.equal(result.changes.listItemBlankLinesRemoved, 0);
}

test("removes blank runs between compatible bullet and ordered list items", () => {
  for (const [input, expected, removed] of [
    ["- one\n\n- two\n", "- one\n- two\n", 1],
    ["+ one\n\n\n+ two\n", "+ one\n+ two\n", 2],
    ["* one\n \t\n* two\n", "* one\n* two\n", 1],
    ["1. one\n\n27. two\n", "1. one\n27. two\n", 1],
    ["1) one\n\n2) two\n", "1) one\n2) two\n", 1],
    ["9. nine\n\n10. ten\n", "9. nine\n10. ten\n", 1],
    ["1. one\n2. two\n\n3. three\n", "1. one\n2. two\n3. three\n", 1],
    ["Paragraph\n\n2. two\n\n3. three\n", "Paragraph\n\n2. two\n3. three\n", 1],
  ] as const) {
    assertCompacted(input, expected, removed);
  }
});

test("compacts checklist siblings without conflating them with plain items", () => {
  assertCompacted(
    "- [ ] open\n\n- [x] done\n\n- [!] important\n",
    "- [ ] open\n- [x] done\n- [!] important\n",
    2,
  );
  assertCompacted("- [ ]\n\n- [>]\n", "- [ ]\n- [>]\n", 1);

  for (const input of [
    "- plain\n\n- [ ] task\n",
    "- [x] task\n\n- plain\n",
    "1. plain\n\n2. [ ] task\n",
  ]) {
    assertPreserved(input);
  }
});

test("keeps safe inline Markdown opaque while compacting item boundaries", () => {
  assertCompacted(
    "- [[One]] [scheduled:: 2026-08-11]\n\n- [Two](https://example.test) $x$\n",
    "- [[One]] [scheduled:: 2026-08-11]\n- [Two](https://example.test) $x$\n",
    1,
  );
});

test("keeps complete same-line HTML comments byte-identical while compacting their list boundary", () => {
  for (const [input, expected] of [
    [
      "- [[Food one]] [calories:: 100] <!-- card metadata -->\n\n- [[Food two]] [calories:: 200] <!-- card metadata -->\n",
      "- [[Food one]] [calories:: 100] <!-- card metadata -->\n- [[Food two]] [calories:: 200] <!-- card metadata -->\n",
    ],
    [
      "- one <!-- first --> <!-- second -->\r\n\r\n- two <!-- third -->\r\n",
      "- one <!-- first --> <!-- second -->\r\n- two <!-- third -->\r\n",
    ],
    ["- one <!-- card -->\n\n- two\n", "- one <!-- card -->\n- two\n"],
    ["- one\n\n- two <!-- card -->\n", "- one\n- two <!-- card -->\n"],
    [
      "- [ ] one <!-- card -->\n\n- [x] two <!-- card -->\n",
      "- [ ] one <!-- card -->\n- [x] two <!-- card -->\n",
    ],
    [
      "> - one <!-- card -->\n>\n> - two <!-- card -->\n",
      "> - one <!-- card -->\n> - two <!-- card -->\n",
    ],
    [
      "1. one <!-- card -->\n2. two <!-- card -->\n\n3. three <!-- card -->\n",
      "1. one <!-- card -->\n2. two <!-- card -->\n3. three <!-- card -->\n",
    ],
    [
      "\uFEFF- one <!-- card -->\r\r- two <!-- card -->",
      "\uFEFF- one <!-- card -->\r- two <!-- card -->",
    ],
  ] as const) {
    assertCompacted(input, expected, 1);
  }
});

test("other same-line protected syntax remains ineligible for list-boundary compaction", () => {
  for (const input of [
    "- `one`\n\n- `two`\n",
    "- one %% private %%\n\n- two %% private %%\n",
    "- <% one %>\n\n- <% two %>\n",
    "- <span>one</span>\n\n- <span>two</span>\n",
    "- <?one?>\n\n- <?two?>\n",
    "- <![CDATA[one]]>\n\n- <![CDATA[two]]>\n",
    "- one <!-- safe --> <% dynamic %>\n\n- two <!-- safe -->\n",
    "- one <!-- safe --> `code`\n\n- two <!-- safe -->\n",
    "- one <!-- safe --> %% private %%\n\n- two <!-- safe -->\n",
    "- one <!-- safe --> <span>html</span>\n\n- two <!-- safe -->\n",
  ]) {
    assertPreserved(input);
  }
});

test("multiline protected constructs still block list-boundary compaction", () => {
  for (const input of [
    "- one <!-- open\n\n- two\n-->\n",
    "- one %% open\n\n- two\n%%\n",
    "- `<code\n\n- still code\n`\n",
    "- <span>open\n\n- still inside\n</span>\n",
  ]) {
    assertPreserved(input);
  }
});

test("preserves exact line endings and a byte-zero BOM", () => {
  assertCompacted("\uFEFF- one\r\n\r\n- two\r\n", "\uFEFF- one\r\n- two\r\n", 1);
  assertCompacted("- one\r\r- two\r", "- one\r- two\r", 1);
  assertCompacted("- one\r\n\n- two", "- one\r\n- two", 1);
  assertPreserved("- one\n\n\uFEFF- two\n");
});

test("supports provable same-level nesting and explicit blockquote blanks", () => {
  assertCompacted("  - one\n\n  - two\n", "  - one\n  - two\n", 1);
  assertCompacted("   1. one\n\n   2. two\n", "   1. one\n   2. two\n", 1);
  assertCompacted("> - one\n>\n> - two\n", "> - one\n> - two\n", 1);
  assertCompacted(">> - one\n>> \t\n>> - two\n", ">> - one\n>> - two\n", 1);

  for (const input of [
    "- one\n\n  - child\n",
    "  - child\n\n- parent\n",
    "    - code\n\n    - still code\n",
    "\t- code\n\n\t- still code\n",
    "> - one\n\n> - two\n",
    "> - one\n>\n>> - two\n",
  ]) {
    assertPreserved(input);
  }
});

test("preserves incompatible, empty, ambiguous, and thematic-break boundaries", () => {
  for (const input of [
    "- one\n\n+ two\n",
    "+ one\n\n* two\n",
    "1. one\n\n2) two\n",
    "- one\n\n  continuation\n",
    "  continuation\n\n- two\n",
    "- \n\n- \n",
    "- - -\n\n- - -\n",
    "* * *\n\n* * *\n",
    "\\- one\n\n\\- two\n",
    "1234567890. one\n\n1234567891. two\n",
    "Paragraph - one\n\nParagraph - two\n",
    "The number is\n2. paragraph continuation\n\n3. actual list\n",
    "> The number is\n> 2. paragraph continuation\n>\n> 3. actual list\n",
    "- plain <!-- card -->\n\n- [ ] task <!-- card -->\n",
    "- one <!-- card -->\n\n+ two <!-- card -->\n",
    "The number is\n2. paragraph <!-- card -->\n\n3. list <!-- card -->\n",
    "\u00a0\n\n\u00a0\n",
  ]) {
    assertPreserved(input);
  }
});

test("protected regions and note-local controls keep list spacing byte-identical", () => {
  for (const input of [
    "---\ntags:\n  - one\n\n  - two\n---\n",
    "```md\n- one\n\n- two\n```\n",
    "$$\n- one\n\n- two\n$$\n",
    "<pre>\n- one\n\n- two\n</pre>\n",
    "<!--\n- one\n\n- two\n-->\n",
    "<%*\n- one\n\n- two\n%>\n",
    "<!-- tps-linter-disable -->\n- one\n\n- two\n<!-- tps-linter-enable -->\n",
  ]) {
    assertPreserved(input);
  }

  const locallyDisabled = [
    "---\n",
    "tps-linter-disabled-rules: list-item-blank-lines\n",
    "---\n",
    "- one\n",
    "\n",
    "- two\n",
  ].join("");
  const result = cleanMarkdown(locallyDisabled, LIST_SPACING_OPTIONS);
  assert.equal(result.output, locallyDisabled);
  assert.equal(result.changed, false);
  assert.deepEqual(result.disabledRules, ["list-item-blank-lines"]);
});

test("the list rule is opt-in and composes independently with other blank rules", () => {
  const input = "- one\n\n \t\n\n- two\n";
  const disabled = cleanMarkdown(input, {
    ...LIST_SPACING_OPTIONS,
    removeBlankLinesBetweenListItems: false,
  });
  assert.equal(disabled.output, input);
  assert.equal(disabled.changed, false);

  const listOnly = cleanMarkdown(input, LIST_SPACING_OPTIONS);
  assert.equal(listOnly.output, "- one\n- two\n");
  assert.equal(listOnly.changes.listItemBlankLinesRemoved, 3);
  assert.equal(listOnly.changes.extraBlankLinesRemoved, 0);

  const genericOnly = cleanMarkdown(input, {
    ...LIST_SPACING_OPTIONS,
    collapseConsecutiveBlankLines: true,
    removeBlankLinesBetweenListItems: false,
  });
  assert.equal(genericOnly.output, "- one\n\n- two\n");
  assert.equal(genericOnly.changes.listItemBlankLinesRemoved, 0);
  assert.equal(genericOnly.changes.extraBlankLinesRemoved, 2);

  const both = cleanMarkdown(input, {
    ...LIST_SPACING_OPTIONS,
    cleanWhitespaceOnlyLines: true,
    collapseConsecutiveBlankLines: true,
  });
  assert.equal(both.output, "- one\n- two\n");
  assert.equal(both.changes.whitespaceOnlyLinesCleaned, 0);
  assert.equal(both.changes.listItemBlankLinesRemoved, 3);
  assert.equal(both.changes.extraBlankLinesRemoved, 0);
  assert.equal(
    cleanMarkdown(both.output, {
      ...LIST_SPACING_OPTIONS,
      cleanWhitespaceOnlyLines: true,
      collapseConsecutiveBlankLines: true,
    }).changed,
    false,
  );
});

test("a deterministic representation corpus stays exact and idempotent", () => {
  const markerPairs = [
    ["-", "-"],
    ["+", "+"],
    ["*", "*"],
    ["1.", "27."],
    ["1)", "27)"],
  ] as const;
  const itemBodies = [
    ["one", "two"],
    ["[ ] one", "[x] two"],
  ] as const;
  const gapBodies = [
    [""],
    ["", ""],
    [" "],
    ["\t"],
    [" \t", "", "\t "],
  ] as const;
  const endings = ["\n", "\r\n", "\r"] as const;
  let cases = 0;

  for (const [firstMarker, secondMarker] of markerPairs) {
    for (const [firstBody, secondBody] of itemBodies) {
      for (let indent = 0; indent <= 3; indent += 1) {
        for (let quoteDepth = 0; quoteDepth <= 2; quoteDepth += 1) {
          const quote = ">".repeat(quoteDepth);
          const itemPrefix = `${quote}${quote ? " " : ""}${" ".repeat(indent)}`;
          for (const gap of gapBodies) {
            for (const ending of endings) {
              for (const bom of ["", "\uFEFF"] as const) {
                const first = `${bom}${itemPrefix}${firstMarker} ${firstBody}`;
                const second = `${itemPrefix}${secondMarker} ${secondBody}`;
                const separators = gap
                  .map((body) => `${quote}${body}${ending}`)
                  .join("");
                const input = `${first}${ending}${separators}${second}${ending}`;
                const expected = `${first}${ending}${second}${ending}`;
                assertCompacted(input, expected, gap.length);
                cases += 1;
              }
            }
          }
        }
      }
    }
  }

  assert.equal(cases, 3_600);
});
