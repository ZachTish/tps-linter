import {
  inspectTopLevelFrontmatterSafety,
  sortTopLevelFrontmatterFields,
} from "./frontmatter-sort.ts";
import type { FilenameOwnershipStatus } from "./gcm-compat.ts";
import {
  TPS_LINTER_RULE_IDS,
  parseLintControls,
  type LintControlResult,
  type TPSLinterRuleId,
} from "./lint-controls.ts";
import type {
  FilenameUnsafeCharacterStyle,
  HeadingCapitalizationStyle,
} from "./settings";

export interface FilenameCleanupOptions {
  unsafeCharacterStyle: FilenameUnsafeCharacterStyle;
  removeObsidianLinkCharacters: boolean;
}

export interface FilenamePlan {
  sourcePath: string;
  targetPath: string;
  sourceBasename: string;
  targetBasename: string;
  changed: boolean;
  valid: boolean;
  changes: string[];
  blockReason: string | null;
}

export type FilenameRenameDecisionReason =
  | "eligible"
  | "no-change"
  | "invalid-plan"
  | "case-only-rename"
  | "filename-cleaning-disabled"
  | "gcm-auto-rename-active"
  | "gcm-ownership-unavailable"
  | "target-collision"
  | "note-disabled"
  | "note-rule-disabled"
  | "path-excluded"
  | "rename-failed";

export interface FilenameRenameDecision {
  allowed: boolean;
  reason: FilenameRenameDecisionReason;
  detail: string | null;
}

export interface MarkdownCleanupOptions {
  cleanWhitespaceOnlyLines: boolean;
  collapseConsecutiveBlankLines: boolean;
  removeBlankLinesBetweenListItems: boolean;
  trimNonblankTrailingWhitespace: boolean;
  removeTrailingBlankLines: boolean;
  ensureFinalNewline: boolean;
  ensureBlankLineAtBeginning: boolean;
  headingCapitalizationStyle: HeadingCapitalizationStyle;
  normalizeHeadingLevels: boolean;
  pushHeadingHierarchyToH6: boolean;
  headingStartLevel: 1 | 2;
  sortFrontmatterFields: boolean;
  ensureBlankLineAfterFrontmatter: boolean;
  frontmatterPriorityKeys: readonly string[];
}

export interface MarkdownCleanupChanges {
  whitespaceOnlyLinesCleaned: number;
  extraBlankLinesRemoved: number;
  listItemBlankLinesRemoved: number;
  nonblankTrailingWhitespaceLinesCleaned: number;
  trailingBlankLinesRemoved: number;
  headingsCapitalized: number;
  headingLevelsAdjusted: number;
  frontmatterFieldsReordered: number;
  leadingBlankLineAdded: boolean;
  frontmatterBlankLineAdded: boolean;
  frontmatterSortSkippedReason: string | null;
  finalNewlineAdded: boolean;
}

export interface MarkdownCleanupResult {
  output: string;
  changed: boolean;
  changes: MarkdownCleanupChanges;
  disabledRules: TPSLinterRuleId[];
  noteDisabledReason: string | null;
  safetyBlockedReason: string | null;
}

export interface MarkdownCleanupAnalysis {
  lintControls: LintControlResult;
  markdown: MarkdownCleanupResult;
}

export interface PathExclusion {
  excluded: boolean;
  reason: string | null;
}

interface LineToken {
  body: string;
  ending: "" | "\n" | "\r" | "\r\n";
}

interface ProcessedLineToken extends LineToken {
  protected: boolean;
  headingIndex?: number;
}

interface ListItemSignature {
  containerPath: ContainerStep[];
  markerIndent: number;
  markerClass: string;
  orderedNumber: number | null;
}

interface FenceState {
  marker: "`" | "~";
  length: number;
  containerPath: ContainerStep[];
}

interface NormalizedHeadingLevel {
  source: number;
  target: number;
}

interface VisibleHeading {
  sourceLevel: number;
}

type MarkdownComment = "obsidian" | "html";
type HtmlDelimitedConstruct =
  | "processing-instruction"
  | "declaration"
  | "cdata";
type RawHtmlTag = "pre" | "script" | "style" | "textarea";

interface ProtectedConstructState {
  comment: MarkdownComment | null;
  inTemplater: boolean;
  htmlDelimited: HtmlDelimitedConstruct | null;
  codeSpanTicks: number | null;
  rawHtmlTag: RawHtmlTag | null;
  htmlTags: string[];
  referenceTitleMayContinue: boolean;
}

interface ProtectedConstructScan extends ProtectedConstructState {
  protected: boolean;
  safetyBlockedReason?: string;
}

interface ProtectedSyntaxBudget {
  remaining: number;
}

interface HtmlTagToken {
  index: number;
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
  complete: boolean;
}

type ContainerStep =
  | { kind: "blockquote" }
  | { kind: "list"; indent: number };

interface DelimiterCandidate {
  content: string;
  containerPath: ContainerStep[];
  column: number;
}

interface MathBlockState {
  containerPath: ContainerStep[];
}

type ProtectedToken =
  | {
      kind: "obsidian-comment" | "html-comment" | "templater";
      index: number;
      end: number;
    }
  | {
      kind: "html-delimited";
      index: number;
      end: number;
      construct: HtmlDelimitedConstruct;
    }
  | {
      kind: "code-span";
      index: number;
      end: number;
      ticks: number;
    }
  | {
      kind: "inline-opaque";
      index: number;
      end: number;
      referenceTitleMayContinue?: boolean;
      protectLine?: boolean;
    }
  | {
      kind: "unsafe";
      index: number;
      end: number;
      reason: string;
    }
  | ({ kind: "html-tag" } & HtmlTagToken);

const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const UNSAFE_FILENAME_CHARACTERS = /[\p{Cc}<>:"/\\|?*]+/gu;
const OBSIDIAN_LINK_CONTROL_CHARACTERS = /[#^[\]]+/g;
const HORIZONTAL_FILENAME_WHITESPACE = /[\t\p{Z}]+/gu;

const HARD_EXCLUDED_PREFIXES = [
  ".obsidian",
  ".trash",
  ".tps",
  ".plugin-dev-cache.nosync",
  "Plugin Development",
  "_assets/TPS AI Queue",
];
const TITLE_CASE_MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
]);
const HTML_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const RAW_HTML_TAGS = new Set<RawHtmlTag>([
  "pre",
  "script",
  "style",
  "textarea",
]);
export const MARKDOWN_SAFETY_LIMITS = Object.freeze({
  maxCharacters: 2_000_000,
  maxLines: 50_000,
  maxLineCharacters: 32_000,
  maxProtectedTokensPerLine: 2_048,
  maxProtectedTokensPerDocument: 4_096,
  maxContainerDepth: 64,
});

export function planMarkdownFilename(
  sourcePath: string,
  options: FilenameCleanupOptions,
): FilenamePlan {
  const normalizedSourcePath = normalizeVaultPath(sourcePath);
  const lastSlash = normalizedSourcePath.lastIndexOf("/");
  const folder = lastSlash >= 0 ? normalizedSourcePath.slice(0, lastSlash) : "";
  const filename = normalizedSourcePath.slice(lastSlash + 1);
  const extensionIndex = filename.lastIndexOf(".");

  if (
    extensionIndex <= 0 ||
    filename.slice(extensionIndex).toLowerCase() !== ".md"
  ) {
    return invalidFilenamePlan(
      normalizedSourcePath,
      filename,
      "Only Markdown (.md) files are eligible.",
    );
  }

  const extension = filename.slice(extensionIndex);
  const sourceBasename = filename.slice(0, extensionIndex);
  const changes: string[] = [];
  let targetBasename = sourceBasename;

  const unsafeReplacement = replacementForStyle(options.unsafeCharacterStyle);
  const withoutUnsafeCharacters = targetBasename.replace(
    UNSAFE_FILENAME_CHARACTERS,
    unsafeReplacement,
  );
  if (withoutUnsafeCharacters !== targetBasename) {
    changes.push("unsafe characters");
    targetBasename = withoutUnsafeCharacters;
  }

  if (options.removeObsidianLinkCharacters) {
    const withoutLinkControls = targetBasename.replace(
      OBSIDIAN_LINK_CONTROL_CHARACTERS,
      "",
    );
    if (withoutLinkControls !== targetBasename) {
      changes.push("Obsidian link-control characters");
      targetBasename = withoutLinkControls;
    }
  }

  const normalizedWhitespace = targetBasename
    .replace(HORIZONTAL_FILENAME_WHITESPACE, " ")
    .trim();
  if (normalizedWhitespace !== targetBasename) {
    changes.push("filename whitespace");
    targetBasename = normalizedWhitespace;
  }

  const withoutTrailingDots = targetBasename.replace(/[. ]+$/g, "");
  if (withoutTrailingDots !== targetBasename) {
    changes.push("trailing spaces or periods");
    targetBasename = withoutTrailingDots;
  }

  const targetFilename = `${targetBasename}${extension}`;
  const targetPath = folder ? `${folder}/${targetFilename}` : targetFilename;
  const changed = targetPath !== normalizedSourcePath;

  let blockReason: string | null = null;
  if (!targetBasename || targetBasename === "." || targetBasename === "..") {
    blockReason = "The cleaned filename would be empty or reserved.";
  } else if (WINDOWS_RESERVED_DEVICE_NAME.test(targetBasename)) {
    blockReason = `"${targetBasename}" is a reserved device name.`;
  } else if (
    changed &&
    targetPath.toLowerCase() === normalizedSourcePath.toLowerCase()
  ) {
    blockReason = "Case-only filename changes are not applied automatically.";
  }

  return {
    sourcePath: normalizedSourcePath,
    targetPath,
    sourceBasename,
    targetBasename,
    changed,
    valid: blockReason === null,
    changes: unique(changes),
    blockReason,
  };
}

export function decideFilenameRename(
  plan: FilenamePlan,
  siblingPaths: readonly string[],
  ownership: FilenameOwnershipStatus,
  filenameCleaningEnabled: boolean,
): FilenameRenameDecision {
  if (!filenameCleaningEnabled) {
    return {
      allowed: false,
      reason: "filename-cleaning-disabled",
      detail: null,
    };
  }
  if (!plan.changed) {
    return { allowed: false, reason: "no-change", detail: null };
  }
  if (!plan.valid) {
    return {
      allowed: false,
      reason: "invalid-plan",
      detail: plan.blockReason,
    };
  }
  if (
    plan.targetPath.toLowerCase() ===
    plan.sourcePath.toLowerCase()
  ) {
    return {
      allowed: false,
      reason: "case-only-rename",
      detail: "Case-only filename changes require an explicit filesystem-safe workflow.",
    };
  }
  if (ownership === "gcm-active") {
    return {
      allowed: false,
      reason: "gcm-auto-rename-active",
      detail: "TPS Global Context Menu currently owns automatic filename synchronization.",
    };
  }
  if (ownership === "unavailable") {
    return {
      allowed: false,
      reason: "gcm-ownership-unavailable",
      detail: "TPS Global Context Menu filename ownership could not be verified.",
    };
  }

  const sourcePath = normalizeVaultPath(plan.sourcePath);
  const targetPathKey = collisionKey(normalizeVaultPath(plan.targetPath));
  let collision: string | undefined;
  for (const siblingPath of siblingPaths) {
    const path = normalizeVaultPath(siblingPath);
    if (path !== sourcePath && collisionKey(path) === targetPathKey) {
      collision = path;
      break;
    }
  }
  if (collision) {
    return {
      allowed: false,
      reason: "target-collision",
      detail: collision,
    };
  }

  return { allowed: true, reason: "eligible", detail: null };
}

export function inspectPathExclusion(
  sourcePath: string,
  configuredPatterns: readonly string[],
): PathExclusion {
  const path = normalizeVaultPath(sourcePath);
  const lowerPath = path.toLowerCase();

  if (!path.toLowerCase().endsWith(".md")) {
    return { excluded: true, reason: "non-Markdown file" };
  }

  for (const prefix of HARD_EXCLUDED_PREFIXES) {
    if (matchesExactOrDescendant(lowerPath, prefix.toLowerCase())) {
      return { excluded: true, reason: `protected path: ${prefix}` };
    }
  }

  if (!path.includes("/") && lowerPath === "agents.md") {
    return { excluded: true, reason: "protected root agent instructions" };
  }

  const basename = path.slice(path.lastIndexOf("/") + 1, -3).toLowerCase();
  if (basename === "__type__" || basename === "__root__") {
    return { excluded: true, reason: "protected TPS sentinel" };
  }

  for (const configuredPattern of configuredPatterns) {
    const pattern = normalizeVaultPath(configuredPattern.trim());
    if (!pattern) continue;
    if (matchesConfiguredPattern(path, pattern)) {
      return { excluded: true, reason: `configured exclusion: ${pattern}` };
    }
  }

  return { excluded: false, reason: null };
}

export function analyzeMarkdownCleanup(
  input: string,
  options: MarkdownCleanupOptions,
): MarkdownCleanupAnalysis {
  const inputSafetyBlock = inspectMarkdownInputSafety(input);
  if (inputSafetyBlock) {
    return {
      lintControls: {
        controlsPresent: false,
        disabledAll: true,
        disabledRules: new Set(),
        reason: `Safety blocked: ${inputSafetyBlock}.`,
      },
      markdown: unchangedMarkdownResult(
        input,
        [],
        null,
        inputSafetyBlock,
      ),
    };
  }

  const controls = parseLintControls(input);
  return {
    lintControls: controls,
    markdown: cleanMarkdownWithControls(input, options, controls),
  };
}

export function cleanMarkdown(
  input: string,
  options: MarkdownCleanupOptions,
): MarkdownCleanupResult {
  return analyzeMarkdownCleanup(input, options).markdown;
}

function cleanMarkdownWithControls(
  input: string,
  options: MarkdownCleanupOptions,
  controls: LintControlResult,
): MarkdownCleanupResult {
  if (controls.disabledAll) {
    return unchangedMarkdownResult(
      input,
      [],
      controls.reason ?? "TPS Linter is disabled by note-local controls.",
      null,
    );
  }

  const disabledRules = TPS_LINTER_RULE_IDS.filter(
    (rule): rule is TPSLinterRuleId =>
      rule !== "all" &&
      rule !== "filename" &&
      controls.disabledRules.has(rule),
  );
  const first = cleanMarkdownOnce(
    input,
    applyDisabledRules(options, controls.disabledRules),
    disabledRules,
  );
  if (!first.changed) return first;

  const verificationControls = parseLintControls(first.output);
  if (
    verificationControls.disabledAll ||
    !sameRuleSet(controls.disabledRules, verificationControls.disabledRules)
  ) {
    return unchangedMarkdownResult(
      input,
      disabledRules,
      null,
      "note-local controls changed during cleanup",
    );
  }

  const verification = cleanMarkdownOnce(
    first.output,
    applyDisabledRules(options, verificationControls.disabledRules),
    disabledRules,
  );
  if (
    verification.changed ||
    verification.noteDisabledReason ||
    verification.safetyBlockedReason
  ) {
    return unchangedMarkdownResult(
      input,
      disabledRules,
      null,
      verification.safetyBlockedReason
        ? `post-clean verification was blocked because ${verification.safetyBlockedReason}`
        : verification.noteDisabledReason
          ? `post-clean verification was blocked because ${verification.noteDisabledReason}`
          : "a second cleanup pass would make additional changes",
    );
  }
  return first;
}

function cleanMarkdownOnce(
  input: string,
  options: MarkdownCleanupOptions,
  disabledRules: TPSLinterRuleId[],
): MarkdownCleanupResult {
  const changes: MarkdownCleanupChanges = {
    whitespaceOnlyLinesCleaned: 0,
    extraBlankLinesRemoved: 0,
    listItemBlankLinesRemoved: 0,
    nonblankTrailingWhitespaceLinesCleaned: 0,
    trailingBlankLinesRemoved: 0,
    headingsCapitalized: 0,
    headingLevelsAdjusted: 0,
    frontmatterFieldsReordered: 0,
    leadingBlankLineAdded: false,
    frontmatterBlankLineAdded: false,
    frontmatterSortSkippedReason: null,
    finalNewlineAdded: false,
  };

  let workingInput = input;
  let preserveTerminalFrontmatterBodySlot = false;
  if (options.sortFrontmatterFields) {
    const frontmatter = sortDocumentFrontmatter(
      workingInput,
      options.frontmatterPriorityKeys,
    );
    workingInput = frontmatter.output;
    changes.frontmatterFieldsReordered = frontmatter.fieldsReordered;
    changes.frontmatterSortSkippedReason = frontmatter.skippedReason;
  }

  if (options.ensureBlankLineAfterFrontmatter) {
    const spacing = addBlankLineAfterFrontmatter(
      workingInput,
      options.cleanWhitespaceOnlyLines,
    );
    workingInput = spacing.output;
    changes.frontmatterBlankLineAdded = spacing.added;
    preserveTerminalFrontmatterBodySlot =
      spacing.preserveTerminalBodySlot === true;
  }

  if (options.ensureBlankLineAtBeginning) {
    const spacing = addBlankLineAtBeginning(workingInput);
    workingInput = spacing.output;
    changes.leadingBlankLineAdded = spacing.added;
  }

  const tokens = splitLinesPreservingEndings(workingInput);
  const processedTokens: ProcessedLineToken[] = [];
  let inFrontmatter = false;
  let fence: FenceState | null = null;
  let mathBlock: MathBlockState | null = null;
  let inIndentedCode = false;
  let lintRangeDisabled = false;
  let protectedConstructs: ProtectedConstructState = {
    comment: null,
    inTemplater: false,
    htmlDelimited: null,
    codeSpanTicks: null,
    rawHtmlTag: null,
    htmlTags: [],
    referenceTitleMayContinue: false,
  };
  const protectedSyntaxBudget: ProtectedSyntaxBudget = {
    remaining: MARKDOWN_SAFETY_LIMITS.maxProtectedTokensPerDocument,
  };
  const headingHierarchy: NormalizedHeadingLevel[] = [];
  const visibleHeadings: VisibleHeading[] = [];
  const pushHeadingHierarchyToH6 =
    options.normalizeHeadingLevels && options.pushHeadingHierarchyToH6;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    let tokenWasProtected = false;
    const comparisonBody =
      index === 0 ? token.body.replace(/^\uFEFF/, "") : token.body;

    if (protectedConstructs.referenceTitleMayContinue) {
      protectedConstructs.referenceTitleMayContinue = false;
      if (/^ {0,3}(?:"|'|\()/.test(comparisonBody)) {
        return unchangedMarkdownResult(
          input,
          disabledRules,
          null,
          "multiline Markdown reference titles require manual review",
        );
      }
    }

    if (inFrontmatter) {
      tokenWasProtected = true;
      if (/^(?:---|\.\.\.)[ \t]*$/.test(comparisonBody)) {
        inFrontmatter = false;
      }
      processedTokens.push({ ...token, protected: tokenWasProtected });
      continue;
    }

    if (fence) {
      tokenWasProtected = true;
      if (isFenceClose(comparisonBody, fence)) fence = null;
      processedTokens.push({ ...token, protected: tokenWasProtected });
      continue;
    }

    if (mathBlock) {
      tokenWasProtected = true;
      if (isMathBlockClose(comparisonBody, mathBlock)) {
        mathBlock = null;
      }
      processedTokens.push({ ...token, protected: tokenWasProtected });
      continue;
    }

    if (inIndentedCode) {
      if (
        isBlankMarkdownContainerLine(comparisonBody) ||
        isIndentedCodeLine(comparisonBody)
      ) {
        processedTokens.push({ ...token, protected: true });
        continue;
      }
      inIndentedCode = false;
    }

    if (hasActiveProtectedConstruct(protectedConstructs)) {
      const protectedState = scanProtectedConstructs(
        comparisonBody,
        protectedConstructs,
        protectedSyntaxBudget,
      );
      if (protectedState.safetyBlockedReason) {
        return unchangedMarkdownResult(
          input,
          disabledRules,
          null,
          protectedState.safetyBlockedReason,
        );
      }
      protectedConstructs = protectedState;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const lintRangeDirective = readLintRangeDirective(comparisonBody);
    if (lintRangeDisabled && lintRangeDirective === "enable") {
      lintRangeDisabled = false;
      processedTokens.push({ ...token, protected: true });
      continue;
    }
    if (!lintRangeDisabled && lintRangeDirective === "disable") {
      lintRangeDisabled = true;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    if (index === 0 && /^---[ \t]*$/.test(comparisonBody)) {
      inFrontmatter = true;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    if (isIndentedCodeLine(comparisonBody)) {
      inIndentedCode = true;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const openedFence = readFenceOpen(comparisonBody);
    if (openedFence) {
      fence = openedFence;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const openedMathBlock = readMathBlockOpen(comparisonBody);
    if (openedMathBlock !== null) {
      mathBlock = openedMathBlock;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    if (lintRangeDisabled) {
      const protectedState = scanProtectedConstructs(
        comparisonBody,
        protectedConstructs,
        protectedSyntaxBudget,
      );
      if (protectedState.safetyBlockedReason) {
        return unchangedMarkdownResult(
          input,
          disabledRules,
          null,
          protectedState.safetyBlockedReason,
        );
      }
      protectedConstructs = protectedState;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const heading = readAtxHeading(token.body);
    let headingIndex: number | undefined;
    if (heading) {
      let nextLevel = heading.level;
      if (pushHeadingHierarchyToH6) {
        headingIndex = visibleHeadings.push({
          sourceLevel: heading.level,
        }) - 1;
      } else if (options.normalizeHeadingLevels) {
        nextLevel = normalizeHeadingLevel(
          heading.level,
          options.headingStartLevel,
          headingHierarchy,
        );
      }

      const nextText = capitalizeHeadingText(
        heading.text,
        options.headingCapitalizationStyle,
      );
      if (nextLevel !== heading.level) changes.headingLevelsAdjusted += 1;
      if (nextText !== heading.text) changes.headingsCapitalized += 1;
      if (nextLevel !== heading.level || nextText !== heading.text) {
        token.body = `${heading.bom}${heading.indent}${"#".repeat(nextLevel)}${heading.separator}${nextText}${heading.closing}`;
      }
    }

    const protectedState = scanProtectedConstructs(
      comparisonBody,
      protectedConstructs,
      protectedSyntaxBudget,
    );
    if (protectedState.safetyBlockedReason) {
      return unchangedMarkdownResult(
        input,
        disabledRules,
        null,
        protectedState.safetyBlockedReason,
      );
    }
    protectedConstructs = protectedState;
    if (protectedState.protected) {
      processedTokens.push({ ...token, protected: true, headingIndex });
      continue;
    }

    if (
      options.trimNonblankTrailingWhitespace &&
      token.body.trim().length > 0
    ) {
      const trailingMatch = token.body.match(/[ \t]+$/);
      if (trailingMatch) {
        const trailing = trailingMatch[0];
        const body = token.body.slice(0, -trailing.length);
        const replacement = /^ {2,}$/.test(trailing) ? "  " : "";
        const nextBody = `${body}${replacement}`;
        if (nextBody !== token.body) {
          token.body = nextBody;
          changes.nonblankTrailingWhitespaceLinesCleaned += 1;
        }
      }
    }

    processedTokens.push({ ...token, protected: false, headingIndex });
  }

  if (pushHeadingHierarchyToH6 && visibleHeadings.length > 0) {
    const targetLevels = bottomAlignHeadingLevels(
      visibleHeadings.map((heading) => heading.sourceLevel),
    );
    for (const token of processedTokens) {
      if (token.headingIndex === undefined) continue;
      const heading = readAtxHeading(token.body);
      const targetLevel = targetLevels[token.headingIndex];
      if (!heading || targetLevel === undefined || targetLevel === heading.level) {
        continue;
      }
      token.body = `${heading.bom}${heading.indent}${"#".repeat(targetLevel)}${heading.separator}${heading.text}${heading.closing}`;
      changes.headingLevelsAdjusted += 1;
    }
  }

  const listCompaction = options.removeBlankLinesBetweenListItems
    ? compactListItemBlankLines(processedTokens)
    : { tokens: processedTokens, removed: 0 };
  changes.listItemBlankLinesRemoved = listCompaction.removed;

  for (let index = 0; index < listCompaction.tokens.length; index += 1) {
    const token = listCompaction.tokens[index];
    if (!token || token.protected || !options.cleanWhitespaceOnlyLines) {
      continue;
    }
    const whitespaceComparisonBody =
      index === 0 && options.ensureBlankLineAtBeginning
        ? token.body.replace(/^\uFEFF/, "")
        : token.body;
    if (!/^[ \t]+$/.test(whitespaceComparisonBody)) continue;
    token.body = index === 0 && token.body.startsWith("\uFEFF")
      ? "\uFEFF"
      : "";
    changes.whitespaceOnlyLinesCleaned += 1;
  }

  const retainedTokens: ProcessedLineToken[] = [];
  let previousWasCollapsibleBlank = false;
  for (let index = 0; index < listCompaction.tokens.length; index += 1) {
    const token = listCompaction.tokens[index];
    if (!token) continue;
    const blankBody = index === 0 && options.ensureBlankLineAtBeginning
      ? token.body.replace(/^\uFEFF/, "")
      : token.body;
    const blank = /^[ \t]*$/.test(blankBody);
    const collapsibleBlank = blank && !token.protected;
    if (
      options.collapseConsecutiveBlankLines &&
      collapsibleBlank &&
      previousWasCollapsibleBlank
    ) {
      changes.extraBlankLinesRemoved += 1;
      continue;
    }

    retainedTokens.push(token);
    previousWasCollapsibleBlank = collapsibleBlank;
  }

  if (options.removeTrailingBlankLines) {
    while (
      retainedTokens.length > 0 &&
      !retainedTokens.at(-1)?.protected &&
      /^[ \t]*$/.test(retainedTokens.at(-1)?.body ?? "")
    ) {
      if (
        preserveTerminalFrontmatterBodySlot &&
        retainedTokens.at(-2)?.protected
      ) {
        break;
      }
      retainedTokens.pop();
      changes.trailingBlankLinesRemoved += 1;
    }
  }

  if (
    options.ensureFinalNewline &&
    workingInput.length > 0 &&
    retainedTokens.length > 0 &&
    !retainedTokens.at(-1)?.protected
  ) {
    const last = retainedTokens.at(-1);
    if (last && last.ending === "") {
      last.ending = preferredLineEnding(retainedTokens);
      changes.finalNewlineAdded = true;
    }
  }

  const output = retainedTokens
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  const outputSafetyBlock = inspectMarkdownInputSafety(output);
  if (outputSafetyBlock) {
    return unchangedMarkdownResult(
      input,
      disabledRules,
      null,
      `cleanup output would exceed a safety limit: ${outputSafetyBlock}`,
    );
  }
  return {
    output,
    changed: output !== input,
    changes,
    disabledRules,
    noteDisabledReason: null,
    safetyBlockedReason: null,
  };
}

function applyDisabledRules(
  options: MarkdownCleanupOptions,
  disabledRules: ReadonlySet<TPSLinterRuleId>,
): MarkdownCleanupOptions {
  return {
    ...options,
    cleanWhitespaceOnlyLines:
      options.cleanWhitespaceOnlyLines &&
      !disabledRules.has("whitespace-only-lines"),
    collapseConsecutiveBlankLines:
      options.collapseConsecutiveBlankLines &&
      !disabledRules.has("blank-lines"),
    removeBlankLinesBetweenListItems:
      options.removeBlankLinesBetweenListItems &&
      !disabledRules.has("list-item-blank-lines"),
    trimNonblankTrailingWhitespace:
      options.trimNonblankTrailingWhitespace &&
      !disabledRules.has("trailing-whitespace"),
    removeTrailingBlankLines:
      options.removeTrailingBlankLines &&
      !disabledRules.has("trailing-blank-lines"),
    ensureFinalNewline:
      options.ensureFinalNewline && !disabledRules.has("final-newline"),
    ensureBlankLineAtBeginning:
      options.ensureBlankLineAtBeginning &&
      !disabledRules.has("leading-blank-line"),
    headingCapitalizationStyle: disabledRules.has("heading-capitalization")
      ? "off"
      : options.headingCapitalizationStyle,
    normalizeHeadingLevels:
      options.normalizeHeadingLevels && !disabledRules.has("heading-levels"),
    sortFrontmatterFields:
      options.sortFrontmatterFields &&
      !disabledRules.has("frontmatter-sort"),
    ensureBlankLineAfterFrontmatter:
      options.ensureBlankLineAfterFrontmatter &&
      !disabledRules.has("frontmatter-blank-line"),
  };
}

function sameRuleSet(
  left: ReadonlySet<TPSLinterRuleId>,
  right: ReadonlySet<TPSLinterRuleId>,
): boolean {
  return (
    left.size === right.size &&
    [...left].every((rule) => right.has(rule))
  );
}

function unchangedMarkdownResult(
  input: string,
  disabledRules: TPSLinterRuleId[],
  noteDisabledReason: string | null,
  safetyBlockedReason: string | null,
): MarkdownCleanupResult {
  return {
    output: input,
    changed: false,
    changes: {
      whitespaceOnlyLinesCleaned: 0,
      extraBlankLinesRemoved: 0,
      listItemBlankLinesRemoved: 0,
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
    disabledRules,
    noteDisabledReason,
    safetyBlockedReason,
  };
}

export function inspectMarkdownInputSafety(input: string): string | null {
  if (input.length > MARKDOWN_SAFETY_LIMITS.maxCharacters) {
    return `the note exceeds the ${MARKDOWN_SAFETY_LIMITS.maxCharacters.toLocaleString("en-US")}-character safety limit`;
  }

  let lineCharacters = 0;
  let lineStart = 0;
  let lineCount = input.length > 0 ? 1 : 0;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === "\r" || character === "\n") {
      if (
        exceedsMarkdownContainerDepth(input.slice(lineStart, index))
      ) {
        return `a line exceeds the ${MARKDOWN_SAFETY_LIMITS.maxContainerDepth}-container nesting safety limit`;
      }
      lineCharacters = 0;
      lineStart = index + 1;
      if (!(character === "\n" && input[index - 1] === "\r")) {
        lineCount += 1;
        if (lineCount > MARKDOWN_SAFETY_LIMITS.maxLines) {
          return `the note exceeds the ${MARKDOWN_SAFETY_LIMITS.maxLines.toLocaleString("en-US")}-line safety limit`;
        }
      }
      continue;
    }
    lineCharacters += 1;
    if (lineCharacters > MARKDOWN_SAFETY_LIMITS.maxLineCharacters) {
      return `a line exceeds the ${MARKDOWN_SAFETY_LIMITS.maxLineCharacters.toLocaleString("en-US")}-character safety limit`;
    }
  }
  if (exceedsMarkdownContainerDepth(input.slice(lineStart))) {
    return `a line exceeds the ${MARKDOWN_SAFETY_LIMITS.maxContainerDepth}-container nesting safety limit`;
  }
  return null;
}

function exceedsMarkdownContainerDepth(line: string): boolean {
  let remainder = line.replace(/^\uFEFF/, "");
  let column = 0;
  for (
    let depth = 0;
    depth <= MARKDOWN_SAFETY_LIMITS.maxContainerDepth;
    depth += 1
  ) {
    const blockquote = stripOneBlockquotePrefix(remainder, column);
    if (blockquote !== null) {
      if (depth === MARKDOWN_SAFETY_LIMITS.maxContainerDepth) {
        return true;
      }
      remainder = blockquote.content;
      column = blockquote.column;
      continue;
    }

    const list = stripDirectListMarker(remainder, column);
    if (list) {
      if (depth === MARKDOWN_SAFETY_LIMITS.maxContainerDepth) {
        return true;
      }
      remainder = list.content;
      column = list.column;
      continue;
    }
    return false;
  }
  return false;
}

interface DocumentFrontmatterSortResult {
  output: string;
  fieldsReordered: number;
  skippedReason: string | null;
}

interface FrontmatterSpacingResult {
  output: string;
  added: boolean;
  preserveTerminalBodySlot?: boolean;
}

function addBlankLineAtBeginning(input: string): FrontmatterSpacingResult {
  if (!input) return { output: input, added: false };

  const hasBom = input.startsWith("\uFEFF");
  const content = hasBom ? input.slice(1) : input;
  if (!content) return { output: input, added: false };

  const tokens = splitLinesPreservingEndings(content);
  const first = tokens[0];
  if (
    !first ||
    /^[ \t]*$/.test(first.body) ||
    /^---[ \t]*$/.test(first.body)
  ) {
    return { output: input, added: false };
  }

  const lineEnding = preferredLineEnding(tokens);
  return {
    output: hasBom
      ? `\uFEFF${lineEnding}${content}`
      : `${lineEnding}${content}`,
    added: true,
  };
}

function addBlankLineAfterFrontmatter(
  input: string,
  cleanWhitespaceOnlyLines: boolean,
): FrontmatterSpacingResult {
  const tokens = splitLinesPreservingEndings(input);
  const first = tokens[0];
  if (
    !first ||
    !/^---[ \t]*$/.test(first.body.replace(/^\uFEFF/, ""))
  ) {
    return { output: input, added: false };
  }

  const closingIndex = tokens.findIndex(
    (token, index) =>
      index > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(token.body),
  );
  const closing = tokens[closingIndex];
  if (closingIndex < 0 || !closing) {
    return { output: input, added: false };
  }

  const frontmatterBody = tokens
    .slice(1, closingIndex)
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  if (inspectTopLevelFrontmatterSafety(frontmatterBody) !== null) {
    return { output: input, added: false };
  }

  const bodyTokens = tokens.slice(closingIndex + 1);
  const hasNonblankBody = bodyTokens.some(
    (token) => !/^[ \t]*$/.test(token.body),
  );
  const firstBody = tokens[closingIndex + 1];
  const firstBodyIsWhitespaceOnly =
    firstBody !== undefined && /^[ \t]*$/.test(firstBody.body);
  const cleanedSeparatorWouldMergeWithClosing =
    firstBody !== undefined &&
    firstBody.body.length > 0 &&
    firstBodyIsWhitespaceOnly &&
    cleanWhitespaceOnlyLines &&
    closing.ending === "\r" &&
    firstBody.ending === "\n";
  if (!hasNonblankBody) {
    if (cleanedSeparatorWouldMergeWithClosing) {
      const output = [
        ...tokens.slice(0, closingIndex + 1),
        { body: "", ending: closing.ending },
        ...tokens.slice(closingIndex + 1),
      ]
        .map((token) => `${token.body}${token.ending}`)
        .join("");
      return {
        output,
        added: true,
        preserveTerminalBodySlot: true,
      };
    }

    const lineEnding = closing.ending || preferredLineEnding(tokens);
    const hasTerminatedBodySlot = bodyTokens.some(
      (token) => token.ending !== "",
    );
    const missingEndings =
      closing.ending === ""
        ? `${lineEnding}${lineEnding}`
        : hasTerminatedBodySlot
          ? ""
          : lineEnding;
    return {
      output: `${input}${missingEndings}`,
      added: missingEndings.length > 0,
      preserveTerminalBodySlot: true,
    };
  }

  if (
    closing.ending === "" ||
    !firstBody ||
    (firstBodyIsWhitespaceOnly && !cleanedSeparatorWouldMergeWithClosing)
  ) {
    return { output: input, added: false };
  }

  const output = [
    ...tokens.slice(0, closingIndex + 1),
    { body: "", ending: closing.ending },
    ...tokens.slice(closingIndex + 1),
  ]
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  return { output, added: true };
}

function sortDocumentFrontmatter(
  input: string,
  priorityKeys: readonly string[],
): DocumentFrontmatterSortResult {
  const tokens = splitLinesPreservingEndings(input);
  const first = tokens[0];
  if (
    !first ||
    !/^---[ \t]*$/.test(first.body.replace(/^\uFEFF/, ""))
  ) {
    return { output: input, fieldsReordered: 0, skippedReason: null };
  }

  const closingIndex = tokens.findIndex(
    (token, index) =>
      index > 0 && /^(?:---|\.\.\.)[ \t]*$/.test(token.body),
  );
  if (closingIndex < 0) {
    return {
      output: input,
      fieldsReordered: 0,
      skippedReason: "the frontmatter block is not closed",
    };
  }

  const body = tokens
    .slice(1, closingIndex)
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  if (body.trim().length === 0) {
    return { output: input, fieldsReordered: 0, skippedReason: null };
  }

  const sorted = sortTopLevelFrontmatterFields(body, priorityKeys);
  if (sorted.skippedReason) {
    return {
      output: input,
      fieldsReordered: 0,
      skippedReason: sorted.skippedReason,
    };
  }
  if (!sorted.changed) {
    return { output: input, fieldsReordered: 0, skippedReason: null };
  }

  const before = tokens
    .slice(0, 1)
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  const after = tokens
    .slice(closingIndex)
    .map((token) => `${token.body}${token.ending}`)
    .join("");
  return {
    output: `${before}${sorted.output}${after}`,
    fieldsReordered: sorted.fieldsReordered,
    skippedReason: null,
  };
}

interface AtxHeading {
  bom: string;
  indent: string;
  level: number;
  separator: string;
  text: string;
  closing: string;
}

function readAtxHeading(line: string): AtxHeading | null {
  const bom = line.startsWith("\uFEFF") ? "\uFEFF" : "";
  const match = line.slice(bom.length).match(
    /^( {0,3})(#{1,6})([ \t]+)(.*?)([ \t]+#{1,}[ \t]*)?$/,
  );
  if (!match?.[1] && match?.[1] !== "") return null;
  const marker = match[2];
  const separator = match[3];
  const text = match[4];
  if (!marker || !separator || text === undefined) return null;
  return {
    bom,
    indent: match[1],
    level: marker.length,
    separator,
    text,
    closing: match[5] ?? "",
  };
}

function normalizeHeadingLevel(
  sourceLevel: number,
  startLevel: 1 | 2,
  hierarchy: NormalizedHeadingLevel[],
): number {
  const current = hierarchy.at(-1);
  if (!current) {
    hierarchy.push({ source: sourceLevel, target: startLevel });
    return startLevel;
  }

  if (sourceLevel > current.source) {
    const target = Math.min(6, current.target + 1);
    hierarchy.push({ source: sourceLevel, target });
    return target;
  }

  if (sourceLevel === current.source) {
    return current.target;
  }

  let previousTarget: number | null = null;
  for (let index = hierarchy.length - 1; index >= 0; index -= 1) {
    const entry = hierarchy[index];
    if (entry?.source !== sourceLevel) continue;
    previousTarget = entry.target;
    break;
  }
  while (
    hierarchy.length > 0 &&
    (hierarchy.at(-1)?.source ?? 0) >= sourceLevel
  ) {
    hierarchy.pop();
  }

  const parent = hierarchy.at(-1);
  const target =
    previousTarget ??
    (parent ? Math.min(6, parent.target + 1) : startLevel);
  hierarchy.push({ source: sourceLevel, target });
  return target;
}

function bottomAlignHeadingLevels(sourceLevels: readonly number[]): number[] {
  const stack: number[] = [];
  const depths: number[] = [];

  for (let index = 0; index < sourceLevels.length; index += 1) {
    const sourceLevel = sourceLevels[index];
    if (sourceLevel === undefined) continue;
    while (
      stack.length > 0 &&
      (sourceLevels[stack.at(-1) ?? -1] ?? 0) >= sourceLevel
    ) {
      stack.pop();
    }
    depths.push(stack.length);
    stack.push(index);
  }

  const deepestLevel = Math.max(0, ...depths);
  const firstTargetLevel = Math.max(1, 6 - deepestLevel);
  return depths.map((depth) => Math.min(6, firstTargetLevel + depth));
}

function capitalizeHeadingText(
  text: string,
  style: HeadingCapitalizationStyle,
): string {
  if (style === "off" || !isPlainHeadingText(text)) return text;
  if (style === "first-letter") return capitalizeFirstLetter(text);

  const matches = [...text.matchAll(/\p{L}[\p{L}\p{M}'’.-]*/gu)];
  if (matches.length === 0) return text;
  let cursor = 0;
  let output = "";
  matches.forEach((match, index) => {
    const word = match[0];
    const start = match.index ?? cursor;
    output += text.slice(cursor, start);
    output += titleCaseWord(word, index, matches.length);
    cursor = start + word.length;
  });
  return output + text.slice(cursor);
}

function isPlainHeadingText(text: string): boolean {
  return !(
    /[#\[\]`$@<>^]|%%|<%|%>|\{\{|\}\}|::/.test(text) ||
    /\\[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(text) ||
    text.includes("/") ||
    text.includes("%") ||
    /(?:^|[^\p{L}\p{N}+.-])[A-Za-z][A-Za-z0-9+.-]*:(?:[^\s]|$)/u.test(
      text,
    ) ||
    hasDotJoinedWordCharacters(text) ||
    /&(?:#\d{1,7}|#x[\dA-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/.test(
      text,
    ) ||
    /(?:^|\s)\^[\p{L}\p{N}-]+[ \t]*$/u.test(text)
  );
}

function hasDotJoinedWordCharacters(text: string): boolean {
  const characters = [...text];
  for (let index = 1; index < characters.length - 1; index += 1) {
    if (!isDomainDot(characters[index])) continue;
    if (
      isUnicodeWordCharacter(characters[index - 1]) &&
      isUnicodeWordCharacter(characters[index + 1])
    ) {
      return true;
    }
  }
  return false;
}

function isDomainDot(character: string | undefined): boolean {
  return (
    character === "." ||
    character === "。" ||
    character === "．" ||
    character === "｡"
  );
}

function isUnicodeWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{M}\p{N}]/u.test(character);
}

function capitalizeFirstLetter(text: string): string {
  const match = /\p{L}/u.exec(text);
  if (!match || match.index < 0) return text;
  const letter = match[0];
  const uppercase = letter.toUpperCase();
  if (uppercase === letter) return text;
  return `${text.slice(0, match.index)}${uppercase}${text.slice(match.index + letter.length)}`;
}

function titleCaseWord(
  word: string,
  index: number,
  wordCount: number,
): string {
  const lowercase = word.toLowerCase();
  if (word !== lowercase) return word;
  if (
    index > 0 &&
    index < wordCount - 1 &&
    TITLE_CASE_MINOR_WORDS.has(lowercase)
  ) {
    return word;
  }
  return word.replace(
    /(^|[-–—])(\p{Ll})/gu,
    (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toUpperCase()}`,
  );
}

function invalidFilenamePlan(
  sourcePath: string,
  filename: string,
  blockReason: string,
): FilenamePlan {
  const extensionIndex = filename.lastIndexOf(".");
  const sourceBasename =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return {
    sourcePath,
    targetPath: sourcePath,
    sourceBasename,
    targetBasename: sourceBasename,
    changed: false,
    valid: false,
    changes: [],
    blockReason,
  };
}

function replacementForStyle(style: FilenameUnsafeCharacterStyle): string {
  if (style === "dash") return "-";
  if (style === "remove") return "";
  return " ";
}

function normalizeVaultPath(value: string): string {
  return value
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
}

function collisionKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function matchesExactOrDescendant(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function matchesConfiguredPattern(path: string, pattern: string): boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}(?:$|/)`, "i").test(path);
}

function splitLinesPreservingEndings(input: string): LineToken[] {
  if (!input) return [];

  const tokens: LineToken[] = [];
  let lineStart = 0;
  let index = 0;

  while (index < input.length) {
    const character = input[index];
    if (character !== "\r" && character !== "\n") {
      index += 1;
      continue;
    }

    let ending: LineToken["ending"];
    if (character === "\r" && input[index + 1] === "\n") {
      ending = "\r\n";
      tokens.push({ body: input.slice(lineStart, index), ending });
      index += 2;
    } else {
      ending = character;
      tokens.push({ body: input.slice(lineStart, index), ending });
      index += 1;
    }
    lineStart = index;
  }

  if (lineStart < input.length) {
    tokens.push({ body: input.slice(lineStart), ending: "" });
  }

  return tokens;
}

function compactListItemBlankLines(
  tokens: readonly ProcessedLineToken[],
): { tokens: ProcessedLineToken[]; removed: number } {
  const compacted: ProcessedLineToken[] = [];
  const provenOrderedItems = new Set<number>();
  let removed = 0;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) {
      index += 1;
      continue;
    }
    compacted.push(token);

    const currentSignature = token.protected
      ? null
      : readListItemSignature(token.body, index === 0);
    if (
      !currentSignature ||
      !isProvenListItem(
        tokens,
        index,
        currentSignature,
        provenOrderedItems,
      )
    ) {
      index += 1;
      continue;
    }
    if (currentSignature.orderedNumber !== null) {
      provenOrderedItems.add(index);
    }

    let nextIndex = index + 1;
    while (
      nextIndex < tokens.length &&
      isBlankListSeparator(
        tokens[nextIndex],
        currentSignature.containerPath,
      )
    ) {
      nextIndex += 1;
    }
    if (nextIndex === index + 1) {
      index += 1;
      continue;
    }

    const nextToken = tokens[nextIndex];
    const nextSignature =
      nextToken && !nextToken.protected
        ? readListItemSignature(nextToken.body, nextIndex === 0)
        : null;
    if (
      nextSignature &&
      sameListItemSignature(currentSignature, nextSignature)
    ) {
      if (nextSignature.orderedNumber !== null) {
        provenOrderedItems.add(nextIndex);
      }
      removed += nextIndex - index - 1;
      index = nextIndex;
      continue;
    }

    index += 1;
  }

  return { tokens: compacted, removed };
}

function readListItemSignature(
  line: string,
  allowLeadingBom: boolean,
): ListItemSignature | null {
  const comparableLine = allowLeadingBom
    ? line.replace(/^\uFEFF/, "")
    : line;
  for (const candidate of markdownContainerCandidates(comparableLine, false)) {
    if (isThematicBreakCandidate(candidate.content)) continue;
    const marker = stripDirectListMarker(
      candidate.content,
      candidate.column,
    );
    if (!marker || !/[^ \t]/.test(marker.content)) continue;

    const category = /^\[[^\]\r\n]\](?:[ \t]+|$)/.test(
      marker.content,
    )
      ? "task"
      : "plain";
    const ordered = /^(\d{1,9})([.)])$/.exec(marker.marker);
    const markerClass = ordered
      ? `ordered:${ordered[2]}:${category}`
      : `bullet:${marker.marker}:${category}`;
    return {
      containerPath: candidate.containerPath,
      markerIndent: marker.markerIndent,
      markerClass,
      orderedNumber: ordered ? Number.parseInt(ordered[1] ?? "", 10) : null,
    };
  }
  return null;
}

function isProvenListItem(
  tokens: readonly ProcessedLineToken[],
  index: number,
  signature: ListItemSignature,
  provenOrderedItems: ReadonlySet<number>,
): boolean {
  if (
    signature.orderedNumber === null ||
    signature.orderedNumber === 1 ||
    index === 0
  ) {
    return true;
  }

  if (isBlankListSeparator(tokens[index - 1], signature.containerPath)) {
    return true;
  }

  const previousToken = tokens[index - 1];
  const previousSignature =
    previousToken && !previousToken.protected
      ? readListItemSignature(previousToken.body, index - 1 === 0)
      : null;
  return Boolean(
    previousSignature &&
      previousSignature.orderedNumber !== null &&
      sameListItemSignature(previousSignature, signature) &&
      provenOrderedItems.has(index - 1),
  );
}

function isBlankListSeparator(
  token: ProcessedLineToken | undefined,
  containerPath: readonly ContainerStep[],
): boolean {
  if (!token || token.protected) return false;
  const content = stripContainerContinuation(token.body, containerPath);
  return content !== null && /^[ \t]*$/.test(content);
}

function sameListItemSignature(
  left: ListItemSignature,
  right: ListItemSignature,
): boolean {
  return (
    left.markerIndent === right.markerIndent &&
    left.markerClass === right.markerClass &&
    serializeContainerPath(left.containerPath) ===
      serializeContainerPath(right.containerPath)
  );
}

function isThematicBreakCandidate(line: string): boolean {
  const content = line.trim();
  return (
    /^(?:-[ \t]*){3,}$/.test(content) ||
    /^(?:\*[ \t]*){3,}$/.test(content) ||
    /^(?:_[ \t]*){3,}$/.test(content)
  );
}

function readLintRangeDirective(
  line: string,
): "disable" | "enable" | null {
  const match = line.match(
    /^ {0,3}(?:<!--\s*tps-linter-(disable|enable)\s*-->|%%\s*tps-linter-(disable|enable)\s*%%)[ \t]*$/,
  );
  const directive = match?.[1] ?? match?.[2];
  return directive === "disable" || directive === "enable"
    ? directive
    : null;
}

function readFenceOpen(line: string): FenceState | null {
  for (const candidate of markdownContainerCandidates(line, true)) {
    const content = expandLeadingMarkdownIndent(
      candidate.content,
      candidate.column,
    );
    const match = content.match(/^ {0,3}(`{3,}|~{3,})/);
    const run = match?.[1];
    if (!run) continue;
    return {
      marker: run[0] as FenceState["marker"],
      length: run.length,
      containerPath: candidate.containerPath,
    };
  }
  return null;
}

function isIndentedCodeLine(line: string): boolean {
  if (line.trim().length === 0) return false;
  for (const candidate of markdownContainerCandidates(line, true)) {
    if (
      leadingMarkdownIndentColumns(
        candidate.content,
        candidate.column,
      ) >= 4 ||
      hasIndentedCodeAfterListMarker(
        candidate.content,
        candidate.column,
      )
    ) {
      return true;
    }
  }
  return false;
}

function isBlankMarkdownContainerLine(line: string): boolean {
  return markdownContainerCandidates(line, true).some(
    (candidate) => candidate.content.trim().length === 0,
  );
}

function leadingMarkdownIndentColumns(
  line: string,
  startColumn: number,
): number {
  let cursor = 0;
  let column = startColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    column = advanceMarkdownColumn(column, character);
    cursor += 1;
  }
  return column - startColumn;
}

function hasIndentedCodeAfterListMarker(
  line: string,
  startColumn: number,
): boolean {
  let cursor = 0;
  let column = startColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    const nextColumn = advanceMarkdownColumn(column, character);
    if (nextColumn - startColumn > 3) return false;
    column = nextColumn;
    cursor += 1;
  }

  const marker = /^(?:[-+*]|\d{1,9}[.)])/.exec(
    line.slice(cursor),
  )?.[0];
  if (!marker) return false;
  cursor += marker.length;
  const markerColumn = column + marker.length;
  let contentColumn = markerColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    contentColumn = advanceMarkdownColumn(contentColumn, character);
    cursor += 1;
  }

  return (
    cursor < line.length &&
    contentColumn - markerColumn > 4
  );
}

function isFenceClose(line: string, fence: FenceState): boolean {
  const marker = fence.marker === "`" ? "`" : "~";
  const content = stripContainerContinuation(
    line,
    fence.containerPath,
  );
  return (
    content !== null &&
    new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(content)
  );
}

function readMathBlockOpen(line: string): MathBlockState | null {
  for (const candidate of markdownContainerCandidates(line, true)) {
    const content = expandLeadingMarkdownIndent(
      candidate.content,
      candidate.column,
    );
    if (/^ {0,3}\$\$[ \t]*$/.test(content)) {
      return {
        containerPath: candidate.containerPath,
      };
    }
  }
  return null;
}

function isMathBlockClose(line: string, state: MathBlockState): boolean {
  const content = stripContainerContinuation(
    line,
    state.containerPath,
  );
  return content !== null && /^ {0,3}\$\$[ \t]*$/.test(content);
}

function markdownContainerCandidates(
  line: string,
  includeDirectListMarker: boolean,
): DelimiterCandidate[] {
  const candidates: DelimiterCandidate[] = [
    { content: line, containerPath: [], column: 0 },
  ];
  const seen = new Set<string>();
  const output: DelimiterCandidate[] = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    const key =
      `${serializeContainerPath(candidate.containerPath)}\u0000` +
      `${candidate.column}\u0000${candidate.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);

    const blockquote = stripOneBlockquotePrefix(
      candidate.content,
      candidate.column,
    );
    if (blockquote !== null) {
      candidates.push({
        content: blockquote.content,
        containerPath: [
          ...candidate.containerPath,
          { kind: "blockquote" },
        ],
        column: blockquote.column,
      });
    }

    if (includeDirectListMarker) {
      const list = stripDirectListMarker(
        candidate.content,
        candidate.column,
      );
      if (list) {
        candidates.push({
          content: list.content,
          containerPath: [
            ...candidate.containerPath,
            { kind: "list", indent: list.indent },
          ],
          column: list.column,
        });
      }
    }
  }

  return output;
}

function serializeContainerPath(path: readonly ContainerStep[]): string {
  return path
    .map((step) =>
      step.kind === "blockquote" ? "blockquote" : `list:${step.indent}`,
    )
    .join("/");
}

function stripOneBlockquotePrefix(
  line: string,
  startColumn = 0,
): { content: string; column: number } | null {
  let cursor = 0;
  let column = startColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    const nextColumn = advanceMarkdownColumn(column, character);
    if (nextColumn - startColumn > 3) return null;
    column = nextColumn;
    cursor += 1;
  }
  if (line[cursor] !== ">") return null;
  column += 1;
  cursor += 1;
  let residualSpaces = "";
  if (line[cursor] === " ") {
    column += 1;
    cursor += 1;
  } else if (line[cursor] === "\t") {
    const tabEndColumn = advanceMarkdownColumn(column, "\t");
    column += 1;
    residualSpaces = " ".repeat(tabEndColumn - column);
    cursor += 1;
  }
  return {
    content: `${residualSpaces}${line.slice(cursor)}`,
    column,
  };
}

function stripDirectListMarker(
  line: string,
  startColumn = 0,
): {
  content: string;
  indent: number;
  column: number;
  marker: string;
  markerIndent: number;
} | null {
  let cursor = 0;
  let column = startColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    const nextColumn = advanceMarkdownColumn(column, character);
    if (nextColumn - startColumn > 3) return null;
    column = nextColumn;
    cursor += 1;
  }
  const marker = /^(?:[-+*]|\d{1,9}[.)])/.exec(
    line.slice(cursor),
  )?.[0];
  if (!marker) return null;

  cursor += marker.length;
  const markerColumn = column + marker.length;
  let contentColumn = markerColumn;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    contentColumn = advanceMarkdownColumn(contentColumn, character);
    cursor += 1;
    if (contentColumn - markerColumn > 4) return null;
  }
  const paddingColumns = contentColumn - markerColumn;
  if (paddingColumns < 1 || paddingColumns > 4) return null;

  return {
    content: line.slice(cursor),
    indent: contentColumn - startColumn,
    column: contentColumn,
    marker,
    markerIndent: markerColumn - marker.length - startColumn,
  };
}

function advanceMarkdownColumn(column: number, character: string): number {
  return character === "\t"
    ? column + (4 - (column % 4))
    : column + 1;
}

function expandLeadingMarkdownIndent(
  line: string,
  startColumn: number,
): string {
  let cursor = 0;
  let column = startColumn;
  let spaces = "";
  while (cursor < line.length) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") break;
    const nextColumn = advanceMarkdownColumn(column, character);
    spaces += " ".repeat(nextColumn - column);
    column = nextColumn;
    cursor += 1;
  }
  return `${spaces}${line.slice(cursor)}`;
}

function stripRequiredIndent(
  line: string,
  indent: number,
  startColumn: number,
): { content: string; column: number } | null {
  if (indent === 0) return { content: line, column: startColumn };
  let cursor = 0;
  let column = startColumn;
  const targetColumn = startColumn + indent;
  while (cursor < line.length && column < targetColumn) {
    const character = line[cursor];
    if (character !== " " && character !== "\t") return null;
    column = advanceMarkdownColumn(column, character);
    cursor += 1;
  }
  if (column < targetColumn) return null;
  return {
    content:
      `${" ".repeat(column - targetColumn)}${line.slice(cursor)}`,
    column: targetColumn,
  };
}

function stripContainerContinuation(
  line: string,
  path: readonly ContainerStep[],
): string | null {
  let remainder = line;
  let column = 0;
  for (const step of path) {
    if (step.kind === "blockquote") {
      const next = stripOneBlockquotePrefix(remainder, column);
      if (next === null) return null;
      remainder = next.content;
      column = next.column;
      continue;
    }

    const next = stripRequiredIndent(remainder, step.indent, column);
    if (next === null) return null;
    remainder = next.content;
    column = next.column;
  }
  return expandLeadingMarkdownIndent(remainder, column);
}

function hasActiveProtectedConstruct(
  state: ProtectedConstructState,
): boolean {
  return (
    state.comment !== null ||
    state.inTemplater ||
    state.htmlDelimited !== null ||
    state.codeSpanTicks !== null ||
    state.rawHtmlTag !== null ||
    state.htmlTags.length > 0
  );
}

function scanProtectedConstructs(
  line: string,
  initialState: ProtectedConstructState,
  documentBudget: ProtectedSyntaxBudget,
): ProtectedConstructScan {
  let comment = initialState.comment;
  let inTemplater = initialState.inTemplater;
  let htmlDelimited = initialState.htmlDelimited;
  let codeSpanTicks = initialState.codeSpanTicks;
  let rawHtmlTag = initialState.rawHtmlTag;
  const htmlTags = [...initialState.htmlTags];
  let referenceTitleMayContinue =
    initialState.referenceTitleMayContinue;
  let cursor = 0;
  let protectedTokenCount = 0;
  let protectedLine = hasActiveProtectedConstruct(initialState);

  while (cursor < line.length) {
    if (comment === "obsidian") {
      const closeIndex = line.indexOf("%%", cursor);
      if (closeIndex < 0) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor = closeIndex + 2;
      comment = null;
      continue;
    }

    if (comment === "html") {
      const closeIndex = line.indexOf("-->", cursor);
      if (closeIndex < 0) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor = closeIndex + 3;
      comment = null;
      continue;
    }

    if (inTemplater) {
      const closeIndex = line.indexOf("%>", cursor);
      if (closeIndex < 0) {
        return {
          comment,
          inTemplater: true,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor = closeIndex + 2;
      inTemplater = false;
      continue;
    }

    if (htmlDelimited) {
      const closeIndex = line.indexOf(
        htmlDelimitedClose(htmlDelimited),
        cursor,
      );
      if (closeIndex < 0) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor =
        closeIndex + htmlDelimitedClose(htmlDelimited).length;
      htmlDelimited = null;
      continue;
    }

    if (rawHtmlTag) {
      const close = findRawHtmlClose(line, cursor, rawHtmlTag);
      if (close < 0) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor = close;
      rawHtmlTag = null;
      continue;
    }

    if (codeSpanTicks !== null) {
      const closingRun = findMatchingBacktickRun(
        line,
        cursor,
        codeSpanTicks,
      );
      if (!closingRun) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
        };
      }
      cursor = closingRun.end;
      codeSpanTicks = null;
      continue;
    }

    const token = findNextProtectedToken(line, cursor);
    if (!token) break;
    protectedTokenCount += 1;
    documentBudget.remaining -= 1;
    if (
      protectedTokenCount >
      MARKDOWN_SAFETY_LIMITS.maxProtectedTokensPerLine
    ) {
      return {
        comment,
        inTemplater,
        htmlDelimited,
        codeSpanTicks,
        rawHtmlTag,
        htmlTags,
        referenceTitleMayContinue,
        protected: true,
        safetyBlockedReason:
          "a line exceeds the protected-syntax work budget",
      };
    }
    if (documentBudget.remaining < 0) {
      return {
        comment,
        inTemplater,
        htmlDelimited,
        codeSpanTicks,
        rawHtmlTag,
        htmlTags,
        referenceTitleMayContinue,
        protected: true,
        safetyBlockedReason:
          "the note exceeds the protected-syntax work budget",
      };
    }

    if (token.kind === "unsafe") {
      return {
        comment,
        inTemplater,
        htmlDelimited,
        codeSpanTicks,
        rawHtmlTag,
        htmlTags,
        referenceTitleMayContinue,
        protected: true,
        safetyBlockedReason: token.reason,
      };
    }

    if (token.kind !== "inline-opaque" || token.protectLine === true) {
      protectedLine = true;
    }
    cursor = token.end;
    if (token.kind === "obsidian-comment") {
      comment = "obsidian";
    } else if (token.kind === "html-comment") {
      comment = "html";
    } else if (token.kind === "templater") {
      inTemplater = true;
    } else if (token.kind === "html-delimited") {
      htmlDelimited = token.construct;
    } else if (token.kind === "code-span") {
      codeSpanTicks = token.ticks;
    } else if (token.kind === "inline-opaque") {
      // The complete inline span was consumed by the token.
      referenceTitleMayContinue =
        token.referenceTitleMayContinue === true;
    } else if (token.kind === "html-tag") {
      if (!token.complete) {
        return {
          comment,
          inTemplater,
          htmlDelimited,
          codeSpanTicks,
          rawHtmlTag,
          htmlTags,
          referenceTitleMayContinue,
          protected: true,
          safetyBlockedReason:
            "multiline or unclosed HTML tags require manual review",
        };
      }
      if (
        !token.closing &&
        !token.selfClosing &&
        RAW_HTML_TAGS.has(token.name as RawHtmlTag)
      ) {
        rawHtmlTag = token.name as RawHtmlTag;
      } else {
        updateHtmlTagStack(htmlTags, token);
      }
    }
  }

  return {
    comment,
    inTemplater,
    htmlDelimited,
    codeSpanTicks,
    rawHtmlTag,
    htmlTags,
    referenceTitleMayContinue,
    protected: protectedLine,
  };
}

function findNextProtectedToken(
  line: string,
  fromIndex: number,
): ProtectedToken | null {
  const tokens: ProtectedToken[] = [];
  const obsidianIndex = findNextUnescapedLiteral(line, "%%", fromIndex);
  if (obsidianIndex >= 0) {
    tokens.push({
      kind: "obsidian-comment",
      index: obsidianIndex,
      end: obsidianIndex + 2,
    });
  }

  const htmlCommentIndex = findNextUnescapedLiteral(
    line,
    "<!--",
    fromIndex,
  );
  if (htmlCommentIndex >= 0) {
    tokens.push({
      kind: "html-comment",
      index: htmlCommentIndex,
      end: htmlCommentIndex + 4,
    });
  }

  const templaterIndex = findNextUnescapedLiteral(line, "<%", fromIndex);
  if (templaterIndex >= 0) {
    tokens.push({
      kind: "templater",
      index: templaterIndex,
      end: templaterIndex + 2,
    });
  }

  const processingInstructionIndex = findNextUnescapedLiteral(
    line,
    "<?",
    fromIndex,
  );
  if (processingInstructionIndex >= 0) {
    tokens.push({
      kind: "html-delimited",
      index: processingInstructionIndex,
      end: processingInstructionIndex + 2,
      construct: "processing-instruction",
    });
  }

  const cdataIndex = findNextUnescapedLiteral(
    line,
    "<![CDATA[",
    fromIndex,
  );
  if (cdataIndex >= 0) {
    tokens.push({
      kind: "html-delimited",
      index: cdataIndex,
      end: cdataIndex + "<![CDATA[".length,
      construct: "cdata",
    });
  }

  const declarationPattern = /<![A-Z]/g;
  declarationPattern.lastIndex = fromIndex;
  let declaration = declarationPattern.exec(line);
  while (
    declaration &&
    declaration.index >= 0 &&
    isBackslashEscaped(line, declaration.index)
  ) {
    declaration = declarationPattern.exec(line);
  }
  if (declaration && declaration.index >= 0) {
    tokens.push({
      kind: "html-delimited",
      index: declaration.index,
      end: declarationPattern.lastIndex,
      construct: "declaration",
    });
  }

  const inlineOpaque = findNextInlineOpaqueSpan(line, fromIndex);
  if (inlineOpaque) tokens.push(inlineOpaque);

  const markdownLink = findNextMarkdownLinkToken(line, fromIndex);
  if (markdownLink) tokens.push(markdownLink);

  const codeSpan = findNextCodeSpan(line, fromIndex);
  if (codeSpan) tokens.push(codeSpan);

  const htmlTag = findNextHtmlTag(line, fromIndex);
  if (htmlTag) tokens.push({ kind: "html-tag", ...htmlTag });

  tokens.sort(
    (left, right) =>
      left.index - right.index ||
      protectedTokenPriority(left) - protectedTokenPriority(right),
  );
  return tokens[0] ?? null;
}

function protectedTokenPriority(token: ProtectedToken): number {
  if (token.kind === "unsafe") return 0;
  if (token.kind === "inline-opaque") return 0;
  if (token.kind === "code-span") return 1;
  return 2;
}

function findNextInlineOpaqueSpan(
  line: string,
  fromIndex: number,
): Extract<ProtectedToken, { kind: "inline-opaque" }> | null {
  const candidates = [
    findNextWikiOrInlineFieldSpan(line, fromIndex),
    findNextInlineMathSpan(line, fromIndex),
  ].filter(
    (
      candidate,
    ): candidate is Extract<
      ProtectedToken,
      { kind: "inline-opaque" }
    > => candidate !== null,
  );
  candidates.sort(
    (left, right) =>
      left.index - right.index || right.end - left.end,
  );
  return candidates[0] ?? null;
}

function findNextWikiOrInlineFieldSpan(
  line: string,
  fromIndex: number,
): Extract<ProtectedToken, { kind: "inline-opaque" }> | null {
  const wikiStart = findNextUnescapedLiteral(line, "[[", fromIndex);
  const wikiEnd =
    wikiStart >= 0
      ? findNextUnescapedLiteral(line, "]]", wikiStart + 2)
      : -1;

  const field = findNextInlineFieldSpan(line, fromIndex);

  const candidates: Array<
    Extract<ProtectedToken, { kind: "inline-opaque" }>
  > = [];
  if (wikiStart >= 0 && wikiEnd >= 0) {
    candidates.push({
      kind: "inline-opaque",
      index: wikiStart,
      end: wikiEnd + 2,
    });
  }
  if (field) candidates.push(field);
  candidates.sort((left, right) => left.index - right.index);
  return candidates[0] ?? null;
}

function findNextInlineFieldSpan(
  line: string,
  fromIndex: number,
): Extract<ProtectedToken, { kind: "inline-opaque" }> | null {
  let opening = -1;
  let hasSeparator = false;
  let escaped = false;

  for (let index = fromIndex; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      escaped = !escaped;
      continue;
    }
    const currentEscaped = escaped;
    escaped = false;

    if (character === "[" && !currentEscaped) {
      opening = index;
      hasSeparator = false;
      continue;
    }
    if (
      opening >= 0 &&
      character === ":" &&
      line[index + 1] === ":" &&
      !currentEscaped
    ) {
      hasSeparator = true;
      index += 1;
      continue;
    }
    if (character !== "]" || currentEscaped || opening < 0) continue;
    if (hasSeparator) {
      return {
        kind: "inline-opaque",
        index: opening,
        end: index + 1,
      };
    }
    opening = -1;
  }
  return null;
}

type MarkdownLinkToken = Extract<
  ProtectedToken,
  { kind: "inline-opaque" | "unsafe" }
>;

function findNextMarkdownLinkToken(
  line: string,
  fromIndex: number,
): MarkdownLinkToken | null {
  if (fromIndex === 0) {
    const reference = parseReferenceDefinition(line);
    if (reference.kind === "valid") {
      if (containsStrongProtectedDelimiter(line.slice(0, reference.end))) {
        return unsafeMarkdownToken(
          0,
          reference.end,
          "a Markdown reference definition contains ambiguous protected syntax",
        );
      }
      return {
        kind: "inline-opaque",
        index: 0,
        end: reference.end,
        referenceTitleMayContinue:
          reference.referenceTitleMayContinue,
        protectLine: true,
      };
    }
    if (reference.kind === "unsafe") {
      return unsafeMarkdownToken(0, line.length, reference.reason);
    }
  }

  const bracketPattern = /\[/g;
  bracketPattern.lastIndex = fromIndex;
  for (
    let opening = bracketPattern.exec(line);
    opening;
    opening = bracketPattern.exec(line)
  ) {
    if (isBackslashEscaped(line, opening.index)) continue;
    const labelEnd = findMatchingMarkdownBracket(line, opening.index);
    if (labelEnd === null) {
      return unsafeMarkdownToken(
        opening.index,
        line.length,
        "multiline or unclosed Markdown labels require manual review",
      );
    }

    const isImage =
      opening.index > 0 &&
      line[opening.index - 1] === "!" &&
      !isBackslashEscaped(line, opening.index - 1);
    const tokenStart = isImage ? opening.index - 1 : opening.index;
    const next = line[labelEnd];
    let tokenEnd: number | null = null;
    let referenceStyle = false;

    if (next === "(") {
      tokenEnd = parseInlineLinkClose(line, labelEnd);
      if (tokenEnd === null) {
        const laxEnd = findBalancedLinkClose(line, labelEnd);
        if (laxEnd === null) {
          return unsafeMarkdownToken(
            tokenStart,
            line.length,
            "multiline or unclosed Markdown links require manual review",
          );
        }
        if (
          containsRiskyMarkdownMaskSyntax(
            line.slice(tokenStart, laxEnd),
          )
        ) {
          return unsafeMarkdownToken(
            tokenStart,
            laxEnd,
            "an invalid Markdown link contains ambiguous protected syntax",
          );
        }
        bracketPattern.lastIndex = labelEnd;
        continue;
      }
    } else if (next === "[") {
      referenceStyle = true;
      tokenEnd = findMatchingMarkdownBracket(line, labelEnd);
      if (tokenEnd === null) {
        return unsafeMarkdownToken(
          tokenStart,
          line.length,
          "multiline or unclosed Markdown reference links require manual review",
        );
      }
    } else if (
      containsRiskyMarkdownMaskSyntax(
        line.slice(tokenStart, labelEnd),
      )
    ) {
      return unsafeMarkdownToken(
        tokenStart,
        labelEnd,
        "a shortcut Markdown reference contains ambiguous protected syntax",
      );
    } else {
      continue;
    }

    if (
      (referenceStyle &&
        containsRiskyMarkdownMaskSyntax(
          line.slice(tokenStart, tokenEnd),
        )) ||
      containsStrongProtectedDelimiter(
        line.slice(tokenStart, tokenEnd),
      )
    ) {
      return unsafeMarkdownToken(
        tokenStart,
        tokenEnd,
        "a Markdown link contains ambiguous protected syntax",
      );
    }
    return {
      kind: "inline-opaque",
      index: tokenStart,
      end: tokenEnd,
    };
  }
  return null;
}

type ReferenceDefinitionParse =
  | { kind: "none" }
  | {
      kind: "valid";
      end: number;
      referenceTitleMayContinue: boolean;
    }
  | { kind: "unsafe"; reason: string };

function parseReferenceDefinition(line: string): ReferenceDefinitionParse {
  const indent = /^ {0,3}/.exec(line)?.[0].length ?? 0;
  if (line[indent] !== "[" || isBackslashEscaped(line, indent)) {
    return { kind: "none" };
  }
  const labelEnd = findMatchingMarkdownBracket(line, indent);
  if (labelEnd === null || line[labelEnd] !== ":") {
    return { kind: "none" };
  }

  let cursor = skipMarkdownSpaces(line, labelEnd + 1);
  if (cursor >= line.length) {
    return {
      kind: "unsafe",
      reason:
        "multiline Markdown reference definitions require manual review",
    };
  }

  const destination = parseLinkDestination(line, cursor, null);
  if (!destination) {
    return invalidReferenceDefinition(line);
  }
  cursor = destination.end;
  const beforeTitle = cursor;
  let titlePresent = false;
  cursor = skipMarkdownSpaces(line, cursor);
  if (cursor < line.length) {
    const title = parseLinkTitle(line, cursor);
    if (!title) {
      if (
        line[cursor] === '"' ||
        line[cursor] === "'" ||
        line[cursor] === "("
      ) {
        return {
          kind: "unsafe",
          reason:
            "multiline or unclosed Markdown reference titles require manual review",
        };
      }
      return invalidReferenceDefinition(line);
    }
    titlePresent = true;
    cursor = skipMarkdownSpaces(line, title.end);
  } else if (cursor === beforeTitle) {
    return {
      kind: "valid",
      end: cursor,
      referenceTitleMayContinue: true,
    };
  }

  if (cursor !== line.length) return invalidReferenceDefinition(line);
  return {
    kind: "valid",
    end: cursor,
    referenceTitleMayContinue: !titlePresent,
  };
}

function invalidReferenceDefinition(
  line: string,
): ReferenceDefinitionParse {
  if (containsRiskyMarkdownMaskSyntax(line)) {
    return {
      kind: "unsafe",
      reason:
        "an invalid Markdown reference definition contains ambiguous protected syntax",
    };
  }
  return { kind: "none" };
}

function parseInlineLinkClose(
  line: string,
  openParenthesis: number,
): number | null {
  let cursor = skipMarkdownSpaces(line, openParenthesis + 1);
  if (line[cursor] === ")") return cursor + 1;

  const destination = parseLinkDestination(line, cursor, ")");
  if (!destination) return null;
  cursor = destination.end;
  if (line[cursor] === ")") return cursor + 1;

  const afterDestination = skipMarkdownSpaces(line, cursor);
  if (afterDestination === cursor) return null;
  cursor = afterDestination;
  if (line[cursor] === ")") return cursor + 1;

  const title = parseLinkTitle(line, cursor);
  if (!title) return null;
  cursor = skipMarkdownSpaces(line, title.end);
  return line[cursor] === ")" ? cursor + 1 : null;
}

function parseLinkDestination(
  line: string,
  fromIndex: number,
  outerClose: ")" | null,
): { end: number } | null {
  if (line[fromIndex] === "<") {
    for (let index = fromIndex + 1; index < line.length; index += 1) {
      const character = line[index];
      if (character === "\\") {
        index += 1;
        continue;
      }
      if (character === "<") return null;
      if (character === ">") return { end: index + 1 };
    }
    return null;
  }

  let cursor = fromIndex;
  let depth = 0;
  while (cursor < line.length) {
    const character = line[cursor];
    if (character === "\\") {
      cursor = Math.min(line.length, cursor + 2);
      continue;
    }
    if (character === " " || character === "\t") break;
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth === 0 && outerClose === ")") break;
      if (depth === 0) return null;
      depth -= 1;
    }
    cursor += 1;
  }
  if (depth !== 0 || cursor === fromIndex) return null;
  return { end: cursor };
}

function parseLinkTitle(
  line: string,
  fromIndex: number,
): { end: number } | null {
  const opening = line[fromIndex];
  const closing =
    opening === "(" ? ")" : opening === "'" || opening === '"' ? opening : null;
  if (!closing) return null;

  for (let index = fromIndex + 1; index < line.length; index += 1) {
    if (line[index] === "\\") {
      index += 1;
      continue;
    }
    if (line[index] === closing) return { end: index + 1 };
  }
  return null;
}

function findMatchingMarkdownBracket(
  line: string,
  openingIndex: number,
): number | null {
  let depth = 1;
  for (let index = openingIndex + 1; index < line.length; index += 1) {
    if (line[index] === "\\") {
      index += 1;
      continue;
    }
    if (line[index] === "[") {
      depth += 1;
    } else if (line[index] === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function findBalancedLinkClose(
  line: string,
  openParenthesis: number,
): number | null {
  let depth = 1;
  let quote: "'" | '"' | null = null;
  let inAngleDestination = false;

  for (let index = openParenthesis + 1; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (inAngleDestination) {
      if (character === ">") inAngleDestination = false;
      continue;
    }
    if (character === "<") {
      inAngleDestination = true;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function skipMarkdownSpaces(line: string, fromIndex: number): number {
  let cursor = fromIndex;
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  return cursor;
}

function containsStrongProtectedDelimiter(value: string): boolean {
  return /%%|<!--|<%|<\?|<!\[CDATA\[|<![A-Z]/.test(value);
}

function containsRiskyMarkdownMaskSyntax(value: string): boolean {
  return /[`%<]/.test(value);
}

function unsafeMarkdownToken(
  index: number,
  end: number,
  reason: string,
): Extract<ProtectedToken, { kind: "unsafe" }> {
  return { kind: "unsafe", index, end, reason };
}

function findNextInlineMathSpan(
  line: string,
  fromIndex: number,
): Extract<ProtectedToken, { kind: "inline-opaque" }> | null {
  const pattern = /\$+/g;
  pattern.lastIndex = fromIndex;
  let opening = pattern.exec(line);
  while (opening) {
    if (
      !isBackslashEscaped(line, opening.index) &&
      (opening[0].length === 1 || opening[0].length === 2)
    ) {
      const closing = findMatchingUnescapedDollarRun(
        line,
        pattern.lastIndex,
        opening[0].length,
      );
      if (closing !== null) {
        return {
          kind: "inline-opaque",
          index: opening.index,
          end: closing,
        };
      }
    }
    opening = pattern.exec(line);
  }
  return null;
}

function findMatchingUnescapedDollarRun(
  line: string,
  fromIndex: number,
  length: number,
): number | null {
  const pattern = /\$+/g;
  pattern.lastIndex = fromIndex;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (
      match[0].length === length &&
      !isBackslashEscaped(line, match.index)
    ) {
      return pattern.lastIndex;
    }
  }
  return null;
}

function findNextCodeSpan(
  line: string,
  fromIndex: number,
): Extract<ProtectedToken, { kind: "code-span" }> | null {
  const pattern = /`+/g;
  pattern.lastIndex = fromIndex;
  let match = pattern.exec(line);
  while (match && isBackslashEscaped(line, match.index)) {
    match = pattern.exec(line);
  }
  if (!match || match.index < 0) return null;
  return {
    kind: "code-span",
    index: match.index,
    end: pattern.lastIndex,
    ticks: match[0].length,
  };
}

function findMatchingBacktickRun(
  line: string,
  fromIndex: number,
  ticks: number,
): { end: number } | null {
  const pattern = /`+/g;
  pattern.lastIndex = fromIndex;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (match[0].length === ticks) return { end: pattern.lastIndex };
  }
  return null;
}

function findNextUnescapedLiteral(
  line: string,
  literal: string,
  fromIndex: number,
): number {
  let index = line.indexOf(literal, fromIndex);
  while (index >= 0 && isBackslashEscaped(line, index)) {
    index = line.indexOf(literal, index + 1);
  }
  return index;
}

function isBackslashEscaped(line: string, index: number): boolean {
  let backslashes = 0;
  for (
    let cursor = index - 1;
    cursor >= 0 && line[cursor] === "\\";
    cursor -= 1
  ) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function htmlDelimitedClose(
  construct: HtmlDelimitedConstruct,
): "?>" | ">" | "]]>" {
  if (construct === "processing-instruction") return "?>";
  if (construct === "cdata") return "]]>";
  return ">";
}

function findRawHtmlClose(
  line: string,
  fromIndex: number,
  tag: RawHtmlTag,
): number {
  const pattern = new RegExp(`</${tag}[ \\t]*>`, "gi");
  pattern.lastIndex = fromIndex;
  return pattern.exec(line) ? pattern.lastIndex : -1;
}

function findNextHtmlTag(
  line: string,
  fromIndex: number,
): HtmlTagToken | null {
  const pattern = /<(\/?)([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/g;
  pattern.lastIndex = fromIndex;
  let match = pattern.exec(line);
  while (match && isBackslashEscaped(line, match.index)) {
    match = pattern.exec(line);
  }
  if (!match || match.index < 0 || !match[2]) return null;

  const end = findHtmlTagEnd(line, pattern.lastIndex);
  const tagEnd = end ?? line.length;
  return {
    index: match.index,
    end: tagEnd,
    name: match[2].toLowerCase(),
    closing: match[1] === "/",
    selfClosing:
      end !== null && /\/\s*>$/.test(line.slice(match.index, tagEnd)),
    complete: end !== null,
  };
}

function findHtmlTagEnd(line: string, fromIndex: number): number | null {
  let quote: "'" | '"' | null = null;
  for (let index = fromIndex; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return null;
}

function updateHtmlTagStack(
  htmlTags: string[],
  token: HtmlTagToken,
): void {
  if (token.closing) {
    if (htmlTags.at(-1) === token.name) htmlTags.pop();
    return;
  }
  if (token.selfClosing || HTML_VOID_TAGS.has(token.name)) return;
  htmlTags.push(token.name);
}

function preferredLineEnding(tokens: readonly LineToken[]): LineToken["ending"] {
  return tokens.find((token) => token.ending !== "")?.ending || "\n";
}
