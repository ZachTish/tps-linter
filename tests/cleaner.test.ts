import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  decideFilenameRename,
  inspectPathExclusion,
  MARKDOWN_SAFETY_LIMITS,
  planMarkdownFilename,
  type FilenamePlan,
} from "../src/cleaner.ts";

const DEFAULT_FILENAME_OPTIONS = {
  unsafeCharacterStyle: "space" as const,
  removeObsidianLinkCharacters: false,
};

const DEFAULT_MARKDOWN_OPTIONS = {
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: true,
  headingCapitalizationStyle: "first-letter" as const,
  normalizeHeadingLevels: true,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1 as const,
  sortFrontmatterFields: true,
  ensureBlankLineAfterFrontmatter: false,
  frontmatterPriorityKeys: [
    "status",
    "priority",
    "tags",
    "recurrence",
    "scheduled",
    "folderPath",
  ],
};

test("filename planning cleans only narrow cross-platform hazards", () => {
  const plan = planMarkdownFilename(
    "Inbox/  2026-07-17   Same:Event...  .md",
    DEFAULT_FILENAME_OPTIONS,
  );

  assert.equal(plan.valid, true);
  assert.equal(plan.changed, true);
  assert.equal(plan.targetPath, "Inbox/2026-07-17 Same Event.md");
  assert.deepEqual(plan.changes, [
    "unsafe characters",
    "filename whitespace",
    "trailing spaces or periods",
  ]);
});

test("filename planning preserves established TPS naming patterns", () => {
  for (const basename of [
    "20260720",
    "2026-07-17 Same Event",
    "02 Review",
    "GCM 1.2.1 Statusless QA",
    "B & C",
    "Unicode café 🧭",
    "under_score-and (punctuation)",
    "A deliberately long TPS widget title that remains deliberately long",
    "queue-019f9546-2711-7a40-ae5c-ae5a0eaa5941",
  ]) {
    const plan = planMarkdownFilename(
      `Inbox/${basename}.md`,
      DEFAULT_FILENAME_OPTIONS,
    );
    assert.equal(plan.valid, true, basename);
    assert.equal(plan.changed, false, basename);
    assert.equal(plan.targetBasename, basename);
  }
});

test("unsafe filename replacement styles and optional link controls are explicit", () => {
  assert.equal(
    planMarkdownFilename("Inbox/A:B.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "dash",
    }).targetPath,
    "Inbox/A-B.md",
  );
  assert.equal(
    planMarkdownFilename("Inbox/A:B.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "remove",
    }).targetPath,
    "Inbox/AB.md",
  );
  assert.equal(
    planMarkdownFilename("Inbox/A\u0085B\u2028C.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "dash",
    }).targetPath,
    "Inbox/A-B C.md",
  );
  const backslash = planMarkdownFilename(
    "Inbox/A\\B.md",
    DEFAULT_FILENAME_OPTIONS,
  );
  assert.equal(backslash.sourcePath, "Inbox/A\\B.md");
  assert.equal(backslash.targetPath, "Inbox/A B.md");
  assert.equal(
    planMarkdownFilename("Inbox/[A] #B^1.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      removeObsidianLinkCharacters: true,
    }).targetPath,
    "Inbox/A B1.md",
  );
  assert.equal(
    planMarkdownFilename(
      "Inbox/[A] #B^1.md",
      DEFAULT_FILENAME_OPTIONS,
    ).changed,
    false,
  );
});

test("invalid filename plans fail closed", () => {
  for (const path of [
    "Inbox/....md",
    "Inbox/CON.md",
    "Inbox/CON.txt.md",
    "Inbox/prn.md",
    "Inbox/LPT9.md",
    "Inbox/COM¹.md",
    "Inbox/LPT².txt.md",
    "Inbox/com³.log.md",
    "Inbox/Not Markdown.base",
  ]) {
    const plan = planMarkdownFilename(path, {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "remove",
    });
    assert.equal(plan.valid, false, path);
    assert.ok(plan.blockReason, path);
  }
});

test("rename decisions block GCM ownership, collisions, and case-only changes", () => {
  const eligible = planMarkdownFilename(
    "Inbox/Needs   Space.md",
    DEFAULT_FILENAME_OPTIONS,
  );
  assert.deepEqual(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath],
      "gcm-inactive",
      true,
    ),
    {
      allowed: true,
      reason: "eligible",
      detail: null,
    },
  );
  assert.equal(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath],
      "gcm-active",
      true,
    ).reason,
    "gcm-auto-rename-active",
  );
  assert.equal(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath],
      "unavailable",
      true,
    ).reason,
    "gcm-ownership-unavailable",
  );
  assert.equal(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath],
      "gcm-inactive",
      false,
    ).reason,
    "filename-cleaning-disabled",
  );
  assert.deepEqual(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath, "inbox/needs space.md"],
      "gcm-absent",
      true,
    ),
    {
      allowed: false,
      reason: "target-collision",
      detail: "inbox/needs space.md",
    },
  );
  assert.deepEqual(
    decideFilenameRename(
      {
        ...eligible,
        targetPath: "Inbox/Café.md",
        targetBasename: "Café",
      },
      [eligible.sourcePath, "Inbox/Cafe\u0301.md"],
      "gcm-absent",
      true,
    ),
    {
      allowed: false,
      reason: "target-collision",
      detail: "Inbox/Cafe\u0301.md",
    },
  );

  const caseOnlyPlan: FilenamePlan = {
    sourcePath: "Inbox/Name.md",
    targetPath: "Inbox/name.md",
    sourceBasename: "Name",
    targetBasename: "name",
    changed: true,
    valid: true,
    changes: ["case"],
    blockReason: null,
  };
  assert.equal(
    decideFilenameRename(
      caseOnlyPlan,
      [caseOnlyPlan.sourcePath],
      "gcm-inactive",
      true,
    ).reason,
    "case-only-rename",
  );
});

test("filename planning is idempotent", () => {
  const first = planMarkdownFilename(
    "Inbox/  A:B   C... .md",
    DEFAULT_FILENAME_OPTIONS,
  );
  const second = planMarkdownFilename(
    first.targetPath,
    DEFAULT_FILENAME_OPTIONS,
  );
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.targetPath, first.targetPath);
});

test("hard exclusions and editable exclusions use path boundaries", () => {
  for (const path of [
    ".obsidian/plugins/example/README.md",
    ".trash/Old.md",
    ".tps/State.md",
    ".plugin-dev-cache.nosync/cache.md",
    "Plugin Development/TPS-Linter (Dev)/README.md",
    "_assets/TPS AI Queue/job.md",
    "AGENTS.md",
    "Inbox/__type__.md",
    "Inbox/__root__.md",
    "Inbox/file.base",
  ]) {
    assert.equal(inspectPathExclusion(path, []).excluded, true, path);
  }

  assert.equal(
    inspectPathExclusion("Templates/Note.md", ["Templates"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Templates Extra/Note.md", ["Templates"]).excluded,
    false,
  );
  assert.equal(
    inspectPathExclusion("Projects/2026/Note.md", ["Projects/*"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Projects/2026/Deep/Note.md", ["Projects/*"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Inbox/Note.md", ["Templates", "_archive"]).excluded,
    false,
  );
});

test("Markdown cleanup preserves BOM and every existing line separator", () => {
  const input = "\uFEFFTitle\r\n   \nBody\r\t\r\nTail";
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, "\uFEFFTitle\r\n\nBody\r\r\nTail\r\n");
  assert.deepEqual(result.changes, {
    whitespaceOnlyLinesCleaned: 2,
    extraBlankLinesRemoved: 0,
    nonblankTrailingWhitespaceLinesCleaned: 0,
    trailingBlankLinesRemoved: 0,
    headingsCapitalized: 0,
    headingLevelsAdjusted: 0,
    frontmatterFieldsReordered: 0,
    frontmatterBlankLineAdded: false,
    frontmatterSortSkippedReason: null,
    finalNewlineAdded: true,
  });
  assert.equal(result.changed, true);
});

test("a leading BOM remains byte-identical while the first heading is cleaned", () => {
  const input = "\uFEFF### parent\r\n##### child\r\n";
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });

  assert.equal(result.output, "\uFEFF##### Parent\r\n###### Child\r\n");
  assert.equal(result.output.startsWith("\uFEFF"), true);
  assert.equal(result.changes.headingLevelsAdjusted, 2);
  assert.equal(result.changes.headingsCapitalized, 2);
});

test("Markdown cleanup leaves protected regions byte-identical", () => {
  const input = [
    "---\r\n",
    "title: Test   \r\n",
    "   \r\n",
    "---\r\n",
    "```ts\r\n",
    "   \r\n",
    "const x = 1;   \r\n",
    "```\r\n",
    "<pre>\r\n",
    "   \r\n",
    "</pre>\r\n",
    "<%*\r\n",
    "   \r\n",
    "%>\r\n",
    "Body\r\n",
  ].join("");

  assert.equal(cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output, input);
});

test("sequential protected openers on one line remain byte-identical", () => {
  for (const input of [
    "<pre>x</pre><pre>\n   \nvalue   \n</pre>\n",
    "<% x %><%*\n   \nvalue   \n%>\n",
    "<pre>x</pre><%*\n   \nvalue   \n%>\n",
  ]) {
    assert.equal(
      cleanMarkdown(input, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      input,
      input,
    );
  }
});

test("cross-family protected transitions remain protected in every direction", () => {
  const constructs = [
    { name: "Obsidian comment", open: "%%", close: "%%" },
    { name: "HTML comment", open: "<!--", close: "-->" },
    { name: "HTML element", open: "<section>", close: "</section>" },
    { name: "Templater", open: "<%*", close: "%>" },
  ];

  for (const from of constructs) {
    for (const to of constructs) {
      if (from === to) continue;
      const input = [
        `${from.open}\n`,
        `${from.close} ${to.open}\n`,
        "#### hidden heading\n",
        "\n",
        "\n",
        `${to.close}\n`,
        "#### visible heading\n",
      ].join("");
      const expected = input.replace(
        "#### visible heading\n",
        "# Visible heading\n",
      );
      const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

      assert.equal(result.output, expected, `${from.name} → ${to.name}`);
      assert.equal(
        result.changes.extraBlankLinesRemoved,
        0,
        `${from.name} → ${to.name}`,
      );
      assert.equal(
        result.changes.headingsCapitalized,
        1,
        `${from.name} → ${to.name}`,
      );
      assert.equal(
        result.changes.headingLevelsAdjusted,
        1,
        `${from.name} → ${to.name}`,
      );
    }
  }
});

test("protected opener ordering follows source order on the same line", () => {
  const htmlBeforeComment = [
    "<section><!--\n",
    "comment\n",
    "-->\n",
    "#### still inside section\n",
    "</section>\n",
    "#### visible heading\n",
  ].join("");
  assert.equal(
    cleanMarkdown(htmlBeforeComment, DEFAULT_MARKDOWN_OPTIONS).output,
    htmlBeforeComment.replace(
      "#### visible heading\n",
      "# Visible heading\n",
    ),
  );

  for (const input of [
    "<!-- <section>\ncomment\n-->\n#### visible heading\n",
    '<%* const markup = "<section>";\n%>\n#### visible heading\n',
    "%% <section>\ncomment\n%%\n#### visible heading\n",
  ]) {
    assert.equal(
      cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output,
      input.replace("#### visible heading\n", "# Visible heading\n"),
      input,
    );
  }
});

test("generic paired HTML nests safely while void and self-closing tags do not leak", () => {
  const nested = [
    "<details>\n",
    "<details>\n",
    "#### nested hidden heading\n",
    "</details>\n",
    "#### outer hidden heading\n",
    "</details>\n",
    "<br>\n",
    '<img src="fixture.png">\n',
    "<section />\n",
    "#### visible heading\n",
  ].join("");
  assert.equal(
    cleanMarkdown(nested, DEFAULT_MARKDOWN_OPTIONS).output,
    nested.replace("#### visible heading\n", "# Visible heading\n"),
  );

  const unclosed = "<section\n  class=\"fixture\">\n#### hidden heading";
  assert.equal(
    cleanMarkdown(unclosed, DEFAULT_MARKDOWN_OPTIONS).output,
    unclosed,
  );
});

test("Markdown autolinks never open an HTML protection region", () => {
  const input = [
    "Before <https://example.com>\n",
    "\n",
    "\n",
    "## lower heading\n",
    "Contact <user@example.com>\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "Before <https://example.com>\n",
      "\n",
      "# Lower heading\n",
      "Contact <user@example.com>\n",
    ].join(""),
  );
});

test("links, wiki links, inline fields, and inline math mask tag-like text", () => {
  for (const firstLine of [
    "See [note](<My Note.md>).",
    "See ![image](<section>).",
    "See [note](target \"<section>\").",
    "See [note](target '<section>').",
    "[note]: <My Note.md>",
    "See [[Note|<section>]].",
    "Value [kind:: <section>].",
    "Math $x<y>$ is ordinary prose.",
    "Math $$<section>$$ is ordinary prose.",
  ]) {
    const input = [
      `${firstLine}\n`,
      "\n",
      "\n",
      "## lower heading\n",
    ].join("");
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(
      result.output,
      [`${firstLine}\n`, "\n", "# Lower heading\n"].join(""),
      firstLine,
    );
  }
});

test("image labels and full reference labels mask tag-like text", () => {
  for (const prefix of [
    "![<section>](page)\n",
    "[<section>]: /url\n",
    "[text][reference]\n",
    "[image]: /url\n![alt][image]\n",
  ]) {
    const input = `${prefix}\n\n## lower heading\n`;
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(
      result.output,
      `${prefix}\n# Lower heading\n`,
      prefix,
    );
    assert.equal(result.safetyBlockedReason, null, prefix);
  }
});

test("ambiguous shortcut references with protected syntax fail closed", () => {
  for (const input of [
    "[<section>]\n#### hidden heading   \n\n\n</section>\n## visible\n",
    "![</section>]\n#### hidden heading   \n",
    "[text][<section>]\n#### hidden heading   \n",
    "[<section>][]\n#### hidden heading   \n",
  ]) {
    const result = cleanMarkdown(input, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    });

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.match(result.safetyBlockedReason ?? "", /ambiguous protected syntax/);
  }
});

test("ambiguous link syntax fails closed instead of hiding protected openers", () => {
  for (const input of [
    "[x](dest %% )\n#### hidden comment heading\n%%\n\n\n## visible heading\n",
    "[x](<dest> %% )\n#### hidden comment heading\n%%\n\n\n## visible heading\n",
    "[x](dest \"title\" %% )\n#### hidden comment heading\n%%\n\n\n## visible heading\n",
    "[note]: destination %%\n#### hidden comment heading\n%%\n\n\n## visible heading\n",
    "[note]: <destination> \"title\" %%\n#### hidden comment heading\n%%\n\n\n## visible heading\n",
  ]) {
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.match(result.safetyBlockedReason ?? "", /ambiguous protected syntax/);
  }
});

test("multiline links and HTML start tags fail closed for manual review", () => {
  for (const input of [
    "[link]( /uri\n \"<section>\" )\n\n\n## lower heading\n",
    "[link]:\n  <section>\n\n\n## lower heading\n",
    "![alt\n</section>](image.png)\n#### hidden heading\n",
    "[foo\n</section>]: /url\n#### hidden heading\n",
    "[ref]: /url\n \"</section>\"\n#### hidden heading\n",
    "[ref]: /url \"title\n</section>\nmore\"\n#### hidden heading\n",
    "[ref]: /url 'title\n</section>\nmore'\n#### hidden heading\n",
    "[ref]: /url (title\n</section>\nmore)\n#### hidden heading\n",
    "<section\n title=\"</section>\">\n## inside\n</section>\n",
    "<section\n title=\"<aside>\">\n</section>\n\n\n## lower heading\n",
  ]) {
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.match(
      result.safetyBlockedReason ?? "",
      /multiline|unclosed/i,
    );
  }
});

test("reference-title continuation state expires after the next physical line", () => {
  const input = [
    "[foo]: /url\n",
    "```md\n",
    "code\n",
    "```\n",
    '"ordinary quote"\n',
    "\n",
    "\n",
    "## lower heading\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    input.replace("\n\n\n## lower heading", "\n\n# Lower heading"),
  );
  assert.equal(result.safetyBlockedReason, null);
});

test("raw HTML blocks ignore tag-looking content until their raw close tag", () => {
  for (const tag of ["pre", "script", "style", "textarea"]) {
    const input = [
      `<${tag}>\n`,
      'const markup = "<div>";\n',
      "#### literal raw heading\n",
      "\n",
      "\n",
      `</${tag.toUpperCase()}>\n`,
      "\n",
      "\n",
      "## visible heading\n",
    ].join("");
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);
    const expected = input
      .replace(`</${tag.toUpperCase()}>\n\n\n`, `</${tag.toUpperCase()}>\n\n`)
      .replace("## visible heading", "# Visible heading");

    assert.equal(result.output, expected, tag);
    assert.ok(result.output.includes("#### literal raw heading"), tag);
    assert.ok(result.output.includes("\n\n\n</"), tag);
  }
});

test("inline code and escaped markup never leak protected state", () => {
  for (const firstLine of [
    "Use `<section>` as an example.",
    "Use `<!--` and `%%` and `<%` as examples.",
    "Escaped \\<section> example.",
    "Escaped \\<!-- example.",
  ]) {
    const input = [
      `${firstLine}\n`,
      "\n",
      "\n",
      "## lower heading\n",
    ].join("");
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(
      result.output,
      [`${firstLine}\n`, "\n", "# Lower heading\n"].join(""),
      firstLine,
    );
  }
});

test("multiline code spans mask tag-like content until their exact closer", () => {
  const input = [
    "Use `<section>\n",
    "still code` safely.\n",
    "\n",
    "\n",
    "## lower heading\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "Use `<section>\n",
      "still code` safely.\n",
      "\n",
      "# Lower heading\n",
    ].join(""),
  );
});

test("multiline code spans preserve headings and blank lines byte-for-byte", () => {
  for (const [ticks, ending] of [
    ["`", "\n"],
    ["``", "\n"],
    ["`", "\r\n"],
    ["``", "\r"],
  ]) {
    const input = [
      `${ticks}code span starts${ending}`,
      `#### literal code heading${ending}`,
      ending,
      ending,
      `code span ends${ticks}${ending}`,
    ].join("");
    const result = cleanMarkdown(input, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
      removeTrailingBlankLines: true,
      pushHeadingHierarchyToH6: true,
    });

    assert.equal(result.output, input, `${ticks.length}/${JSON.stringify(ending)}`);
    assert.equal(result.changed, false);
  }
});

test("visible headings with paired inline HTML still define hierarchy", () => {
  const input = [
    "### <span>inline parent</span>\n",
    "##### child heading\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "# <span>inline parent</span>\n",
      "## Child heading\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 2);
  assert.equal(
    cleanMarkdown(result.output, DEFAULT_MARKDOWN_OPTIONS).changed,
    false,
  );
});

test("tilde and unclosed fences remain protected instead of guessed at", () => {
  const tilde = "~~~text\n   \nvalue   \n~~~\n";
  const unclosed = "Before\n```\n   \nvalue   ";
  assert.equal(cleanMarkdown(tilde, DEFAULT_MARKDOWN_OPTIONS).output, tilde);
  assert.equal(
    cleanMarkdown(unclosed, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    }).output,
    unclosed,
  );
});

test("fenced code after blockquotes and direct list markers remains protected", () => {
  const fixtures = [
    [
      "- ```md\n",
      "  #### hidden heading\n",
      "\n",
      "\n",
      "  ```\n",
      "#### visible heading\n",
    ].join(""),
    [
      "10. ```md\n",
      "    #### hidden heading\n",
      "\n",
      "\n",
      "    ```\n",
      "#### visible heading\n",
    ].join(""),
    [
      "> ```md\n",
      "> #### hidden heading\n",
      ">\n",
      ">\n",
      "> ```\n",
      "#### visible heading\n",
    ].join(""),
    [
      "> - ```md\n",
      ">   #### hidden heading\n",
      ">\n",
      ">\n",
      ">   ```\n",
      "#### visible heading\n",
    ].join(""),
  ];

  for (const input of fixtures) {
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);
    assert.equal(
      result.output,
      input.replace("#### visible heading\n", "# Visible heading\n"),
      input,
    );
    assert.equal(result.changes.extraBlankLinesRemoved, 0, input);
    assert.equal(result.changes.headingsCapitalized, 1, input);
    assert.equal(result.changes.headingLevelsAdjusted, 1, input);
  }
});

test("fences support ordered list and blockquote container interleaving", () => {
  const fixtures = [
    [
      "- > ```md\n",
      "  > marker ``` inside code\n",
      "  > value   \n",
      "  >\n",
      "  >\n",
      "  > ```\n",
      "## visible heading\n",
    ].join(""),
    [
      "> - > ~~~md\n",
      ">   > #### hidden heading   \n",
      ">   >\n",
      ">   >\n",
      ">   > ~~~\n",
      "## visible heading\n",
    ].join(""),
  ];

  for (const input of fixtures) {
    const result = cleanMarkdown(input, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    });

    assert.equal(
      result.output,
      input.replace("## visible heading\n", "# Visible heading\n"),
      input,
    );
    assert.equal(result.changes.extraBlankLinesRemoved, 0, input);
  }
});

test("list container indentation uses CommonMark columns and padding bounds", () => {
  const tabbed = [
    "-\t~~~md\n",
    "\tvalue   \n",
    "  ~~~\n",
    "#### hidden heading   \n",
    "\n",
    "\n",
  ].join("");
  assert.equal(
    cleanMarkdown(tabbed, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    }).output,
    tabbed,
  );

  const excessivePadding =
    "-     > $$\n#### visible heading\n";
  assert.equal(
    cleanMarkdown(excessivePadding, DEFAULT_MARKDOWN_OPTIONS).output,
    "-     > $$\n# Visible heading\n",
  );

  const nestedTabCloser =
    "- - ~~~md\n\tvalue   \n\t~~~\n\n\n## visible\n";
  assert.equal(
    cleanMarkdown(nestedTabCloser, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    }).output,
    "- - ~~~md\n\tvalue   \n\t~~~\n\n# Visible\n",
  );

  for (const marker of ["~~~md", "$$"]) {
    const falseNestedCloser = [
      `- - ${marker}\n`,
      "\tvalue   \n",
      marker === "$$" ? "\t\t$$\n" : "\t\t~~~\n",
      "    \n",
      "    \n",
    ].join("");
    assert.equal(
      cleanMarkdown(falseNestedCloser, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      falseNestedCloser,
      marker,
    );
  }

  for (const marker of ["~~~", "$$"]) {
    const quotedTab = [
      `> \t${marker}\n`,
      "> \tliteral   \n",
      "> \t\n",
      "> \t\n",
      `> \t${marker}\n`,
      "## visible\n",
    ].join("");
    assert.equal(
      cleanMarkdown(quotedTab, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      quotedTab.replace("## visible\n", "# Visible\n"),
      marker,
    );

    const quotedListTab = [
      `> -\t${marker}\n`,
      ">   value   \n",
      `>   ${marker}\n`,
      "## visible\n",
    ].join("");
    assert.equal(
      cleanMarkdown(quotedListTab, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      quotedListTab.replace("## visible\n", "# Visible\n"),
      marker,
    );

    const falseQuotedListCloser = [
      `> -\t${marker}\n`,
      ">   value   \n",
      `>   \t${marker}\n`,
      ">       \n",
      ">       \n",
    ].join("");
    assert.equal(
      cleanMarkdown(falseQuotedListCloser, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      falseQuotedListCloser,
      marker,
    );

    const partiallyConsumedQuoteTab = [
      `>\t- ${marker}\n`,
      ">     value   \n",
      `>   ${marker}\n`,
      "> literal   \n",
      ">       \n",
    ].join("");
    assert.equal(
      cleanMarkdown(partiallyConsumedQuoteTab, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      partiallyConsumedQuoteTab,
      marker,
    );
  }
});

test("container-aware fence closers cannot close a different container", () => {
  for (const input of [
    "```md\n> ```\n#### still fenced\n",
    "> ```md\n```\n> #### still fenced\n",
    "10. ```md\n```\n    #### still fenced\n",
    "- > ```md\n>   ```\n  > #### still fenced\n",
  ]) {
    assert.equal(
      cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output,
      input,
      input,
    );
  }
});

test("math blocks after blockquotes and direct list markers remain protected", () => {
  const fixtures = [
    "- $$\n  #### hidden equation label\n\n\n  $$\n#### visible heading\n",
    "10. $$\n    #### hidden equation label\n\n\n    $$\n#### visible heading\n",
    "> $$\n> #### hidden equation label\n>\n>\n> $$\n#### visible heading\n",
    "> - $$\n>   #### hidden equation label\n>\n>\n>   $$\n#### visible heading\n",
  ];

  for (const input of fixtures) {
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);
    assert.equal(
      result.output,
      input.replace("#### visible heading\n", "# Visible heading\n"),
      input,
    );
    assert.equal(result.changes.extraBlankLinesRemoved, 0, input);
    assert.equal(result.changes.headingsCapitalized, 1, input);
    assert.equal(result.changes.headingLevelsAdjusted, 1, input);
  }
});

test("math blocks support ordered list and blockquote container interleaving", () => {
  const input = [
    "- > $$\n",
    "  > marker $$ inside math\n",
    "  > value   \n",
    "  >\n",
    "  >\n",
    "  > $$\n",
    "## visible heading\n",
  ].join("");
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
  });

  assert.equal(
    result.output,
    input.replace("## visible heading\n", "# Visible heading\n"),
  );
  assert.equal(result.changes.extraBlankLinesRemoved, 0);
});

test("protected container headings never participate in H6 alignment", () => {
  const input = [
    "- ```md\n",
    "  ## hidden parent\n",
    "  #### hidden child\n",
    "  ```\n",
    "## visible heading\n",
  ].join("");
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });

  assert.equal(
    result.output,
    input.replace("## visible heading\n", "###### Visible heading\n"),
  );
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 1);
});

test("a protected construct at end of file does not receive a guessed newline", () => {
  for (const input of [
    "---\ntitle: Test",
    "<pre>\nvalue",
    "<%*\nvalue",
    "```\nvalue",
  ]) {
    assert.equal(
      cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output,
      input,
      input,
    );
  }
});

test("opt-in trailing cleanup preserves two-space hard breaks and TPS fields", () => {
  const input =
    "- [ ] Task [scheduled:: 2026-07-24]   \n" +
    "Text\t \n" +
    "Already hard break  \n";
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
  });

  assert.equal(
    result.output,
    "- [ ] Task [scheduled:: 2026-07-24]  \n" +
      "Text\n" +
      "Already hard break  \n",
  );
  assert.equal(result.changes.nonblankTrailingWhitespaceLinesCleaned, 2);
});

test("extra blank lines collapse only outside protected TPS regions", () => {
  const input = [
    "Before\n",
    "\n",
    " \n",
    "\n",
    "After\n",
    "\n",
    "```md\n",
    "\n",
    "\n",
    "```\n",
    "\n",
    "$$\n",
    "\n",
    "\n",
    "$$\n",
    "\n",
    "<pre>\n",
    "\n",
    "\n",
    "</pre>\n",
    "\n",
    "    indented code\n",
    "\n",
    "\n",
    "    still code\n",
    "Done\n",
  ].join("");
  const expected = [
    "Before\n",
    "\n",
    "After\n",
    "\n",
    "```md\n",
    "\n",
    "\n",
    "```\n",
    "\n",
    "$$\n",
    "\n",
    "\n",
    "$$\n",
    "\n",
    "<pre>\n",
    "\n",
    "\n",
    "</pre>\n",
    "\n",
    "    indented code\n",
    "\n",
    "\n",
    "    still code\n",
    "Done\n",
  ].join("");

  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);
  assert.equal(result.output, expected);
  assert.equal(result.changes.whitespaceOnlyLinesCleaned, 1);
  assert.equal(result.changes.extraBlankLinesRemoved, 2);
});

test("all valid indented code widths remain byte-identical", () => {
  const input = [
    "     five-space code   \n",
    "\n",
    "\n",
    "        eight-space code   \n",
    "\n",
    "\t tab-space code   \n",
    " \t one-space-tab code   \n",
    "   \t three-space-tab code   \n",
    "Done\n",
  ].join("");
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
  });

  assert.equal(result.output, input);
  assert.equal(result.changes.extraBlankLinesRemoved, 0);
  assert.equal(result.changes.nonblankTrailingWhitespaceLinesCleaned, 0);
});

test("container-relative indented code remains byte-identical", () => {
  for (const input of [
    "-     first\n\n\n      second\n",
    "10.     first   \n\n\n        second   \n",
    ">     literal   \n>\n>\n>     still literal   \n",
    "- >     nested literal   \n  >\n  >     still literal   \n",
    "-\t  tab-indented literal   \n\n\n      still literal   \n",
  ]) {
    assert.equal(
      cleanMarkdown(input, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      input,
      input,
    );
  }
});

test("container-relative indented code protection ends at ordinary prose", () => {
  const input =
    ">     literal   \n>\n>     still literal   \n> ordinary prose   \n";
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
  });

  assert.equal(
    result.output,
    ">     literal   \n>\n>     still literal   \n> ordinary prose  \n",
  );
  assert.equal(result.changes.nonblankTrailingWhitespaceLinesCleaned, 1);
});

test("heading cleanup starts at H1 and permits only one-level increases", () => {
  const input = [
    "### lower heading ###\n",
    "##### much deeper heading\n",
    "## TPS roadmap\n",
    "###### another jump\n",
    "Setext title\n",
    "===\n",
    "```md\n",
    "#### fenced heading\n",
    "```\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "# Lower heading ###\n",
      "## Much deeper heading\n",
      "# TPS roadmap\n",
      "## Another jump\n",
      "Setext title\n",
      "===\n",
      "```md\n",
      "#### fenced heading\n",
      "```\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 3);
  assert.equal(result.changes.headingLevelsAdjusted, 4);
});

test("heading normalization keeps repeated siblings at the same level", () => {
  const result = cleanMarkdown(
    [
      "# parent\n",
      "### child one\n",
      "### child two\n",
      "#### grandchild\n",
      "### child three\n",
    ].join(""),
    DEFAULT_MARKDOWN_OPTIONS,
  );

  assert.equal(
    result.output,
    [
      "# Parent\n",
      "## Child one\n",
      "## Child two\n",
      "### Grandchild\n",
      "## Child three\n",
    ].join(""),
  );
});

test("optional lowest-level mode pushes a standalone heading to H6", () => {
  const result = cleanMarkdown("## test ##\r\n", {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });

  assert.equal(result.output, "###### Test ##\r\n");
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 1);

  const second = cleanMarkdown(result.output, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });
  assert.equal(second.changed, false);
  assert.equal(second.output, result.output);
});

test("optional lowest-level mode preserves nested outline relationships", () => {
  const result = cleanMarkdown(
    [
      "## root\n",
      "#### child one\n",
      "#### child two\n",
      "###### grandchild\n",
      "#### child three\n",
    ].join(""),
    {
      ...DEFAULT_MARKDOWN_OPTIONS,
      pushHeadingHierarchyToH6: true,
    },
  );

  assert.equal(
    result.output,
    [
      "#### Root\n",
      "##### Child one\n",
      "##### Child two\n",
      "###### Grandchild\n",
      "##### Child three\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 5);
  assert.equal(result.changes.headingLevelsAdjusted, 4);

  const second = cleanMarkdown(result.output, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });
  assert.equal(second.changed, false);
});

test("optional lowest-level mode ignores protected headings but counts visible markup headings", () => {
  const result = cleanMarkdown(
    [
      "```md\n",
      "# hidden parent\n",
      "## hidden child\n",
      "```\n",
      "## [[visible parent]]\n",
      "###### visible child\n",
    ].join(""),
    {
      ...DEFAULT_MARKDOWN_OPTIONS,
      pushHeadingHierarchyToH6: true,
    },
  );

  assert.equal(
    result.output,
    [
      "```md\n",
      "# hidden parent\n",
      "## hidden child\n",
      "```\n",
      "##### [[visible parent]]\n",
      "###### Visible child\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 1);
});

test("optional lowest-level mode keeps roots and siblings aligned through inline protected headings", () => {
  const result = cleanMarkdown(
    [
      "## first root\n",
      "## second root %% private annotation %%\n",
      "##### child one\n",
      "##### child two\n",
    ].join(""),
    {
      ...DEFAULT_MARKDOWN_OPTIONS,
      pushHeadingHierarchyToH6: true,
    },
  );

  assert.equal(
    result.output,
    [
      "##### First root\n",
      "##### second root %% private annotation %%\n",
      "###### Child one\n",
      "###### Child two\n",
    ].join(""),
  );

  const second = cleanMarkdown(result.output, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    pushHeadingHierarchyToH6: true,
  });
  assert.equal(second.changed, false);
});

test("optional lowest-level mode is dormant when heading normalization is off", () => {
  const result = cleanMarkdown("## test\n", {
    ...DEFAULT_MARKDOWN_OPTIONS,
    normalizeHeadingLevels: false,
    pushHeadingHierarchyToH6: true,
  });

  assert.equal(result.output, "## Test\n");
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 0);
});

test("heading options preserve markup and support H2 and title case", () => {
  const result = cleanMarkdown(
    [
      "#### a guide to TPS and macOS\n",
      "###### deeper heading\n",
      "### [[linked heading]]\n",
      "### `code heading`\n",
    ].join(""),
    {
      ...DEFAULT_MARKDOWN_OPTIONS,
      headingCapitalizationStyle: "title-case",
      headingStartLevel: 2,
    },
  );

  assert.equal(
    result.output,
    [
      "## A Guide to TPS and macOS\n",
      "### Deeper Heading\n",
      "## [[linked heading]]\n",
      "## `code heading`\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 2);
  assert.equal(result.changes.headingLevelsAdjusted, 4);
});

test("heading capitalization skips TPS fields, math, tags, and links", () => {
  const input = [
    "# [status:: open]\n",
    "# $e = mc^2$\n",
    "# #project/tps\n",
    "# [reference link][target]\n",
    "# https://example.com/path\n",
    "# ordinary heading\n",
  ].join("");
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    normalizeHeadingLevels: false,
  });

  assert.equal(
    result.output,
    [
      "# [status:: open]\n",
      "# $e = mc^2$\n",
      "# #project/tps\n",
      "# [reference link][target]\n",
      "# https://example.com/path\n",
      "# Ordinary heading\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 1);
});

test("Obsidian and HTML comments remain protected byte-for-byte", () => {
  const input = [
    "%%\n",
    "### hidden heading\n",
    "\n",
    "\n",
    "%%\n",
    "<!--\n",
    "##### html hidden heading\n",
    "\n",
    "\n",
    "-->\n",
    "### visible heading\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "%%\n",
      "### hidden heading\n",
      "\n",
      "\n",
      "%%\n",
      "<!--\n",
      "##### html hidden heading\n",
      "\n",
      "\n",
      "-->\n",
      "# Visible heading\n",
    ].join(""),
  );
  assert.equal(result.changes.extraBlankLinesRemoved, 0);
  assert.equal(result.changes.headingsCapitalized, 1);
  assert.equal(result.changes.headingLevelsAdjusted, 1);
});

test("visible headings with inline protected syntax still define hierarchy", () => {
  const input = [
    "### parent %% hidden note %%\n",
    "##### child\n",
    "### templater <% tp.file.title %>\n",
    "##### templater child\n",
    "### html <!-- hidden note -->\n",
    "##### html child\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "# parent %% hidden note %%\n",
      "## Child\n",
      "# templater <% tp.file.title %>\n",
      "## Templater child\n",
      "# html <!-- hidden note -->\n",
      "## Html child\n",
    ].join(""),
  );
  assert.equal(result.changes.headingsCapitalized, 3);
  assert.equal(result.changes.headingLevelsAdjusted, 6);
});

test("indented thematic breaks are never mistaken for frontmatter", () => {
  const input = [
    "    ---\n",
    "    zeta: code\n",
    "    alpha: code\n",
    "    ---",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changes.frontmatterFieldsReordered, 0);
  assert.equal(result.changes.frontmatterSortSkippedReason, null);
});

test("frontmatter sorting follows TPS priority and preserves the note body", () => {
  const input = [
    "---\n",
    "owner: Zach\n",
    "Status: active\n",
    "tags:\n",
    "  - tps\n",
    "alpha: one\n",
    "---\n",
    "# already capitalized\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "---\n",
      "Status: active\n",
      "tags:\n",
      "  - tps\n",
      "alpha: one\n",
      "owner: Zach\n",
      "---\n",
      "# Already capitalized\n",
    ].join(""),
  );
  assert.ok(result.changes.frontmatterFieldsReordered > 0);
  assert.equal(result.changes.frontmatterSortSkippedReason, null);
});

test("unsafe frontmatter fails closed while independent body rules still run", () => {
  const input = [
    "---\n",
    "status: active\n",
    "status: duplicate\n",
    "---\n",
    "### lower heading",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    [
      "---\n",
      "status: active\n",
      "status: duplicate\n",
      "---\n",
      "# Lower heading\n",
    ].join(""),
  );
  assert.match(
    result.changes.frontmatterSortSkippedReason ?? "",
    /duplicate/i,
  );
});

test("note-local controls disable all or selected rules before cleanup", () => {
  const disabledInput = [
    "---\n",
    "tps-linter: false\n",
    "zeta: 1\n",
    "status: active\n",
    "---\n",
    "#### lower heading\n",
    "\n",
    "\n",
    "Body   ",
  ].join("");
  const disabled = cleanMarkdown(disabledInput, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
    removeTrailingBlankLines: true,
  });

  assert.equal(disabled.output, disabledInput);
  assert.equal(disabled.changed, false);
  assert.match(disabled.noteDisabledReason ?? "", /tps-linter: false/);
  assert.equal(disabled.safetyBlockedReason, null);

  const selectedInput = [
    "---\n",
    "zeta: 1\n",
    "tps-linter-disabled-rules:\n",
    "  - frontmatter-sort\n",
    "  - heading-levels\n",
    "  - blank-lines\n",
    "status: active\n",
    "---\n",
    "#### lower heading\n",
    "\n",
    "\n",
    "Body\n",
  ].join("");
  const selected = cleanMarkdown(selectedInput, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    selected.output,
    selectedInput.replace("#### lower heading", "#### Lower heading"),
  );
  assert.deepEqual(selected.disabledRules, [
    "blank-lines",
    "heading-levels",
    "frontmatter-sort",
  ]);
  assert.equal(selected.noteDisabledReason, null);
});

test("indented top-level note controls cannot be bypassed", () => {
  const input =
    "---\n  tps-linter: false\n  title: Test\n---\n## lower\n\n\n";
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.match(result.noteDisabledReason ?? "", /tps-linter: false/);
});

test("invalid note-local controls fail closed without changing content", () => {
  const input = [
    "---\n",
    "tps-linter-disabled-rules: unknown-rule\n",
    "---\n",
    "#### lower heading\n",
    "\n",
    "\n",
    "Body",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.match(result.noteDisabledReason ?? "", /Invalid TPS Linter controls/);
});

test("range directives protect exact body regions and fail closed when unclosed", () => {
  for (const [disable, enable] of [
    ["<!-- tps-linter-disable -->", "<!-- tps-linter-enable -->"],
    ["%% tps-linter-disable %%", "%% tps-linter-enable %%"],
  ]) {
    const input = [
      `${disable}\n`,
      "#### protected heading\n",
      "\n",
      "\n",
      `${enable}\n`,
      "#### visible heading\n",
    ].join("");
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);
    assert.equal(
      result.output,
      input.replace("#### visible heading", "# Visible heading"),
      disable,
    );
    assert.equal(result.changes.extraBlankLinesRemoved, 0, disable);
  }

  const unclosed = [
    "<!-- tps-linter-disable -->\n",
    "#### protected heading\n",
    "\n",
    "\n",
  ].join("");
  assert.equal(
    cleanMarkdown(unclosed, DEFAULT_MARKDOWN_OPTIONS).output,
    unclosed,
  );
});

test("range directives inside protected blocks never change lint state", () => {
  const input = [
    "```md\n",
    "<!-- tps-linter-disable -->\n",
    "```\n",
    "#### visible heading\n",
  ].join("");
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(
    result.output,
    input.replace("#### visible heading", "# Visible heading"),
  );
});

test("enable directives inside a disabled protected block do not end the range", () => {
  for (const protectedRegion of [
    [
      "```md\n",
      "<!-- tps-linter-enable -->\n",
      "#### still protected in fence\n",
      "```\n",
    ].join(""),
    [
      "<div>\n",
      "<!-- tps-linter-enable -->\n",
      "#### still protected in HTML\n",
      "</div>\n",
    ].join(""),
    [
      "%%\n",
      "<!-- tps-linter-enable -->\n",
      "#### still protected in comment\n",
      "%%\n",
    ].join(""),
  ]) {
    const input = [
      "<!-- tps-linter-disable -->\n",
      protectedRegion,
      "#### still protected after block\n",
      "<!-- tps-linter-enable -->\n",
      "#### visible heading\n",
    ].join("");
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(
      result.output,
      input.replace("#### visible heading", "# Visible heading"),
      protectedRegion,
    );
  }
});

test("optional trailing blank cleanup leaves exactly one existing-style newline", () => {
  for (const [input, expected] of [
    ["Body\n\n\n", "Body\n"],
    ["Body\r\n\r\n\r\n", "Body\r\n"],
    ["Body\r\r\r", "Body\r"],
    ["Body", "Body\n"],
  ]) {
    const result = cleanMarkdown(input, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      collapseConsecutiveBlankLines: false,
      removeTrailingBlankLines: true,
    });
    assert.equal(result.output, expected, JSON.stringify(input));
    assert.equal(
      cleanMarkdown(result.output, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        collapseConsecutiveBlankLines: false,
        removeTrailingBlankLines: true,
      }).changed,
      false,
      JSON.stringify(input),
    );
  }

  const protectedEnd = "Before\n```\nvalue\n\n";
  assert.equal(
    cleanMarkdown(protectedEnd, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      removeTrailingBlankLines: true,
    }).output,
    protectedEnd,
  );
});

test("blank-line cleanup never removes a BOM or Unicode whitespace content", () => {
  for (const input of ["\uFEFF", "\uFEFF\n\n", "\u00A0\n\n", "\u2007\n\n"]) {
    const options = {
      ...DEFAULT_MARKDOWN_OPTIONS,
      collapseConsecutiveBlankLines: true,
      removeTrailingBlankLines: true,
    };
    const result = cleanMarkdown(input, options);

    assert.ok(result.output.startsWith(input[0] ?? ""), JSON.stringify(input));
    assert.equal(
      cleanMarkdown(result.output, options).changed,
      false,
      JSON.stringify(input),
    );
  }
});

test("oversized notes and pathological long lines fail closed", () => {
  for (const input of [
    "a".repeat(MARKDOWN_SAFETY_LIMITS.maxCharacters + 1),
    "x\n".repeat(MARKDOWN_SAFETY_LIMITS.maxLines),
    `${"a".repeat(MARKDOWN_SAFETY_LIMITS.maxLineCharacters + 1)}\n## lower\n`,
  ]) {
    const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

    assert.equal(result.output, input);
    assert.equal(result.changed, false);
    assert.match(result.safetyBlockedReason ?? "", /safety limit/);
  }

  const excessiveContainers =
    "> ".repeat(MARKDOWN_SAFETY_LIMITS.maxContainerDepth + 1) +
    "$$\n";
  for (const input of [
    excessiveContainers,
    `\uFEFF${excessiveContainers}`,
  ]) {
    const containerResult = cleanMarkdown(
      input,
      DEFAULT_MARKDOWN_OPTIONS,
    );
    assert.equal(containerResult.output, input);
    assert.match(
      containerResult.safetyBlockedReason ?? "",
      /container nesting/,
    );
  }
});

test("token-dense lines have a bounded protected-syntax work budget", () => {
  const input =
    "`x` ".repeat(MARKDOWN_SAFETY_LIMITS.maxProtectedTokensPerLine + 1) +
    "\n## lower\n";
  const startedAt = performance.now();
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.match(result.safetyBlockedReason ?? "", /work budget/);
  assert.ok(
    performance.now() - startedAt < 1_000,
    "protected-token guard should fail closed before a UI-scale stall",
  );
});

test("token-dense documents share one bounded protected-syntax work budget", () => {
  const tokensPerLine = 1_000;
  const lineCount =
    Math.ceil(
      (MARKDOWN_SAFETY_LIMITS.maxProtectedTokensPerDocument + 1) /
        tokensPerLine,
    ) + 1;
  const input = ("<i>".repeat(tokensPerLine) + "\n").repeat(lineCount);
  const startedAt = performance.now();
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.match(result.safetyBlockedReason ?? "", /work budget/);
  assert.ok(
    performance.now() - startedAt < 1_000,
    "document-wide protected-token guard should fail closed promptly",
  );
});

test("malformed bracket runs fail closed in linear-time practice", () => {
  const input = "[".repeat(MARKDOWN_SAFETY_LIMITS.maxLineCharacters);
  const startedAt = performance.now();
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, input);
  assert.equal(result.changed, false);
  assert.match(result.safetyBlockedReason ?? "", /Markdown labels/);
  assert.ok(
    performance.now() - startedAt < 500,
    "unmatched bracket scanning should not approach a UI-scale stall",
  );
});

test("empty and already-clean Markdown are no-ops and cleanup is idempotent", () => {
  assert.deepEqual(cleanMarkdown("", DEFAULT_MARKDOWN_OPTIONS), {
    output: "",
    changed: false,
    changes: {
      whitespaceOnlyLinesCleaned: 0,
      extraBlankLinesRemoved: 0,
      nonblankTrailingWhitespaceLinesCleaned: 0,
      trailingBlankLinesRemoved: 0,
      headingsCapitalized: 0,
      headingLevelsAdjusted: 0,
      frontmatterFieldsReordered: 0,
      frontmatterBlankLineAdded: false,
      frontmatterSortSkippedReason: null,
      finalNewlineAdded: false,
    },
    disabledRules: [],
    noteDisabledReason: null,
    safetyBlockedReason: null,
  });

  const clean = "Title\n\nBody\n";
  assert.equal(cleanMarkdown(clean, DEFAULT_MARKDOWN_OPTIONS).changed, false);

  const first = cleanMarkdown("Title\n \nBody", DEFAULT_MARKDOWN_OPTIONS);
  const second = cleanMarkdown(first.output, DEFAULT_MARKDOWN_OPTIONS);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.output, first.output);
});

test("exact manual preflight reuse preserves results and recomputes every changed revision", () => {
  for (const [sourceContent, concurrentRevision] of [
    ["## heading\n \nBody", "## heading\n \nBodyx"],
    ["\uFEFF### heading\r\n\t\r\nBody\r\n", "### heading\r\n\t\r\nBody\r\n"],
    ["# Already clean\n\nBody\n", "# Already clean\r\n\r\nBody\r\n"],
    [
      "---\ntps-linter: false\n---\n## untouched",
      "---\ntps-linter: true\n---\n## untouched",
    ],
  ]) {
    let cleanupCalls = 0;
    const countedClean = (content: string) => {
      cleanupCalls += 1;
      return cleanMarkdown(content, DEFAULT_MARKDOWN_OPTIONS);
    };
    const preflight = countedClean(sourceContent);
    assert.deepEqual(
      cleanMarkdown(sourceContent, DEFAULT_MARKDOWN_OPTIONS),
      preflight,
      "the pure cleanup result must be deterministic before it can be reused",
    );
    const cleanCurrentRevision = (currentContent: string) =>
      currentContent === sourceContent
        ? preflight
        : countedClean(currentContent);

    assert.equal(cleanCurrentRevision(sourceContent), preflight);
    assert.equal(cleanupCalls, 1, "an unchanged revision must reuse the exact preflight object");

    assert.deepEqual(
      cleanCurrentRevision(concurrentRevision),
      cleanMarkdown(concurrentRevision, DEFAULT_MARKDOWN_OPTIONS),
    );
    assert.equal(cleanupCalls, 2, "any byte change must run a fresh cleanup");
  }
});
