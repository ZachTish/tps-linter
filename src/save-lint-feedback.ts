import type { MarkdownCleanupResult } from "./cleaner";
import {
  describeRelevantOptInRules,
  type RelevantOptInRule,
} from "./opt-in-suggestions.ts";

const MAX_REPORTED_ACTIONS = 3;
const MAX_NOTICE_LENGTH = 180;

interface NoticeAction {
  count: number;
  text: string;
}

export function formatSaveLintNotice(
  result: MarkdownCleanupResult,
): string | null {
  if (!result.changed) {
    return null;
  }

  const actions: NoticeAction[] = [];
  const changes = result.changes;
  if (changes.whitespaceOnlyLinesCleaned > 0) {
    actions.push({
      count: changes.whitespaceOnlyLinesCleaned,
      text: `cleared ${changes.whitespaceOnlyLinesCleaned} whitespace-only ${plural("line", changes.whitespaceOnlyLinesCleaned)}`,
    });
  }
  if (changes.extraBlankLinesRemoved > 0) {
    actions.push({
      count: changes.extraBlankLinesRemoved,
      text: `removed ${changes.extraBlankLinesRemoved} extra blank ${plural("line", changes.extraBlankLinesRemoved)}`,
    });
  }
  if (changes.listItemBlankLinesRemoved > 0) {
    actions.push({
      count: changes.listItemBlankLinesRemoved,
      text: `removed ${changes.listItemBlankLinesRemoved} blank ${plural("line", changes.listItemBlankLinesRemoved)} between list items`,
    });
  }
  if (changes.nonblankTrailingWhitespaceLinesCleaned > 0) {
    actions.push({
      count: changes.nonblankTrailingWhitespaceLinesCleaned,
      text: `trimmed trailing whitespace on ${changes.nonblankTrailingWhitespaceLinesCleaned} ${plural("line", changes.nonblankTrailingWhitespaceLinesCleaned)}`,
    });
  }
  if (changes.trailingBlankLinesRemoved > 0) {
    actions.push({
      count: changes.trailingBlankLinesRemoved,
      text: `removed ${changes.trailingBlankLinesRemoved} trailing blank ${plural("line", changes.trailingBlankLinesRemoved)}`,
    });
  }
  if (changes.headingsCapitalized > 0) {
    actions.push({
      count: changes.headingsCapitalized,
      text: `capitalized ${changes.headingsCapitalized} ${plural("heading", changes.headingsCapitalized)}`,
    });
  }
  if (changes.headingLevelsAdjusted > 0) {
    actions.push({
      count: changes.headingLevelsAdjusted,
      text: `adjusted ${changes.headingLevelsAdjusted} heading ${plural("level", changes.headingLevelsAdjusted)}`,
    });
  }
  if (changes.frontmatterFieldsReordered > 0) {
    actions.push({
      count: changes.frontmatterFieldsReordered,
      text: `reordered ${changes.frontmatterFieldsReordered} frontmatter ${plural("field", changes.frontmatterFieldsReordered)}`,
    });
  }
  if (changes.leadingBlankLineAdded) {
    actions.push({ count: 1, text: "added a blank line at the beginning" });
  }
  if (changes.frontmatterBlankLineAdded) {
    actions.push({ count: 1, text: "added a blank line after frontmatter" });
  }
  if (changes.finalNewlineAdded) {
    actions.push({ count: 1, text: "added a final newline" });
  }

  if (actions.length === 0) return "TPS Linter cleaned this note.";

  const message = `TPS Linter: ${summarizeActions(actions)}.`;
  if (message.length <= MAX_NOTICE_LENGTH) return message;

  const totalFixes = sumActionCounts(actions);
  return `TPS Linter: applied ${totalFixes} ${plural("fix", totalFixes)} across ${actions.length} ${plural("rule", actions.length)}.`;
}

export function formatExplicitSaveNoChangeNotice(
  result: MarkdownCleanupResult,
  relevantDisabledRules: readonly RelevantOptInRule[] = [],
): string | null {
  if (result.changed) return null;
  if (result.noteDisabledReason) {
    return "TPS Linter: skipped because this note disables cleanup.";
  }
  if (result.safetyBlockedReason) {
    return "TPS Linter: skipped by the safety verifier.";
  }
  if (result.changes.frontmatterSortSkippedReason) {
    return "TPS Linter: no changes; frontmatter sorting was skipped for safety.";
  }
  if (relevantDisabledRules.length > 0) {
    const labels = describeRelevantOptInRules(relevantDisabledRules);
    const verb = relevantDisabledRules.length === 1 ? "is" : "are";
    return `TPS Linter: no changes; ${labels} ${verb} off on this device.`;
  }
  return "TPS Linter: no changes under the rules enabled on this device.";
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  return word === "fix" ? "fixes" : `${word}s`;
}

function joinActions(actions: readonly string[]): string {
  if (actions.length === 1) return actions[0] ?? "";
  if (actions.length === 2) return `${actions[0]} and ${actions[1]}`;
  return `${actions.slice(0, -1).join(", ")}, and ${actions.at(-1)}`;
}

function summarizeActions(actions: readonly NoticeAction[]): string {
  if (actions.length <= MAX_REPORTED_ACTIONS) {
    return joinActions(actions.map((action) => action.text));
  }

  const visibleActions = actions.slice(0, MAX_REPORTED_ACTIONS);
  const remainingFixes = sumActionCounts(
    actions.slice(MAX_REPORTED_ACTIONS),
  );
  return joinActions([
    ...visibleActions.map((action) => action.text),
    `applied ${remainingFixes} more ${plural("fix", remainingFixes)}`,
  ]);
}

function sumActionCounts(actions: readonly NoticeAction[]): number {
  return actions.reduce((total, action) => total + action.count, 0);
}
