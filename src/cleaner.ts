import type { FilenameUnsafeCharacterStyle } from "./settings";

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
  trimNonblankTrailingWhitespace: boolean;
  ensureFinalNewline: boolean;
}

export interface MarkdownCleanupChanges {
  whitespaceOnlyLinesCleaned: number;
  nonblankTrailingWhitespaceLinesCleaned: number;
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

interface FenceState {
  marker: "`" | "~";
  length: number;
}

type RawProtectedTag = "pre" | "textarea" | "script" | "style";

interface InlineProtectedState {
  rawTag: RawProtectedTag | null;
  inTemplater: boolean;
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
  const tokens = splitLinesPreservingEndings(input);
  const changes: MarkdownCleanupChanges = {
    whitespaceOnlyLinesCleaned: 0,
    nonblankTrailingWhitespaceLinesCleaned: 0,
    finalNewlineAdded: false,
  };

  let inFrontmatter = false;
  let fence: FenceState | null = null;
  let rawTag: RawProtectedTag | null = null;
  let inTemplater = false;
  let finalTokenWasProtected = false;

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
      finalTokenWasProtected = tokenWasProtected;
      continue;
    }

    if (fence) {
      tokenWasProtected = true;
      if (isFenceClose(comparisonBody, fence)) fence = null;
      finalTokenWasProtected = tokenWasProtected;
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
      finalTokenWasProtected = tokenWasProtected;
      continue;
    }

    if (index === 0 && comparisonBody.trim() === "---") {
      inFrontmatter = true;
      finalTokenWasProtected = true;
      continue;
    }

    const openedFence = readFenceOpen(comparisonBody);
    if (openedFence) {
      fence = openedFence;
      finalTokenWasProtected = true;
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
      finalTokenWasProtected = true;
      continue;
    }

    finalTokenWasProtected = false;
    if (options.cleanWhitespaceOnlyLines && /^[ \t]+$/.test(token.body)) {
      token.body = "";
      changes.whitespaceOnlyLinesCleaned += 1;
      continue;
    }

    if (
      options.trimNonblankTrailingWhitespace &&
      token.body.trim().length > 0
    ) {
      const trailingMatch = token.body.match(/[ \t]+$/);
      if (!trailingMatch) continue;

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

  if (
    options.ensureFinalNewline &&
    input.length > 0 &&
    tokens.length > 0 &&
    !finalTokenWasProtected
  ) {
    const last = tokens[tokens.length - 1];
    if (last && last.ending === "") {
      last.ending = preferredLineEnding(tokens);
      changes.finalNewlineAdded = true;
    }
  }

  const output = tokens.map((token) => `${token.body}${token.ending}`).join("");
  return {
    output,
    changed: output !== input,
    changes,
  };
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

function isFenceClose(line: string, fence: FenceState): boolean {
  const marker = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line);
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
