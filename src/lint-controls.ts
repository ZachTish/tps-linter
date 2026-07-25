import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  visit,
  type Document,
  type Node,
} from "yaml";
import { TPS_LINTER_MAX_FRONTMATTER_LINES } from "./frontmatter-sort.ts";

export const TPS_LINTER_CONTROL_KEY = "tps-linter" as const;
export const TPS_LINTER_DISABLED_RULES_KEY =
  "tps-linter-disabled-rules" as const;

export const TPS_LINTER_CONTROL_KEYS = Object.freeze([
  TPS_LINTER_CONTROL_KEY,
  TPS_LINTER_DISABLED_RULES_KEY,
] as const);

export const TPS_LINTER_RULE_IDS = Object.freeze([
  "filename",
  "whitespace-only-lines",
  "blank-lines",
  "trailing-whitespace",
  "trailing-blank-lines",
  "final-newline",
  "heading-capitalization",
  "heading-levels",
  "frontmatter-sort",
  "all",
] as const);

export type TPSLinterRuleId = (typeof TPS_LINTER_RULE_IDS)[number];

export interface LintControlResult {
  readonly controlsPresent: boolean;
  readonly disabledAll: boolean;
  readonly disabledRules: ReadonlySet<TPSLinterRuleId>;
  readonly reason: string | null;
}

interface FrontmatterSection {
  body: string;
  closed: boolean;
  tooLarge: boolean;
  tooManyLines: boolean;
}

type ParsedYamlDocument = Document<Node, boolean>;

const RULE_IDS = new Set<string>(TPS_LINTER_RULE_IDS);
const CONTROL_KEY_TEXT =
  /(?:^|[^A-Za-z0-9_-])tps-linter(?:-disabled-rules)?(?=$|[^A-Za-z0-9_-])/m;
export const TPS_LINTER_MAX_FRONTMATTER_CHARACTERS = 500_000;

export function parseLintControls(markdown: string): LintControlResult {
  const frontmatter = readFrontmatter(markdown);
  if (!frontmatter) return noControls();
  if (frontmatter.tooLarge) {
    return invalidControls(
      `frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_CHARACTERS.toLocaleString("en-US")}-character safety limit`,
    );
  }
  if (frontmatter.tooManyLines) {
    return invalidControls(
      `frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_LINES.toLocaleString("en-US")}-line safety limit`,
    );
  }

  let document: ReturnType<typeof parseDocument> | null = null;
  try {
    document = parseDocument(frontmatter.body, {
      keepSourceTokens: true,
      strict: true,
      uniqueKeys: false,
    });
  } catch {
    return invalidControls("YAML could not be inspected safely");
  }

  const candidateTextPresent = CONTROL_KEY_TEXT.test(frontmatter.body);
  const controlsPresent =
    isMap(document.contents) &&
    document.contents.items.some(
      (pair) =>
        isScalar(pair.key) &&
        typeof pair.key.value === "string" &&
        TPS_LINTER_CONTROL_KEYS.includes(
          pair.key.value as (typeof TPS_LINTER_CONTROL_KEYS)[number],
        ),
    );

  if (!controlsPresent) {
    if (
      candidateTextPresent &&
      (!frontmatter.closed ||
        document.errors.length > 0 ||
        document.warnings.length > 0)
    ) {
      return invalidControls(
        !frontmatter.closed ? "unterminated frontmatter" : "malformed YAML",
      );
    }
    return noControls();
  }

  if (!frontmatter.closed) {
    return invalidControls("unterminated frontmatter");
  }
  if (
    document.errors.length > 0 ||
    document.warnings.length > 0
  ) {
    return invalidControls("malformed YAML");
  }
  if (!isMap(document.contents)) {
    return invalidControls("top level is not a mapping");
  }
  if (
    document.directives?.yaml.explicit ||
    document.directives?.docStart ||
    document.directives?.docEnd
  ) {
    return invalidControls("YAML directives or document markers");
  }
  if (usesUnsafeYamlFeature(document)) {
    return invalidControls("unsafe YAML feature");
  }

  const keys: string[] = [];
  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      return invalidControls("top-level key is not a scalar string");
    }
    keys.push(pair.key.value);
  }
  if (
    new Set(keys).size !== keys.length ||
    new Set(keys.map(casefold)).size !== keys.length
  ) {
    return invalidControls("duplicate top-level key");
  }

  const disabledRules = new Set<TPSLinterRuleId>();
  let disabledBySwitch = false;

  for (const pair of document.contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") continue;

    if (pair.key.value === TPS_LINTER_CONTROL_KEY) {
      if (
        !isScalar(pair.value) ||
        typeof pair.value.value !== "boolean"
      ) {
        return invalidControls(`${TPS_LINTER_CONTROL_KEY} must be boolean`);
      }
      disabledBySwitch = pair.value.value === false;
      continue;
    }

    if (pair.key.value !== TPS_LINTER_DISABLED_RULES_KEY) continue;
    const values = readRuleIds(pair.value);
    if (!values) {
      return invalidControls(
        `${TPS_LINTER_DISABLED_RULES_KEY} must be a rule ID or sequence`,
      );
    }

    for (const value of values) {
      if (!RULE_IDS.has(value)) {
        return invalidControls(`unknown rule ID: ${value}`);
      }
      const ruleId = value as TPSLinterRuleId;
      if (disabledRules.has(ruleId)) {
        return invalidControls(`duplicate rule ID: ${value}`);
      }
      disabledRules.add(ruleId);
    }
  }

  const disabledByRuleList = disabledRules.has("all");
  return {
    controlsPresent: true,
    disabledAll: disabledBySwitch || disabledByRuleList,
    disabledRules,
    reason: disabledBySwitch
      ? `Disabled by ${TPS_LINTER_CONTROL_KEY}: false.`
      : disabledByRuleList
        ? `Disabled by ${TPS_LINTER_DISABLED_RULES_KEY}: all.`
        : null,
  };
}

function noControls(): LintControlResult {
  return {
    controlsPresent: false,
    disabledAll: false,
    disabledRules: new Set<TPSLinterRuleId>(),
    reason: null,
  };
}

function invalidControls(detail: string): LintControlResult {
  return {
    controlsPresent: true,
    disabledAll: true,
    disabledRules: new Set<TPSLinterRuleId>(),
    reason: `Invalid TPS Linter controls: ${detail}.`,
  };
}

function readFrontmatter(markdown: string): FrontmatterSection | null {
  const first = readLine(markdown, 0);
  if (!/^---[ \t]*$/.test(first.body.replace(/^\uFEFF/, ""))) {
    return null;
  }

  const bodyStart = first.next;
  let cursor = bodyStart;
  let bodyLineCount = 0;
  while (cursor < markdown.length) {
    const line = readLine(markdown, cursor);
    if (
      cursor - bodyStart >
      TPS_LINTER_MAX_FRONTMATTER_CHARACTERS
    ) {
      return {
        body: "",
        closed: false,
        tooLarge: true,
        tooManyLines: false,
      };
    }
    bodyLineCount += 1;
    if (bodyLineCount > TPS_LINTER_MAX_FRONTMATTER_LINES) {
      return {
        body: "",
        closed: false,
        tooLarge: false,
        tooManyLines: true,
      };
    }
    if (/^(?:---|\.\.\.)[ \t]*$/.test(line.body)) {
      return {
        body: markdown
          .slice(bodyStart, cursor)
          .replace(/\r\n|\r/g, "\n"),
        closed: true,
        tooLarge: false,
        tooManyLines: false,
      };
    }
    if (line.next === cursor) break;
    cursor = line.next;
  }

  const body = markdown.slice(bodyStart);
  if (body.length > TPS_LINTER_MAX_FRONTMATTER_CHARACTERS) {
    return {
      body: "",
      closed: false,
      tooLarge: true,
      tooManyLines: false,
    };
  }
  return {
    body: body.replace(/\r\n|\r/g, "\n"),
    closed: false,
    tooLarge: false,
    tooManyLines: false,
  };
}

function readLine(
  input: string,
  start: number,
): { body: string; next: number } {
  let end = start;
  while (
    end < input.length &&
    input[end] !== "\r" &&
    input[end] !== "\n"
  ) {
    end += 1;
  }
  let next = end;
  if (input[end] === "\r" && input[end + 1] === "\n") {
    next += 2;
  } else if (input[end] === "\r" || input[end] === "\n") {
    next += 1;
  }
  return { body: input.slice(start, end), next };
}

function readRuleIds(node: unknown): string[] | null {
  if (isScalar(node)) {
    return typeof node.value === "string" ? [node.value] : null;
  }
  if (!isSeq(node)) return null;

  const values: string[] = [];
  for (const item of node.items) {
    if (!isScalar(item) || typeof item.value !== "string") return null;
    values.push(item.value);
  }
  return values;
}

function usesUnsafeYamlFeature(document: ParsedYamlDocument): boolean {
  let unsafe = false;
  visit(document, {
    Alias() {
      unsafe = true;
      return visit.BREAK;
    },
    Node(_key, node) {
      if (
        isAlias(node) ||
        node.tag !== undefined ||
        ("anchor" in node && typeof node.anchor === "string")
      ) {
        unsafe = true;
        return visit.BREAK;
      }
      return undefined;
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        unsafe = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return unsafe;
}

function casefold(value: string): string {
  return value.trim().toLowerCase();
}
