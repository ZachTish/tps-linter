import { sortTopLevelFrontmatterFields } from "./frontmatter-sort.ts";
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
  | "gcm-auto-rename-active"
  | "target-collision";

export interface FilenameRenameDecision {
  allowed: boolean;
  reason: FilenameRenameDecisionReason;
  detail: string | null;
}

export interface MarkdownCleanupOptions {
  cleanWhitespaceOnlyLines: boolean;
  collapseConsecutiveBlankLines: boolean;
  trimNonblankTrailingWhitespace: boolean;
  ensureFinalNewline: boolean;
  headingCapitalizationStyle: HeadingCapitalizationStyle;
  normalizeHeadingLevels: boolean;
  headingStartLevel: 1 | 2;
  sortFrontmatterFields: boolean;
  frontmatterPriorityKeys: readonly string[];
}

export interface MarkdownCleanupChanges {
  whitespaceOnlyLinesCleaned: number;
  extraBlankLinesRemoved: number;
  nonblankTrailingWhitespaceLinesCleaned: number;
  headingsCapitalized: number;
  headingLevelsAdjusted: number;
  frontmatterFieldsReordered: number;
  frontmatterSortSkippedReason: string | null;
  finalNewlineAdded: boolean;
}

export interface MarkdownCleanupResult {
  output: string;
  changed: boolean;
  changes: MarkdownCleanupChanges;
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
}

interface FenceState {
  marker: "`" | "~";
  length: number;
}

interface NormalizedHeadingLevel {
  source: number;
  target: number;
}

type RawProtectedTag = "pre" | "textarea" | "script" | "style";
type MarkdownComment = "obsidian" | "html";

interface InlineProtectedState {
  rawTag: RawProtectedTag | null;
  inTemplater: boolean;
  protected: boolean;
}

interface CommentProtectedState {
  comment: MarkdownComment | null;
  protected: boolean;
}

const WINDOWS_RESERVED_DEVICE_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const UNSAFE_FILENAME_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g;
const OBSIDIAN_LINK_CONTROL_CHARACTERS = /[#^[\]]+/g;
const HORIZONTAL_FILENAME_WHITESPACE = /[\t\p{Zs}]+/gu;

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
    targetPath.toLocaleLowerCase() === normalizedSourcePath.toLocaleLowerCase()
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
  gcmAutoRenameActive: boolean,
): FilenameRenameDecision {
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
    plan.targetPath.toLocaleLowerCase() ===
    plan.sourcePath.toLocaleLowerCase()
  ) {
    return {
      allowed: false,
      reason: "case-only-rename",
      detail: "Case-only filename changes require an explicit filesystem-safe workflow.",
    };
  }
  if (gcmAutoRenameActive) {
    return {
      allowed: false,
      reason: "gcm-auto-rename-active",
      detail: "TPS Global Context Menu currently owns automatic filename synchronization.",
    };
  }

  const sourcePath = normalizeVaultPath(plan.sourcePath);
  const targetPathLower = normalizeVaultPath(plan.targetPath).toLocaleLowerCase();
  const collision = siblingPaths
    .map(normalizeVaultPath)
    .find(
      (path) =>
        path !== sourcePath && path.toLocaleLowerCase() === targetPathLower,
    );
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
  const lowerPath = path.toLocaleLowerCase();

  if (!path.toLocaleLowerCase().endsWith(".md")) {
    return { excluded: true, reason: "non-Markdown file" };
  }

  for (const prefix of HARD_EXCLUDED_PREFIXES) {
    if (matchesExactOrDescendant(lowerPath, prefix.toLocaleLowerCase())) {
      return { excluded: true, reason: `protected path: ${prefix}` };
    }
  }

  if (!path.includes("/") && lowerPath === "agents.md") {
    return { excluded: true, reason: "protected root agent instructions" };
  }

  const basename = path.slice(path.lastIndexOf("/") + 1, -3).toLocaleLowerCase();
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

export function cleanMarkdown(
  input: string,
  options: MarkdownCleanupOptions,
): MarkdownCleanupResult {
  const changes: MarkdownCleanupChanges = {
    whitespaceOnlyLinesCleaned: 0,
    extraBlankLinesRemoved: 0,
    nonblankTrailingWhitespaceLinesCleaned: 0,
    headingsCapitalized: 0,
    headingLevelsAdjusted: 0,
    frontmatterFieldsReordered: 0,
    frontmatterSortSkippedReason: null,
    finalNewlineAdded: false,
  };

  let workingInput = input;
  if (options.sortFrontmatterFields) {
    const frontmatter = sortDocumentFrontmatter(
      workingInput,
      options.frontmatterPriorityKeys,
    );
    workingInput = frontmatter.output;
    changes.frontmatterFieldsReordered = frontmatter.fieldsReordered;
    changes.frontmatterSortSkippedReason = frontmatter.skippedReason;
  }

  const tokens = splitLinesPreservingEndings(workingInput);
  const processedTokens: ProcessedLineToken[] = [];
  let inFrontmatter = false;
  let fence: FenceState | null = null;
  let inMathBlock = false;
  let inIndentedCode = false;
  let comment: MarkdownComment | null = null;
  let rawTag: RawProtectedTag | null = null;
  let inTemplater = false;
  const headingHierarchy: NormalizedHeadingLevel[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    let tokenWasProtected = false;
    const comparisonBody =
      index === 0 ? token.body.replace(/^\uFEFF/, "") : token.body;

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

    if (inMathBlock) {
      tokenWasProtected = true;
      if (isMathBlockDelimiter(comparisonBody)) inMathBlock = false;
      processedTokens.push({ ...token, protected: tokenWasProtected });
      continue;
    }

    if (inIndentedCode) {
      if (
        comparisonBody.trim().length === 0 ||
        isIndentedCodeLine(comparisonBody)
      ) {
        processedTokens.push({ ...token, protected: true });
        continue;
      }
      inIndentedCode = false;
    }

    if (comment) {
      const commentState = scanCommentConstructs(comparisonBody, comment);
      comment = commentState.comment;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    if (rawTag || inTemplater) {
      const protectedState = scanInlineProtectedConstructs(
        comparisonBody,
        rawTag,
        inTemplater,
      );
      rawTag = protectedState.rawTag;
      inTemplater = protectedState.inTemplater;
      tokenWasProtected = true;
      processedTokens.push({ ...token, protected: tokenWasProtected });
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

    if (isMathBlockDelimiter(comparisonBody)) {
      inMathBlock = true;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const heading = readAtxHeading(token.body);
    if (heading) {
      let nextLevel = heading.level;
      if (options.normalizeHeadingLevels) {
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
        token.body = `${heading.indent}${"#".repeat(nextLevel)}${heading.separator}${nextText}${heading.closing}`;
      }
    }

    const commentState = scanCommentConstructs(comparisonBody, null);
    if (commentState.protected) {
      comment = commentState.comment;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    const protectedState = scanInlineProtectedConstructs(
      comparisonBody,
      null,
      false,
    );
    if (protectedState.protected) {
      rawTag = protectedState.rawTag;
      inTemplater = protectedState.inTemplater;
      processedTokens.push({ ...token, protected: true });
      continue;
    }

    if (options.cleanWhitespaceOnlyLines && /^[ \t]+$/.test(token.body)) {
      token.body = "";
      changes.whitespaceOnlyLinesCleaned += 1;
    } else if (
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

    processedTokens.push({ ...token, protected: false });
  }

  const retainedTokens: ProcessedLineToken[] = [];
  let previousWasCollapsibleBlank = false;
  for (const token of processedTokens) {
    const blank = token.body.trim().length === 0;
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
  return {
    output,
    changed: output !== input,
    changes,
  };
}

interface DocumentFrontmatterSortResult {
  output: string;
  fieldsReordered: number;
  skippedReason: string | null;
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
  indent: string;
  level: number;
  separator: string;
  text: string;
  closing: string;
}

function readAtxHeading(line: string): AtxHeading | null {
  const match = line.match(
    /^( {0,3})(#{1,6})([ \t]+)(.*?)([ \t]+#{1,}[ \t]*)?$/,
  );
  if (!match?.[1] && match?.[1] !== "") return null;
  const marker = match[2];
  const separator = match[3];
  const text = match[4];
  if (!marker || !separator || text === undefined) return null;
  return {
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
    /\[|\]|`|%%|<%|%>|<[^>]+>|\{\{|\}\}|::|\$|@/.test(text) ||
    /\\[()[\]]/.test(text) ||
    /(?:^|\s)#[\p{L}\p{N}_/-]+/u.test(text) ||
    /\b[\p{L}][\p{L}\p{N}+.-]*:\/\//u.test(text) ||
    /(?:^|\s)\^[\p{L}\p{N}-]+[ \t]*$/u.test(text)
  );
}

function capitalizeFirstLetter(text: string): string {
  const match = /\p{L}/u.exec(text);
  if (!match || match.index < 0) return text;
  const letter = match[0];
  const uppercase = letter.toLocaleUpperCase();
  if (uppercase === letter) return text;
  return `${text.slice(0, match.index)}${uppercase}${text.slice(match.index + letter.length)}`;
}

function titleCaseWord(
  word: string,
  index: number,
  wordCount: number,
): string {
  const lowercase = word.toLocaleLowerCase();
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
      `${prefix}${letter.toLocaleUpperCase()}`,
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
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "");
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

function readFenceOpen(line: string): FenceState | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  const run = match?.[1];
  if (!run) return null;
  return {
    marker: run[0] as FenceState["marker"],
    length: run.length,
  };
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(line) && line.trim().length > 0;
}

function isFenceClose(line: string, fence: FenceState): boolean {
  const marker = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line);
}

function isMathBlockDelimiter(line: string): boolean {
  return /^ {0,3}\$\$[ \t]*$/.test(line);
}

function scanInlineProtectedConstructs(
  line: string,
  initialRawTag: RawProtectedTag | null,
  initialInTemplater: boolean,
): InlineProtectedState {
  let rawTag = initialRawTag;
  let inTemplater = initialInTemplater;
  let cursor = 0;
  let protectedLine = rawTag !== null || inTemplater;

  while (cursor < line.length) {
    if (rawTag) {
      const close = findRawTagClose(line, rawTag, cursor);
      if (!close) {
        return { rawTag, inTemplater: false, protected: true };
      }
      cursor = close.end;
      rawTag = null;
      continue;
    }

    if (inTemplater) {
      const closeIndex = line.indexOf("%>", cursor);
      if (closeIndex < 0) {
        return { rawTag: null, inTemplater: true, protected: true };
      }
      cursor = closeIndex + 2;
      inTemplater = false;
      continue;
    }

    const rawOpen = findRawTagOpen(line, cursor);
    const templaterOpenIndex = line.indexOf("<%", cursor);
    if (!rawOpen && templaterOpenIndex < 0) break;

    protectedLine = true;
    if (
      templaterOpenIndex >= 0 &&
      (!rawOpen || templaterOpenIndex < rawOpen.index)
    ) {
      inTemplater = true;
      cursor = templaterOpenIndex + 2;
    } else if (rawOpen) {
      rawTag = rawOpen.tag;
      cursor = rawOpen.end;
    }
  }

  return {
    rawTag,
    inTemplater,
    protected: protectedLine,
  };
}

function scanCommentConstructs(
  line: string,
  initialComment: MarkdownComment | null,
): CommentProtectedState {
  let comment = initialComment;
  let cursor = 0;
  let protectedLine = comment !== null;

  while (cursor < line.length) {
    if (comment === "obsidian") {
      const closeIndex = line.indexOf("%%", cursor);
      if (closeIndex < 0) {
        return { comment, protected: true };
      }
      cursor = closeIndex + 2;
      comment = null;
      continue;
    }

    if (comment === "html") {
      const closeIndex = line.indexOf("-->", cursor);
      if (closeIndex < 0) {
        return { comment, protected: true };
      }
      cursor = closeIndex + 3;
      comment = null;
      continue;
    }

    const obsidianOpen = line.indexOf("%%", cursor);
    const htmlOpen = line.indexOf("<!--", cursor);
    if (obsidianOpen < 0 && htmlOpen < 0) break;

    protectedLine = true;
    if (obsidianOpen >= 0 && (htmlOpen < 0 || obsidianOpen < htmlOpen)) {
      comment = "obsidian";
      cursor = obsidianOpen + 2;
    } else {
      comment = "html";
      cursor = htmlOpen + 4;
    }
  }

  return { comment, protected: protectedLine };
}

function findRawTagOpen(
  line: string,
  fromIndex: number,
): { tag: RawProtectedTag; index: number; end: number } | null {
  const match = /<(pre|textarea|script|style)(?=[\s/>])/i.exec(
    line.slice(fromIndex),
  );
  if (!match || match.index < 0 || !match[1]) return null;

  const index = fromIndex + match.index;
  return {
    tag: match[1].toLocaleLowerCase() as RawProtectedTag,
    index,
    end: index + match[0].length,
  };
}

function findRawTagClose(
  line: string,
  tag: RawProtectedTag,
  fromIndex: number,
): { end: number } | null {
  const match = new RegExp(`</${tag}\\s*>`, "i").exec(line.slice(fromIndex));
  if (!match || match.index < 0) return null;
  return { end: fromIndex + match.index + match[0].length };
}

function preferredLineEnding(tokens: readonly LineToken[]): LineToken["ending"] {
  return tokens.find((token) => token.ending !== "")?.ending || "\n";
}
