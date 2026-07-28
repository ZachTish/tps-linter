import {
  CST,
  isAlias,
  isMap,
  isScalar,
  parseDocument,
  visit,
  type Document,
  type Node,
} from "yaml";

export interface FrontmatterSortResult {
  output: string;
  changed: boolean;
  fieldsReordered: number;
  skippedReason: string | null;
}

interface SortableField {
  foldedKey: string;
  priority: number | undefined;
  originalIndex: number;
  raw: string;
}

type ParsedYamlDocument = Document<Node, boolean>;

const LINE_ENDING_AT_END = /(?:\r\n|\n|\r)$/;
export const TPS_LINTER_MAX_FRONTMATTER_CHARACTERS = 500_000;
export const TPS_LINTER_MAX_FRONTMATTER_LINES = 2_000;
export const TPS_LINTER_MAX_FRONTMATTER_FIELDS = 1_000;

export function inspectTopLevelFrontmatterSafety(
  input: string,
): string | null {
  if (input.length > TPS_LINTER_MAX_FRONTMATTER_CHARACTERS) {
    return `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_CHARACTERS.toLocaleString("en-US")}-character safety limit`;
  }
  if (
    countPhysicalLines(input) >
    TPS_LINTER_MAX_FRONTMATTER_LINES
  ) {
    return `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_LINES.toLocaleString("en-US")}-line safety limit`;
  }

  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(input, {
      keepSourceTokens: true,
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    return "YAML parse error";
  }

  if (document.errors.length > 0) {
    return "YAML parse error";
  }
  if (document.warnings.length > 0) {
    return "YAML parse warning";
  }
  if (
    document.directives?.yaml.explicit ||
    document.directives?.docStart ||
    document.directives?.docEnd
  ) {
    return "YAML directives or document markers";
  }

  const contents = document.contents;
  if (contents === null) {
    return null;
  }
  if (!isMap(contents)) {
    return "Top level is not a mapping";
  }
  if (
    contents.items.length >
    TPS_LINTER_MAX_FRONTMATTER_FIELDS
  ) {
    return `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_FIELDS.toLocaleString("en-US")}-field safety limit`;
  }

  const keys: string[] = [];
  for (const pair of contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      return "Top-level key is not a scalar string";
    }
    keys.push(pair.key.value);
  }
  if (
    new Set(keys).size !== keys.length ||
    new Set(keys.map(casefold)).size !== keys.length
  ) {
    return "Duplicate top-level key";
  }
  if (usesUnsafeYamlFeature(document)) {
    return "Anchor, alias, merge key, or explicit tag";
  }
  return null;
}

export function sortTopLevelFrontmatterFields(
  input: string,
  priorityKeys: readonly string[],
): FrontmatterSortResult {
  if (input.length > TPS_LINTER_MAX_FRONTMATTER_CHARACTERS) {
    return skipped(
      input,
      `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_CHARACTERS.toLocaleString("en-US")}-character safety limit`,
    );
  }
  if (
    countPhysicalLines(input) >
    TPS_LINTER_MAX_FRONTMATTER_LINES
  ) {
    return skipped(
      input,
      `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_LINES.toLocaleString("en-US")}-line safety limit`,
    );
  }

  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(input, {
      keepSourceTokens: true,
      strict: true,
      uniqueKeys: true,
    });
  } catch {
    return skipped(input, "YAML parse error");
  }

  const contents = document.contents;
  if (!isMap(contents)) {
    return skipped(input, "Top level is not a mapping");
  }
  if (
    contents.items.length >
    TPS_LINTER_MAX_FRONTMATTER_FIELDS
  ) {
    return skipped(
      input,
      `Frontmatter exceeds the ${TPS_LINTER_MAX_FRONTMATTER_FIELDS.toLocaleString("en-US")}-field safety limit`,
    );
  }

  const keys: string[] = [];
  const foldedKeys: string[] = [];
  for (const pair of contents.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
      return skipped(input, "Top-level key is not a scalar string");
    }
    keys.push(pair.key.value);
    foldedKeys.push(casefold(pair.key.value));
  }

  if (
    new Set(keys).size !== keys.length ||
    new Set(foldedKeys).size !== keys.length
  ) {
    return skipped(input, "Duplicate top-level key");
  }
  if (document.errors.length > 0) {
    return skipped(input, "YAML parse error");
  }
  if (document.warnings.length > 0) {
    return skipped(input, "YAML parse warning");
  }
  if (
    document.directives?.yaml.explicit ||
    document.directives?.docStart ||
    document.directives?.docEnd
  ) {
    return skipped(input, "YAML directives or document markers");
  }
  if (usesUnsafeYamlFeature(document)) {
    return skipped(input, "Anchor, alias, merge key, or explicit tag");
  }

  const sourceToken = contents.srcToken;
  if (
    !sourceToken ||
    sourceToken.type !== "block-map" ||
    sourceToken.items.length !== contents.items.length
  ) {
    return skipped(input, "Unsupported top-level mapping style");
  }

  const priority = priorityIndex(priorityKeys);
  const fields: SortableField[] = [];
  for (let index = 0; index < contents.items.length; index += 1) {
    const pair = contents.items[index];
    const sourceItem = sourceToken.items[index];
    const key = keys[index];
    const foldedKey = foldedKeys[index];
    if (
      !pair ||
      !sourceItem ||
      key === undefined ||
      foldedKey === undefined ||
      !pair.srcToken ||
      pair.srcToken !== sourceItem
    ) {
      return skipped(input, "YAML source token mismatch");
    }
    fields.push({
      foldedKey,
      priority: priority.get(foldedKey),
      originalIndex: index,
      raw: CST.stringify(sourceItem),
    });
  }

  const sortedFields = [...fields].sort(compareFields);
  const fieldsReordered = sortedFields.reduce(
    (count, field, index) =>
      count + (field.originalIndex === index ? 0 : 1),
    0,
  );

  if (fieldsReordered === 0) {
    return {
      output: input,
      changed: false,
      fieldsReordered: 0,
      skippedReason: null,
    };
  }

  const originalMapSource = CST.stringify(sourceToken);
  const mapStart = sourceToken.offset;
  if (
    input.slice(mapStart, mapStart + originalMapSource.length) !==
    originalMapSource
  ) {
    return skipped(input, "YAML source range mismatch");
  }

  const sortedMapSource = joinFields(
    sortedFields,
    originalMapSource,
    preferredLineEnding(input),
  );
  const output =
    input.slice(0, mapStart) +
    sortedMapSource +
    input.slice(mapStart + originalMapSource.length);

  try {
    const verification = parseDocument(output, {
      keepSourceTokens: true,
      strict: true,
      uniqueKeys: true,
    });
    if (
      verification.errors.length > 0 ||
      verification.warnings.length > 0 ||
      !isMap(verification.contents) ||
      usesUnsafeYamlFeature(verification) ||
      !semanticEquals(
        document.toJS({ mapAsMap: true, maxAliasCount: 0 }),
        verification.toJS({ mapAsMap: true, maxAliasCount: 0 }),
      )
    ) {
      return skipped(input, "Semantic verification failed");
    }
  } catch {
    return skipped(input, "Semantic verification failed");
  }

  return {
    output,
    changed: true,
    fieldsReordered,
    skippedReason: null,
  };
}

function skipped(input: string, reason: string): FrontmatterSortResult {
  return {
    output: input,
    changed: false,
    fieldsReordered: 0,
    skippedReason: reason,
  };
}

function countPhysicalLines(input: string): number {
  if (input.length === 0) return 0;
  let lines = 1;
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === "\r") {
      if (input[index + 1] === "\n") index += 1;
      lines += 1;
    } else if (input[index] === "\n") {
      lines += 1;
    }
  }
  return lines;
}

function priorityIndex(keys: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const key of keys) {
    const folded = casefold(key);
    if (!index.has(folded)) {
      index.set(folded, index.size);
    }
  }
  return index;
}

function compareFields(
  left: SortableField,
  right: SortableField,
): number {
  const leftPriority = left.priority;
  const rightPriority = right.priority;

  if (leftPriority !== undefined || rightPriority !== undefined) {
    if (leftPriority === undefined) {
      return 1;
    }
    if (rightPriority === undefined) {
      return -1;
    }
    return leftPriority - rightPriority;
  }

  const comparison =
    left.foldedKey < right.foldedKey
      ? -1
      : left.foldedKey > right.foldedKey
        ? 1
        : 0;
  return comparison || left.originalIndex - right.originalIndex;
}

function casefold(value: string): string {
  return value.trim().toLowerCase();
}

function joinFields(
  fields: readonly SortableField[],
  originalMapSource: string,
  lineEnding: string,
): string {
  const originalEndsWithLineEnding =
    LINE_ENDING_AT_END.test(originalMapSource);

  return fields
    .map((field, index) => {
      let raw = field.raw;
      const isLast = index === fields.length - 1;
      const ending = raw.match(LINE_ENDING_AT_END)?.[0] ?? null;

      if (!isLast && ending === null) {
        raw += lineEnding;
      } else if (isLast && originalEndsWithLineEnding && ending === null) {
        raw += lineEnding;
      } else if (isLast && !originalEndsWithLineEnding && ending !== null) {
        raw = raw.slice(0, -ending.length);
      }
      return raw;
    })
    .join("");
}

function preferredLineEnding(input: string): string {
  return input.match(/\r\n|\n|\r/)?.[0] ?? "\n";
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

function semanticEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() === right.getTime();
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => semanticEquals(value, right[index]))
    );
  }
  if (left instanceof Map && right instanceof Map) {
    if (left.size !== right.size) {
      return false;
    }
    const unmatched = [...right.entries()];
    for (const [leftKey, leftValue] of left.entries()) {
      const matchIndex = unmatched.findIndex(
        ([rightKey, rightValue]) =>
          semanticEquals(leftKey, rightKey) &&
          semanticEquals(leftValue, rightValue),
      );
      if (matchIndex < 0) {
        return false;
      }
      unmatched.splice(matchIndex, 1);
    }
    return true;
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      semanticEquals(leftKeys, rightKeys) &&
      leftKeys.every((key) =>
        semanticEquals(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}
