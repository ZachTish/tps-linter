import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const baselineRootSetting =
  process.env.TPS_LINTER_BASELINE_SOURCE_ROOT;
assert.ok(
  baselineRootSetting,
  "Set TPS_LINTER_BASELINE_SOURCE_ROOT to the exact 0.5.5 source worktree.",
);

const baselineRoot = resolve(baselineRootSetting);
const candidateRoot = fileURLToPath(new URL("..", import.meta.url));
const baselineCleanerPath = resolve(baselineRoot, "src/cleaner.ts");
const baselineControlsPath = resolve(
  baselineRoot,
  "src/lint-controls.ts",
);
const baselineFrontmatterSortPath = resolve(
  baselineRoot,
  "src/frontmatter-sort.ts",
);
const baselineMainPath = resolve(baselineRoot, "src/main.ts");

assert.equal(
  sha256(baselineCleanerPath),
  "209e605fce08c5b788493008e23a6b5e497409aaed3e4a8d014148d44e51b050",
  "comparison must use the exact 0.5.5 cleaner source",
);
assert.equal(
  sha256(baselineControlsPath),
  "b01346b4e01137ecc3edbee235c3bd0cc98a95a65195a6c0d0e43f12b2413729",
  "comparison must use the exact 0.5.5 lint-controls source",
);
assert.equal(
  sha256(baselineFrontmatterSortPath),
  "1ebd7143a9c01cdd4499e1eaa388173729d4e961919f7415c18e4987980c7d51",
  "comparison must use the exact 0.5.5 frontmatter-sort source",
);
assert.equal(
  sha256(baselineMainPath),
  "0ff7b8c923f2a8c6891e0b877ba31b27225ae600304deb3ef061dacd2dd8775f",
  "comparison must use the exact 0.5.5 plugin source",
);

const baselineCleaner = await import(
  pathToFileURL(baselineCleanerPath)
);
const baselineControls = await import(
  pathToFileURL(baselineControlsPath)
);
const candidateCleaner = await import(
  pathToFileURL(resolve(candidateRoot, "src/cleaner.ts"))
);
assert.deepEqual(
  candidateCleaner.MARKDOWN_SAFETY_LIMITS,
  baselineCleaner.MARKDOWN_SAFETY_LIMITS,
  "manual-analysis optimization must preserve released safety limits",
);

const baseOptions = {
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
const optionVariants = [
  baseOptions,
  {
    ...baseOptions,
    trimNonblankTrailingWhitespace: true,
    removeTrailingBlankLines: true,
  },
  {
    ...baseOptions,
    headingCapitalizationStyle: "title-case",
    headingStartLevel: 2,
  },
  {
    ...baseOptions,
    sortFrontmatterFields: false,
    ensureBlankLineAfterFrontmatter: true,
    pushHeadingHierarchyToH6: true,
  },
];
const frontmatters = [
  "",
  "---\nstatus: active\ntitle: Test\n---\n",
  "---\ntps-linter-disabled-rules: filename\nstatus: active\n---\n",
  "---\ntps-linter-disabled-rules: [blank-lines, heading-levels]\n---\n",
  "---\ntps-linter: false\n---\n",
  "---\ntps-linter-disabled-rules: unknown\n---\n",
  '---\n"tps\\x2dlinter": false\n---\n',
  "---\nstatus: [broken\n---\n",
];
const bodyParts = [
  "# clean\n\nBody\n",
  "#### lower heading\n \n\nBody   ",
  "```ts\n## protected\n\n\n```\n## visible",
  "<!-- tps-linter-disable -->\n## kept\n<!-- tps-linter-enable -->\n## changed",
  "%% comment %%\n> 1. ```\n>    ## code\n>    ```\n## body",
  "Text with [[Wiki]] and `# code` and $x$.\r\n\r\n",
];

let randomState = 0x5eed1234;
let caseCount = 0;
for (let index = 0; index < 10_000; index += 1) {
  const frontmatter = frontmatters[nextRandom() % frontmatters.length];
  const repetitions = 1 + (nextRandom() % 5);
  let body = "";
  for (let part = 0; part < repetitions; part += 1) {
    body += bodyParts[nextRandom() % bodyParts.length];
  }
  compareCase(
    `${frontmatter}${body}`,
    optionVariants[nextRandom() % optionVariants.length],
    `generated case ${index}`,
  );
}

for (const [label, input] of [
  [
    "long line limit",
    "x".repeat(
      candidateCleaner.MARKDOWN_SAFETY_LIMITS.maxLineCharacters + 1,
    ),
  ],
  [
    "line count limit",
    "line\n".repeat(
      candidateCleaner.MARKDOWN_SAFETY_LIMITS.maxLines + 1,
    ),
  ],
  [
    "character count limit",
    "x".repeat(
      candidateCleaner.MARKDOWN_SAFETY_LIMITS.maxCharacters + 1,
    ),
  ],
]) {
  compareCase(input, baseOptions, label);
}

console.log(
  JSON.stringify({
    baseline: "fd2bfbb968e0615c27256725f7bed06aaf0a2162",
    cases: caseCount,
    result: "exact controls and Markdown result parity",
  }),
);

function compareCase(input, options, label) {
  const safetyBlockedReason =
    baselineCleaner.inspectMarkdownInputSafety(input);
  const releasedLintControls = safetyBlockedReason
    ? {
        controlsPresent: false,
        disabledAll: true,
        disabledRules: new Set(),
        reason: `Safety blocked: ${safetyBlockedReason}.`,
      }
    : baselineControls.parseLintControls(input);
  const releasedMarkdown = baselineCleaner.cleanMarkdown(input, options);
  const candidate = candidateCleaner.analyzeMarkdownCleanup(
    input,
    options,
  );

  assert.deepEqual(
    candidate.lintControls,
    releasedLintControls,
    `${label}: lint controls`,
  );
  assert.deepEqual(
    withoutLeadingBlankLineChange(candidate.markdown),
    releasedMarkdown,
    `${label}: combined Markdown`,
  );
  assert.deepEqual(
    withoutLeadingBlankLineChange(
      candidateCleaner.cleanMarkdown(input, options),
    ),
    releasedMarkdown,
    `${label}: public cleanMarkdown`,
  );
  caseCount += 1;
}

function withoutLeadingBlankLineChange(result) {
  assert.equal(
    result.changes.leadingBlankLineAdded,
    false,
    "historical differential options must keep leading spacing disabled",
  );
  const { leadingBlankLineAdded: _leadingBlankLineAdded, ...changes } =
    result.changes;
  return { ...result, changes };
}

function nextRandom() {
  randomState =
    (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState;
}

function sha256(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}
