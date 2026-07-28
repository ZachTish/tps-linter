import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  planMarkdownFilename,
  type FilenameCleanupOptions,
  type MarkdownCleanupOptions,
} from "../src/cleaner.ts";

const LINE_ENDINGS = ["\n", "\r\n", "\r"] as const;
const HEADING_STYLES = ["off", "first-letter", "title-case"] as const;
const FILENAME_STYLES = ["space", "dash", "remove"] as const;

test("generated Markdown cleanup is deterministic, idempotent, and line-ending safe", () => {
  const random = deterministicRandom(0x5a17c0de);

  for (let caseIndex = 0; caseIndex < 400; caseIndex += 1) {
    const lineEnding = choose(random, LINE_ENDINGS);
    const withFrontmatter = random() < 0.45;
    const withBom = random() < 0.5;
    const input = generateMarkdown(
      random,
      lineEnding,
      withFrontmatter,
      withBom,
    );
    const options: MarkdownCleanupOptions = {
      cleanWhitespaceOnlyLines: random() < 0.8,
      collapseConsecutiveBlankLines: random() < 0.8,
      trimNonblankTrailingWhitespace: random() < 0.5,
      removeTrailingBlankLines: random() < 0.5,
      ensureFinalNewline: random() < 0.8,
      headingCapitalizationStyle: choose(random, HEADING_STYLES),
      normalizeHeadingLevels: random() < 0.8,
      pushHeadingHierarchyToH6: random() < 0.5,
      headingStartLevel: random() < 0.5 ? 1 : 2,
      sortFrontmatterFields: random() < 0.7,
      ensureBlankLineAfterFrontmatter: random() < 0.5,
      frontmatterPriorityKeys: ["status", "priority", "tags"],
    };

    const first = cleanMarkdown(input, options);
    const second = cleanMarkdown(first.output, options);
    const label = `generated Markdown case ${caseIndex}`;

    assert.equal(first.safetyBlockedReason, null, label);
    assert.equal(second.changed, false, label);
    assert.equal(second.output, first.output, label);
    assert.equal(second.safetyBlockedReason, null, label);
    assert.ok(
      extractLineEndings(first.output).every(
        (ending) => ending === lineEnding,
      ),
      `${label} introduced a different line ending`,
    );
    if (withBom) {
      assert.equal(first.output.startsWith("\uFEFF"), true, label);
      assert.equal(countOccurrences(first.output, "\uFEFF"), 1, label);
    }
  }
});

test("generated protected-only documents remain byte-identical", () => {
  const aggressiveOptions: MarkdownCleanupOptions = {
    cleanWhitespaceOnlyLines: true,
    collapseConsecutiveBlankLines: true,
    trimNonblankTrailingWhitespace: true,
    removeTrailingBlankLines: true,
    ensureFinalNewline: true,
    headingCapitalizationStyle: "title-case",
    normalizeHeadingLevels: true,
    pushHeadingHierarchyToH6: true,
    headingStartLevel: 1,
    sortFrontmatterFields: false,
    ensureBlankLineAfterFrontmatter: false,
    frontmatterPriorityKeys: ["status", "priority", "tags"],
  };

  for (const lineEnding of LINE_ENDINGS) {
    for (const fixture of protectedFixtures(lineEnding)) {
      const result = cleanMarkdown(fixture.input, aggressiveOptions);
      const label = `${fixture.name} with ${JSON.stringify(lineEnding)}`;

      assert.equal(result.output, fixture.input, label);
      assert.equal(result.changed, false, label);
      assert.equal(result.safetyBlockedReason, null, label);
    }
  }
});

test("arbitrary Markdown-like code-unit streams never throw and converge", () => {
  const random = deterministicRandom(0x51a7e);
  const alphabet = [
    "a",
    "Z",
    "0",
    " ",
    "\t",
    "\n",
    "\r",
    "#",
    "`",
    "~",
    "%",
    "<",
    ">",
    "?",
    "!",
    "-",
    "_",
    ":",
    "[",
    "]",
    "$",
    "\uFEFF",
    "\u00A0",
    "\u0301",
    "🧭",
    "\uD800",
    "\uDC00",
  ] as const;
  const aggressiveOptions: MarkdownCleanupOptions = {
    cleanWhitespaceOnlyLines: true,
    collapseConsecutiveBlankLines: true,
    trimNonblankTrailingWhitespace: true,
    removeTrailingBlankLines: true,
    ensureFinalNewline: true,
    headingCapitalizationStyle: "title-case",
    normalizeHeadingLevels: true,
    pushHeadingHierarchyToH6: true,
    headingStartLevel: 1,
    sortFrontmatterFields: true,
    ensureBlankLineAfterFrontmatter: true,
    frontmatterPriorityKeys: ["status", "priority", "tags"],
  };

  for (let caseIndex = 0; caseIndex < 1_000; caseIndex += 1) {
    const length = Math.floor(random() * 240);
    let input = "";
    for (let index = 0; index < length; index += 1) {
      input += choose(random, alphabet);
    }
    if (caseIndex % 10 === 0) input = `---\n${input}`;

    const first = cleanMarkdown(input, aggressiveOptions);
    const repeated = cleanMarkdown(input, aggressiveOptions);
    const second = cleanMarkdown(first.output, aggressiveOptions);
    const label = `arbitrary stream ${caseIndex}`;

    assert.deepEqual(repeated, first, label);
    assert.equal(typeof first.output, "string", label);
    assert.equal(second.output, first.output, label);
    assert.equal(second.changed, false, label);
  }
});

test("generated filename plans are deterministic, valid, and idempotent when applicable", () => {
  const random = deterministicRandom(0xc0111de);
  const fragments = [
    "TPS",
    "  spaced  ",
    "A:B",
    "A?B",
    "A*B",
    "A|B",
    "A<B>",
    "A/B",
    "A\\B",
    "#linked",
    "[draft]",
    "^block",
    "Unicode café 🧭",
    "CON",
    "COM¹",
    "LPT².txt",
    "LPT1.txt",
    "...",
    "\tTabbed\t",
    "C1\u0085control",
    "line\u2028separator",
    "2026-07-25",
  ] as const;

  for (let caseIndex = 0; caseIndex < 750; caseIndex += 1) {
    const basename = Array.from(
      { length: 1 + Math.floor(random() * 4) },
      () => choose(random, fragments),
    ).join(random() < 0.5 ? " " : "");
    const options: FilenameCleanupOptions = {
      unsafeCharacterStyle: choose(random, FILENAME_STYLES),
      removeObsidianLinkCharacters: random() < 0.5,
    };
    const sourcePath = `Inbox/${basename}.md`;
    const first = planMarkdownFilename(sourcePath, options);
    const repeated = planMarkdownFilename(sourcePath, options);
    const label = `generated filename case ${caseIndex}: ${sourcePath}`;

    assert.deepEqual(repeated, first, label);
    assert.equal(first.targetPath.endsWith(".md"), true, label);
    assert.equal(first.targetBasename.includes("/"), false, label);
    assert.equal(first.targetBasename.includes("\\"), false, label);

    if (!first.valid) continue;

    assert.notEqual(first.targetBasename, "", label);
    assert.notEqual(first.targetBasename, ".", label);
    assert.notEqual(first.targetBasename, "..", label);
    assert.doesNotMatch(
      first.targetBasename,
      /[\p{Cc}<>:"/\\|?*]/u,
      label,
    );
    assert.doesNotMatch(
      first.targetBasename,
      /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i,
      label,
    );

    const second = planMarkdownFilename(first.targetPath, options);
    assert.equal(second.valid, true, label);
    assert.equal(second.changed, false, label);
    assert.equal(second.targetPath, first.targetPath, label);
  }
});

function generateMarkdown(
  random: () => number,
  lineEnding: (typeof LINE_ENDINGS)[number],
  withFrontmatter: boolean,
  withBom: boolean,
): string {
  const units = [
    ["plain body text   "],
    ["   "],
    [""],
    ["", ""],
    ["### lower heading"],
    ["###### deep heading ###"],
    ["- [ ] task [status:: open]   "],
    ["```md", "#### fenced heading   ", "", "", "```"],
    ["- ```md", "  #### listed code heading   ", "", "  ```"],
    ["$$", "#### equation label   ", "", "$$"],
    ["<!--", "#### comment heading   ", "", "-->"],
    ["%%", "#### private heading   ", "", "%%"],
    ["<%*", 'const heading = "#### template";   ', "%>"],
    ["<section>", "<section>", "#### html heading   ", "</section>", "</section>"],
    ["    indented code   ", "", "    still code   "],
  ] as const;

  const lines: string[] = [];
  if (withFrontmatter) {
    lines.push(
      `${withBom ? "\uFEFF" : ""}---`,
      "zeta: last",
      "status: open",
      "alpha: first",
      "---",
    );
  } else if (withBom) {
    lines.push("\uFEFFBOM-preserved body");
  }

  const unitCount = 2 + Math.floor(random() * 10);
  for (let index = 0; index < unitCount; index += 1) {
    lines.push(...choose(random, units));
  }
  if (random() < 0.5) lines.push("", "");

  let output = lines.join(lineEnding);
  if (random() < 0.7) output += lineEnding;
  return output;
}

function protectedFixtures(
  lineEnding: (typeof LINE_ENDINGS)[number],
): Array<{ name: string; input: string }> {
  const join = (lines: readonly string[]) => lines.join(lineEnding);
  return [
    {
      name: "frontmatter",
      input: `\uFEFF${join(["---", "title: Protected   ", "   ", "---"])}`,
    },
    {
      name: "backtick fence",
      input: join(["```md", "#### hidden heading   ", "", "", "```"]),
    },
    {
      name: "tilde fence",
      input: join(["~~~md", "#### hidden heading   ", "", "", "~~~"]),
    },
    {
      name: "bullet-list fence",
      input: join(["- ```md", "  #### hidden heading   ", "", "", "  ```"]),
    },
    {
      name: "ordered-list fence",
      input: join(["10. ```md", "    #### hidden heading   ", "", "", "    ```"]),
    },
    {
      name: "blockquote fence",
      input: join(["> ```md", "> #### hidden heading   ", ">", ">", "> ```"]),
    },
    {
      name: "math block",
      input: join(["$$", "#### hidden heading   ", "", "", "$$"]),
    },
    {
      name: "list math block",
      input: join(["- $$", "  #### hidden heading   ", "", "", "  $$"]),
    },
    {
      name: "Obsidian comment",
      input: join(["%%", "#### hidden heading   ", "", "", "%%"]),
    },
    {
      name: "HTML comment",
      input: join(["<!--", "#### hidden heading   ", "", "", "-->"]),
    },
    {
      name: "HTML processing instruction",
      input: join(["<?target", "#### hidden heading   ", "", "", "?>"]),
    },
    {
      name: "HTML declaration",
      input: join(["<!DOCTYPE", "#### hidden heading   ", "", "", ">"]),
    },
    {
      name: "HTML CDATA section",
      input: join(["<![CDATA[", "#### hidden heading   ", "", "", "]]>"]),
    },
    {
      name: "Templater block",
      input: join(["<%*", "#### hidden heading   ", "", "", "%>"]),
    },
    {
      name: "nested paired HTML",
      input: join([
        "<section>",
        "<section>",
        "#### hidden heading   ",
        "",
        "",
        "</section>",
        "</section>",
      ]),
    },
    {
      name: "cross-family transition",
      input: join([
        "%%",
        "%% <section>",
        "#### hidden heading   ",
        "",
        "",
        "</section>",
      ]),
    },
    {
      name: "indented code",
      input: join(["    #### hidden heading   ", "", "", "    code   "]),
    },
    {
      name: "unclosed fence",
      input: join(["```md", "#### hidden heading   ", "", ""]),
    },
    {
      name: "unclosed generic HTML",
      input: join(["<section>", "#### hidden heading   ", "", ""]),
    },
  ];
}

function deterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function choose<T>(
  random: () => number,
  values: readonly T[],
): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error("Cannot choose from an empty list.");
  return value;
}

function extractLineEndings(input: string): string[] {
  return [...input.matchAll(/\r\n|\r|\n/g)].map((match) => match[0]);
}

function countOccurrences(input: string, value: string): number {
  return input.split(value).length - 1;
}
