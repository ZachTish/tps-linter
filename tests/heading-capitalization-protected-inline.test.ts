import assert from "node:assert/strict";
import test from "node:test";

import { cleanMarkdown } from "../src/cleaner.ts";

const DEFAULT_MARKDOWN_OPTIONS = {
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
  removeBlankLinesBetweenListItems: false,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: true,
  ensureBlankLineAtBeginning: false,
  headingCapitalizationStyle: "first-letter" as const,
  normalizeHeadingLevels: true,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1 as const,
  sortFrontmatterFields: false,
  ensureBlankLineAfterFrontmatter: false,
  frontmatterPriorityKeys: [],
};

const CASE_SENSITIVE_HEADING_TEXT = [
  ["ordinary nested tag", "release #Client/API-v2 notes"],
  ["punctuation-adjacent tag", "release (#camelCase) notes"],
  ["Unicode-symbol tag", "release #🚀camelCase notes"],
  ["escaped hashtag", String.raw`release \#caseSensitive notes`],
  ["wiki link and alias", "release [[ClientAPI#ExactHeading|lowerCaseAlias]] notes"],
  ["wiki embed", "release ![[Assets/ScreenShot.PNG|caseSensitiveCaption]] notes"],
  [
    "Markdown inline link",
    'release [lowerCaseLabel](Docs/ExactFile.md#ExactFragment "ExactTitle") notes',
  ],
  ["Markdown reference link", "release [lowerCaseLabel][ExactReferenceID] notes"],
  [
    "Markdown image",
    'release ![lowerCaseAlt](Assets/ExactImage.PNG "ExactTitle") notes',
  ],
  ["HTTP URL", "release https://Example.COM/CaseSensitive?Key=MiXeD notes"],
  ["Obsidian URI", "release obsidian://open?file=ExactPath notes"],
  ["empty-payload URI", "release urn:"],
  ["URN", "release urn:example:CaseSensitiveValue notes"],
  ["data URI", "release data:text/plain,CaseSensitiveValue notes"],
  ["www URL", "release www.Example.COM/CaseSensitivePath notes"],
  ["protocol-relative URL", "release //Example.COM/CaseSensitivePath notes"],
  ["bare domain path", "release Example.COM/CaseSensitivePath notes"],
  ["Unicode domain path", "release 例え.テスト/caseSensitivePath notes"],
  ["IDN domain path", "release münich.de/caseSensitivePath notes"],
  [
    "decomposed Unicode domain",
    "release café.example?caseSensitive=value notes",
  ],
  ["IDNA ideographic dot", "release münich。de caseSensitive notes"],
  ["IDNA fullwidth dot", "release münich．de caseSensitive notes"],
  ["IDNA halfwidth dot", "release münich｡de caseSensitive notes"],
  ["IPv4 path", "release 192.168.1.1:8080/caseSensitivePath notes"],
  ["localhost path", "release localhost/caseSensitivePath notes"],
  ["relative path", "release ../ExactFolder/caseSensitivePath notes"],
  ["root path", "release /ExactFolder/caseSensitivePath notes"],
  [
    "URL autolink",
    "release <https://Example.COM/CaseSensitivePath> notes",
  ],
  ["email autolink", "release <User.Name+ExactTag@Example.COM> notes"],
  ["inline code", 'release `CaseSensitiveAPI.call("--ExactFlag")` notes'],
  ["HTML character reference", "release &copy; caseSensitive notes"],
] as const;

test("heading capitalization preserves case-sensitive inline syntax byte-for-byte", async (t) => {
  for (const headingCapitalizationStyle of [
    "first-letter",
    "title-case",
  ] as const) {
    for (const [label, text] of CASE_SENSITIVE_HEADING_TEXT) {
      await t.test(`${headingCapitalizationStyle}: ${label}`, () => {
        const input = `\uFEFF### ${text} ###\r\n`;
        const expected = `\uFEFF# ${text} ###\r\n`;
        const options = {
          ...DEFAULT_MARKDOWN_OPTIONS,
          headingCapitalizationStyle,
        };

        const first = cleanMarkdown(input, options);
        const second = cleanMarkdown(first.output, options);

        assert.equal(first.output, expected);
        assert.equal(first.changes.headingsCapitalized, 0);
        assert.equal(first.changes.headingLevelsAdjusted, 1);
        assert.equal(second.output, expected);
        assert.equal(second.changed, false);
        assert.equal(second.changes.headingsCapitalized, 0);
      });
    }
  }
});

test("ordinary heading text still capitalizes in both supported styles", () => {
  const firstLetter = cleanMarkdown("### release notes\n", {
    ...DEFAULT_MARKDOWN_OPTIONS,
    headingCapitalizationStyle: "first-letter",
  });
  const titleCase = cleanMarkdown("### release notes for TPS\n", {
    ...DEFAULT_MARKDOWN_OPTIONS,
    headingCapitalizationStyle: "title-case",
  });

  assert.equal(firstLetter.output, "# Release notes\n");
  assert.equal(firstLetter.changes.headingsCapitalized, 1);
  assert.equal(titleCase.output, "# Release Notes for TPS\n");
  assert.equal(titleCase.changes.headingsCapitalized, 1);
});

test("case-safety checks stay bounded on maximum-length heading near misses", () => {
  const domainNearMiss = `${"a.".repeat(15_000)}1`;
  const unmatchedAngles = "<".repeat(30_000);
  const options = {
    ...DEFAULT_MARKDOWN_OPTIONS,
    headingCapitalizationStyle: "title-case" as const,
    normalizeHeadingLevels: false,
    ensureFinalNewline: false,
  };
  const startedAt = performance.now();

  for (const text of [domainNearMiss, unmatchedAngles]) {
    const input = `# ${text}`;
    const result = cleanMarkdown(input, options);
    assert.equal(result.output, input);
    assert.equal(result.changes.headingsCapitalized, 0);
  }

  assert.ok(
    performance.now() - startedAt < 500,
    "maximum-length heading guards should complete in linear-time practice",
  );
});
