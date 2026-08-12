import {
  cleanMarkdown,
  type MarkdownCleanupOptions,
  type MarkdownCleanupResult,
} from "./cleaner.ts";

export type RelevantOptInRule =
  | "frontmatter-blank-line"
  | "leading-blank-line"
  | "list-item-blank-lines";

export function findRelevantDisabledOptInRules(
  input: string,
  options: MarkdownCleanupOptions,
  currentResult?: MarkdownCleanupResult,
): RelevantOptInRule[] {
  const result = currentResult ?? cleanMarkdown(input, options);
  if (
    result.changed ||
    result.noteDisabledReason ||
    result.safetyBlockedReason
  ) {
    return [];
  }

  const probeFrontmatter = !options.ensureBlankLineAfterFrontmatter;
  const probeLeading = !options.ensureBlankLineAtBeginning;
  const probeLists = !options.removeBlankLinesBetweenListItems;
  if (!probeFrontmatter && !probeLeading && !probeLists) return [];

  const probe = cleanMarkdown(input, {
    ...options,
    ensureBlankLineAfterFrontmatter:
      options.ensureBlankLineAfterFrontmatter || probeFrontmatter,
    ensureBlankLineAtBeginning:
      options.ensureBlankLineAtBeginning || probeLeading,
    removeBlankLinesBetweenListItems:
      options.removeBlankLinesBetweenListItems || probeLists,
  });
  const rules: RelevantOptInRule[] = [];
  if (probeFrontmatter && probe.changes.frontmatterBlankLineAdded) {
    rules.push("frontmatter-blank-line");
  }
  if (probeLeading && probe.changes.leadingBlankLineAdded) {
    rules.push("leading-blank-line");
  }
  if (probeLists && probe.changes.listItemBlankLinesRemoved > 0) {
    rules.push("list-item-blank-lines");
  }
  return rules;
}

export function describeRelevantOptInRules(
  rules: readonly RelevantOptInRule[],
): string {
  return joinLabels(rules.map(ruleLabel));
}

function ruleLabel(rule: RelevantOptInRule): string {
  switch (rule) {
    case "frontmatter-blank-line":
      return "Add blank body line after frontmatter";
    case "leading-blank-line":
      return "Add blank line before plain-note content";
    case "list-item-blank-lines":
      return "Remove blank lines between list items";
  }
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
