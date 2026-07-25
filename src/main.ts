import {
  App,
  Menu,
  Notice,
  Plugin,
  TAbstractFile,
  TFile,
} from "obsidian";

import {
  cleanMarkdown,
  decideFilenameRename,
  inspectMarkdownInputSafety,
  inspectPathExclusion,
  planMarkdownFilename,
  type FilenameCleanupOptions,
  type FilenamePlan,
  type FilenameRenameDecision,
  type MarkdownCleanupOptions,
  type MarkdownCleanupResult,
} from "./cleaner";
import {
  inspectGcmIntegration,
  type FilenameOwnershipStatus,
} from "./gcm-compat";
import {
  parseLintControls,
  type LintControlResult,
} from "./lint-controls";
import {
  logDiagnostic,
  logError,
  logWarning,
  setDiagnosticsEnabled,
  summarizeError,
} from "./logger";
import {
  normalizeSettings,
  resolveFrontmatterPriorityKeys,
  type TPSLinterSettings,
} from "./settings";
import { TPSLinterSettingTab } from "./settings-tab";

type CleanupTrigger = "command" | "file-menu" | "settings";

interface FileInspection {
  file: TFile;
  filenamePlan: FilenamePlan;
  filenameDecision: FilenameRenameDecision;
  lintControls: LintControlResult;
  markdown: MarkdownCleanupResult;
}

interface CleanResult {
  inspection: FileInspection;
  contentChanged: boolean;
  filenameChanged: boolean;
  filenameDecision: FilenameRenameDecision;
  guardReason: string | null;
}

export default class TPSLinterPlugin extends Plugin {
  settings!: TPSLinterSettings;
  private readonly activeCleans = new WeakSet<TFile>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new TPSLinterSettingTab(this.app, this));

    this.addCommand({
      id: "check-current-note",
      name: "Check current note",
      callback: () => {
        void this.checkActiveNote("command", true);
      },
    });

    this.addCommand({
      id: "clean-current-note",
      name: "Clean current note",
      callback: () => {
        void this.cleanActiveNote("command", true);
      },
    });

    this.registerEvent(
      this.app.workspace.on(
        "file-menu",
        (menu: Menu, file: TAbstractFile) => {
          if (!(file instanceof TFile) || file.extension !== "md") return;

          menu.addSeparator();
          menu.addItem((item) => {
            item
              .setTitle("Check with TPS Linter")
              .setIcon("search")
              .onClick(() => {
                void this.checkFileWithNotice(file, "file-menu", true);
              });
          });
          menu.addItem((item) => {
            item
              .setTitle("Clean with TPS Linter")
              .setIcon("wand-sparkles")
              .onClick(() => {
                void this.cleanFileWithNotice(file, "file-menu", true);
              });
          });
        },
      ),
    );

    logDiagnostic("load", this.manifest.id, "ready");
  }

  onunload(): void {
    logDiagnostic("unload", this.manifest.id, "complete");
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    setDiagnosticsEnabled(this.settings.diagnostics);
  }

  async saveSettings(): Promise<void> {
    this.settings = normalizeSettings(this.settings);
    setDiagnosticsEnabled(this.settings.diagnostics);
    await this.saveData(this.settings);
  }

  getGcmFilenameOwnership(): FilenameOwnershipStatus {
    return this.getGcmIntegration().ownership;
  }

  getFrontmatterPriorityKeys(): string[] {
    return resolveFrontmatterPriorityKeys(
      this.getGcmIntegration().plugin?.settings?.properties,
    );
  }

  async checkActiveNote(
    trigger: CleanupTrigger = "command",
    notify = true,
  ): Promise<string> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      return this.finish(
        trigger,
        "",
        "Open a Markdown note before running TPS Linter.",
        notify,
      );
    }
    return this.checkFileWithNotice(file, trigger, notify);
  }

  async cleanActiveNote(
    trigger: CleanupTrigger = "command",
    notify = true,
  ): Promise<string> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== "md") {
      return this.finish(
        trigger,
        "",
        "Open a Markdown note before running TPS Linter.",
        notify,
      );
    }
    return this.cleanFileWithNotice(file, trigger, notify);
  }

  private async checkFileWithNotice(
    file: TFile,
    trigger: CleanupTrigger,
    notify: boolean,
  ): Promise<string> {
    try {
      const exclusion = inspectPathExclusion(
        file.path,
        this.settings.excludedPaths,
      );
      if (exclusion.excluded) {
        return this.finish(
          trigger,
          file.path,
          `TPS Linter skipped ${file.path}: ${exclusion.reason ?? "excluded"}.`,
          notify,
        );
      }

      const inspection = await this.inspectFile(file);
      const summary = this.describeInspection(inspection, false);
      return this.finish(trigger, file.path, summary, notify);
    } catch (error) {
      return this.fail(trigger, file.path, "check failed", error, notify);
    }
  }

  private async cleanFileWithNotice(
    file: TFile,
    trigger: CleanupTrigger,
    notify: boolean,
  ): Promise<string> {
    if (this.activeCleans.has(file)) {
      return this.finish(
        trigger,
        file.path,
        `TPS Linter is already cleaning ${file.path}.`,
        notify,
      );
    }

    this.activeCleans.add(file);
    try {
      const exclusion = inspectPathExclusion(
        file.path,
        this.settings.excludedPaths,
      );
      if (exclusion.excluded) {
        return this.finish(
          trigger,
          file.path,
          `TPS Linter skipped ${file.path}: ${exclusion.reason ?? "excluded"}.`,
          notify,
        );
      }

      const result = await this.cleanFile(file);
      const summary = this.describeCleanResult(result);
      return this.finish(trigger, file.path, summary, notify);
    } catch (error) {
      return this.fail(trigger, file.path, "clean failed", error, notify);
    } finally {
      this.activeCleans.delete(file);
    }
  }

  private async inspectFile(
    file: TFile,
    readFresh = false,
    markdownOptions = this.markdownOptions(),
    filenameOptions = this.filenameOptions(),
    filenameCleaningEnabled = this.settings.cleanFilenames,
  ): Promise<FileInspection> {
    const liveFile = this.app.vault.getFileByPath(file.path);
    if (!(liveFile instanceof TFile) || liveFile.extension !== "md") {
      throw new Error("The selected Markdown file is no longer available.");
    }

    const content = readFresh
      ? await this.app.vault.read(liveFile)
      : await this.app.vault.cachedRead(liveFile);
    const contentSafetyBlock = inspectMarkdownInputSafety(content);
    const lintControls = contentSafetyBlock
      ? safetyBlockedLintControls(contentSafetyBlock)
      : parseLintControls(content);
    const filenamePlan = this.createFilenamePlan(liveFile, filenameOptions);
    const filenameDecision = this.createFilenameDecision(
      filenamePlan,
      liveFile,
      lintControls,
      filenameCleaningEnabled,
    );
    const markdown = cleanMarkdown(content, markdownOptions);

    return {
      file: liveFile,
      filenamePlan,
      filenameDecision,
      lintControls,
      markdown,
    };
  }

  private async cleanFile(file: TFile): Promise<CleanResult> {
    const markdownOptions = this.markdownOptions();
    const filenameOptions = this.filenameOptions();
    const filenameCleaningEnabled = this.settings.cleanFilenames;
    const initialExcludedPaths = [...this.settings.excludedPaths];
    const initialInspection = await this.inspectFile(
      file,
      true,
      markdownOptions,
      filenameOptions,
      filenameCleaningEnabled,
    );
    let contentChanged = false;
    let currentMarkdown = initialInspection.markdown;
    let guardReason: string | null = null;

    await this.app.vault.process(initialInspection.file, (currentContent) => {
      const exclusion = inspectPathExclusion(
        initialInspection.file.path,
        mergeExcludedPaths(initialExcludedPaths, this.settings.excludedPaths),
      );
      if (exclusion.excluded) {
        guardReason = exclusion.reason ?? "the note became excluded";
        return currentContent;
      }

      currentMarkdown = cleanMarkdown(currentContent, markdownOptions);
      contentChanged = currentMarkdown.changed;
      return currentMarkdown.output;
    });

    if (guardReason) {
      const filenameDecision: FilenameRenameDecision = {
        allowed: false,
        reason: "path-excluded",
        detail: guardReason,
      };
      return {
        inspection: {
          ...initialInspection,
          markdown: currentMarkdown,
          filenameDecision,
        },
        contentChanged: false,
        filenameChanged: false,
        filenameDecision,
        guardReason,
      };
    }

    const liveFile = this.app.vault.getFileByPath(initialInspection.file.path);
    if (!(liveFile instanceof TFile) || liveFile.extension !== "md") {
      const filenameDecision: FilenameRenameDecision = {
        allowed: false,
        reason: "invalid-plan",
        detail: "The file changed or disappeared before filename cleanup.",
      };
      return {
        inspection: {
          ...initialInspection,
          markdown: currentMarkdown,
          filenameDecision,
        },
        contentChanged,
        filenameChanged: false,
        filenameDecision,
        guardReason: null,
      };
    }

    let filenamePlan = this.createFilenamePlan(liveFile, filenameOptions);
    let filenameDecision: FilenameRenameDecision = {
      allowed: false,
      reason: "invalid-plan",
      detail: "Filename cleanup did not finish.",
    };
    let lintControls = initialInspection.lintControls;
    let filenameChanged = false;

    try {
      const exclusion = inspectPathExclusion(
        liveFile.path,
        mergeExcludedPaths(initialExcludedPaths, this.settings.excludedPaths),
      );
      if (exclusion.excluded) {
        filenameDecision = {
          allowed: false,
          reason: "path-excluded",
          detail: exclusion.reason ?? "the note became excluded",
        };
      } else {
        const liveContent = await this.app.vault.read(liveFile);
        const finalExclusion = inspectPathExclusion(
          liveFile.path,
          mergeExcludedPaths(initialExcludedPaths, this.settings.excludedPaths),
        );
        if (finalExclusion.excluded) {
          filenameDecision = {
            allowed: false,
            reason: "path-excluded",
            detail: finalExclusion.reason ?? "the note became excluded",
          };
        } else {
          const contentSafetyBlock =
            inspectMarkdownInputSafety(liveContent);
          lintControls = contentSafetyBlock
            ? safetyBlockedLintControls(contentSafetyBlock)
            : parseLintControls(liveContent);
          filenamePlan = this.createFilenamePlan(liveFile, filenameOptions);
          filenameDecision = this.createFilenameDecision(
            filenamePlan,
            liveFile,
            lintControls,
            filenameCleaningEnabled && this.settings.cleanFilenames,
          );

          if (filenameDecision.allowed) {
            await this.app.fileManager.renameFile(
              liveFile,
              filenamePlan.targetPath,
            );
            filenameChanged = true;
          }
        }
      }
    } catch (error) {
      filenameDecision = {
        allowed: false,
        reason: "rename-failed",
        detail: summarizeError(error),
      };
      logWarning(
        "clean:filename",
        liveFile.path,
        `rename failed after markdownChanged=${String(contentChanged)}: ${filenameDecision.detail}`,
      );
    }

    return {
      inspection: {
        file: liveFile,
        filenamePlan,
        filenameDecision,
        lintControls,
        markdown: currentMarkdown,
      },
      contentChanged,
      filenameChanged,
      filenameDecision,
      guardReason: null,
    };
  }

  private createFilenamePlan(
    file: TFile,
    options = this.filenameOptions(),
  ): FilenamePlan {
    return planMarkdownFilename(file.path, options);
  }

  private filenameOptions(): FilenameCleanupOptions {
    return {
      unsafeCharacterStyle: this.settings.filenameUnsafeCharacterStyle,
      removeObsidianLinkCharacters:
        this.settings.removeObsidianLinkCharacters,
    };
  }

  private createFilenameDecision(
    filenamePlan: FilenamePlan,
    file: TFile,
    lintControls: LintControlResult,
    filenameCleaningEnabled: boolean,
  ): FilenameRenameDecision {
    if (lintControls.disabledAll) {
      return {
        allowed: false,
        reason: "note-disabled",
        detail: lintControls.reason,
      };
    }
    if (lintControls.disabledRules.has("filename")) {
      return {
        allowed: false,
        reason: "note-rule-disabled",
        detail: "filename",
      };
    }

    const siblingPaths =
      file.parent?.children
        .filter((child): child is TFile => child instanceof TFile)
        .map((child) => child.path) ?? [file.path];
    return decideFilenameRename(
      filenamePlan,
      siblingPaths,
      this.getGcmFilenameOwnership(),
      filenameCleaningEnabled,
    );
  }

  private markdownOptions(): MarkdownCleanupOptions {
    return {
      cleanWhitespaceOnlyLines: this.settings.cleanWhitespaceOnlyLines,
      collapseConsecutiveBlankLines:
        this.settings.collapseConsecutiveBlankLines,
      trimNonblankTrailingWhitespace:
        this.settings.trimNonblankTrailingWhitespace,
      removeTrailingBlankLines: this.settings.removeTrailingBlankLines,
      ensureFinalNewline: this.settings.ensureFinalNewline,
      headingCapitalizationStyle:
        this.settings.headingCapitalizationStyle,
      normalizeHeadingLevels: this.settings.normalizeHeadingLevels,
      pushHeadingHierarchyToH6: this.settings.pushHeadingHierarchyToH6,
      headingStartLevel: this.settings.headingStartLevel,
      sortFrontmatterFields: this.settings.sortFrontmatterFields,
      frontmatterPriorityKeys: this.getFrontmatterPriorityKeys(),
    };
  }

  private describeInspection(
    inspection: FileInspection,
    applied: boolean,
  ): string {
    return [
      this.describeFilename(
        inspection.filenamePlan,
        inspection.filenameDecision,
        applied,
      ),
      this.describeMarkdown(inspection.markdown, applied),
    ].join(" ");
  }

  private describeCleanResult(result: CleanResult): string {
    if (result.guardReason) {
      return `TPS Linter skipped the note because ${result.guardReason}. No content or filename changes were applied.`;
    }

    const filename = result.filenameChanged
      ? `Renamed the note to “${result.inspection.filenamePlan.targetBasename}”.`
      : this.describeFilename(
          result.inspection.filenamePlan,
          result.filenameDecision,
          true,
        );
    const markdown = this.describeMarkdown(
      result.inspection.markdown,
      result.contentChanged,
    );
    return `${filename} ${markdown}`;
  }

  private describeFilename(
    plan: FilenamePlan,
    decision: FilenameRenameDecision,
    applied: boolean,
  ): string {
    if (decision.reason === "filename-cleaning-disabled") {
      return "Filename cleaning is disabled.";
    }
    if (decision.reason === "note-disabled") {
      return decision.detail
        ? `Filename cleaning is disabled for this note: ${decision.detail}`
        : "Filename cleaning is disabled for this note.";
    }
    if (decision.reason === "note-rule-disabled") {
      return "Filename cleaning is disabled for this note by the filename rule control.";
    }
    if (decision.reason === "gcm-auto-rename-active") {
      return `Filename would become “${plan.targetBasename}”, but TPS Global Context Menu owns automatic filename synchronization.`;
    }
    if (decision.reason === "gcm-ownership-unavailable") {
      return `Filename would become “${plan.targetBasename}”, but TPS Linter could not safely verify TPS Global Context Menu filename ownership.`;
    }
    if (decision.reason === "target-collision") {
      return `Filename would become “${plan.targetBasename}”, but ${decision.detail ?? "that target"} already exists.`;
    }
    if (decision.reason === "path-excluded") {
      return `Filename cleanup was skipped because ${decision.detail ?? "the note became excluded"}.`;
    }
    if (decision.reason === "rename-failed") {
      return `Filename cleanup could not finish: ${decision.detail ?? "the rename failed"}.`;
    }
    if (!plan.valid) {
      return `Filename cleanup is blocked: ${plan.blockReason ?? "invalid result"}`;
    }
    if (!plan.changed) return "Filename is already clean.";
    if (decision.reason === "case-only-rename") {
      return `Filename cleanup is blocked: ${decision.detail ?? "case-only rename"}`;
    }
    if (decision.reason === "invalid-plan") {
      return `Filename cleanup is blocked: ${decision.detail ?? "invalid result"}`;
    }
    if (applied) {
      return `Filename is eligible to become “${plan.targetBasename}”.`;
    }
    return `Filename would become “${plan.targetBasename}”.`;
  }

  private describeMarkdown(
    result: MarkdownCleanupResult,
    applied: boolean,
  ): string {
    if (result.noteDisabledReason) {
      return `Markdown cleanup is disabled for this note: ${result.noteDisabledReason}`;
    }
    if (result.safetyBlockedReason) {
      return `Markdown cleanup was blocked by the safety verifier because ${result.safetyBlockedReason}.`;
    }

    const skippedReason = result.changes.frontmatterSortSkippedReason;
    const disabledRules =
      result.disabledRules.length > 0
        ? ` Disabled for this note: ${result.disabledRules.join(", ")}.`
        : "";
    if (!result.changed) {
      const summary = skippedReason
        ? `Markdown is unchanged. Frontmatter sorting was skipped because ${skippedReason}.`
        : "Markdown is already clean.";
      return `${summary}${disabledRules}`;
    }

    const actions: string[] = [];
    const whitespaceLines = result.changes.whitespaceOnlyLinesCleaned;
    const blankLines = result.changes.extraBlankLinesRemoved;
    const trailingLines =
      result.changes.nonblankTrailingWhitespaceLinesCleaned;
    const trailingBlankLines =
      result.changes.trailingBlankLinesRemoved;
    const capitalizedHeadings = result.changes.headingsCapitalized;
    const adjustedHeadingLevels = result.changes.headingLevelsAdjusted;
    const reorderedFields = result.changes.frontmatterFieldsReordered;
    if (whitespaceLines > 0) {
      actions.push(
        `${applied ? "cleared" : "clear"} ${whitespaceLines} whitespace-only ${plural("line", whitespaceLines)}`,
      );
    }
    if (blankLines > 0) {
      actions.push(
        `${applied ? "removed" : "remove"} ${blankLines} extra blank ${plural("line", blankLines)}`,
      );
    }
    if (trailingLines > 0) {
      actions.push(
        `${applied ? "trimmed" : "trim"} trailing whitespace on ${trailingLines} ${plural("line", trailingLines)}`,
      );
    }
    if (trailingBlankLines > 0) {
      actions.push(
        `${applied ? "removed" : "remove"} ${trailingBlankLines} trailing blank ${plural("line", trailingBlankLines)}`,
      );
    }
    if (capitalizedHeadings > 0) {
      actions.push(
        `${applied ? "capitalized" : "capitalize"} ${capitalizedHeadings} ${plural("heading", capitalizedHeadings)}`,
      );
    }
    if (adjustedHeadingLevels > 0) {
      actions.push(
        `${applied ? "adjusted" : "adjust"} ${adjustedHeadingLevels} heading ${plural("level", adjustedHeadingLevels)}`,
      );
    }
    if (reorderedFields > 0) {
      actions.push(
        `${applied ? "reordered" : "reorder"} ${reorderedFields} frontmatter ${plural("field", reorderedFields)}`,
      );
    }
    if (result.changes.finalNewlineAdded) {
      actions.push(applied ? "added a final newline" : "add a final newline");
    }

    const summary = `Markdown ${applied ? "was cleaned" : "would change"}: ${joinActions(actions)}.`;
    const withSkip = skippedReason
      ? `${summary} Frontmatter sorting was skipped because ${skippedReason}.`
      : summary;
    return `${withSkip}${disabledRules}`;
  }

  private getGcmIntegration() {
    return inspectGcmIntegration(
      (this.app as App & { plugins?: unknown }).plugins,
    );
  }

  private finish(
    trigger: CleanupTrigger,
    path: string,
    message: string,
    notify: boolean,
  ): string {
    logDiagnostic(trigger, path, message);
    if (notify) new Notice(message, 7000);
    return message;
  }

  private fail(
    trigger: CleanupTrigger,
    path: string,
    result: string,
    error: unknown,
    notify: boolean,
  ): string {
    logError(trigger, path, result, error);
    const message = `TPS Linter could not finish: ${summarizeError(error)}`;
    if (notify) new Notice(message, 8000);
    return message;
  }
}

function plural(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function joinActions(actions: readonly string[]): string {
  if (actions.length === 0) return "apply the configured rules";
  if (actions.length === 1) return actions[0] ?? "";
  if (actions.length === 2) return `${actions[0]} and ${actions[1]}`;
  return `${actions.slice(0, -1).join(", ")}, and ${actions.at(-1)}`;
}

function mergeExcludedPaths(
  first: readonly string[],
  second: readonly string[],
): string[] {
  return [...new Set([...first, ...second])];
}

function safetyBlockedLintControls(reason: string): LintControlResult {
  return {
    controlsPresent: false,
    disabledAll: true,
    disabledRules: new Set(),
    reason: `Safety blocked: ${reason}.`,
  };
}
