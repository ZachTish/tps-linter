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
  inspectPathExclusion,
  planMarkdownFilename,
  type FilenamePlan,
  type FilenameRenameDecision,
  type MarkdownCleanupOptions,
  type MarkdownCleanupResult,
} from "./cleaner";
import {
  logDiagnostic,
  logError,
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
  markdown: MarkdownCleanupResult;
}

interface CleanResult {
  inspection: FileInspection;
  contentChanged: boolean;
  filenameChanged: boolean;
  filenameDecision: FilenameRenameDecision;
}

interface PluginManagerLike {
  getPlugin?: (id: string) => unknown;
}

interface GcmPluginLike {
  settings?: {
    enableAutoRename?: boolean;
    properties?: Array<{
      key?: unknown;
    }>;
  };
}

export default class TPSLinterPlugin extends Plugin {
  settings!: TPSLinterSettings;

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

  isGcmAutoRenameActive(): boolean {
    return this.getGcmPlugin()?.settings?.enableAutoRename === true;
  }

  getFrontmatterPriorityKeys(): string[] {
    return resolveFrontmatterPriorityKeys(
      this.getGcmPlugin()?.settings?.properties,
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
    }
  }

  private async inspectFile(file: TFile): Promise<FileInspection> {
    const liveFile = this.app.vault.getFileByPath(file.path);
    if (!(liveFile instanceof TFile) || liveFile.extension !== "md") {
      throw new Error("The selected Markdown file is no longer available.");
    }

    const filenamePlan = this.createFilenamePlan(liveFile);
    const filenameDecision = this.createFilenameDecision(filenamePlan);
    const content = await this.app.vault.cachedRead(liveFile);
    const markdown = cleanMarkdown(content, this.markdownOptions());

    return {
      file: liveFile,
      filenamePlan,
      filenameDecision,
      markdown,
    };
  }

  private async cleanFile(file: TFile): Promise<CleanResult> {
    const initialInspection = await this.inspectFile(file);
    let contentChanged = false;
    let currentMarkdown = initialInspection.markdown;

    if (initialInspection.markdown.changed) {
      await this.app.vault.process(initialInspection.file, (currentContent) => {
        currentMarkdown = cleanMarkdown(
          currentContent,
          this.markdownOptions(),
        );
        contentChanged = currentMarkdown.changed;
        return currentMarkdown.output;
      });
    }

    const liveFile = this.app.vault.getFileByPath(initialInspection.file.path);
    if (!(liveFile instanceof TFile) || liveFile.extension !== "md") {
      return {
        inspection: {
          ...initialInspection,
          markdown: currentMarkdown,
        },
        contentChanged,
        filenameChanged: false,
        filenameDecision: {
          allowed: false,
          reason: "invalid-plan",
          detail: "The file changed or disappeared before filename cleanup.",
        },
      };
    }

    const filenamePlan = this.createFilenamePlan(liveFile);
    const filenameDecision = this.createFilenameDecision(filenamePlan);
    let filenameChanged = false;

    if (filenameDecision.allowed) {
      await this.app.fileManager.renameFile(liveFile, filenamePlan.targetPath);
      filenameChanged = true;
    }

    return {
      inspection: {
        file: liveFile,
        filenamePlan,
        filenameDecision,
        markdown: currentMarkdown,
      },
      contentChanged,
      filenameChanged,
      filenameDecision,
    };
  }

  private createFilenamePlan(file: TFile): FilenamePlan {
    return planMarkdownFilename(file.path, {
      unsafeCharacterStyle: this.settings.filenameUnsafeCharacterStyle,
      removeObsidianLinkCharacters:
        this.settings.removeObsidianLinkCharacters,
    });
  }

  private createFilenameDecision(
    filenamePlan: FilenamePlan,
  ): FilenameRenameDecision {
    return decideFilenameRename(
      filenamePlan,
      this.app.vault.getMarkdownFiles().map((file) => file.path),
      this.isGcmAutoRenameActive(),
    );
  }

  private markdownOptions(): MarkdownCleanupOptions {
    return {
      cleanWhitespaceOnlyLines: this.settings.cleanWhitespaceOnlyLines,
      collapseConsecutiveBlankLines:
        this.settings.collapseConsecutiveBlankLines,
      trimNonblankTrailingWhitespace:
        this.settings.trimNonblankTrailingWhitespace,
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
    if (!plan.valid) {
      return `Filename cleanup is blocked: ${plan.blockReason ?? "invalid result"}`;
    }
    if (!plan.changed) return "Filename is already clean.";
    if (decision.reason === "gcm-auto-rename-active") {
      return `Filename would become “${plan.targetBasename}”, but TPS Global Context Menu owns automatic filename synchronization.`;
    }
    if (decision.reason === "target-collision") {
      return `Filename would become “${plan.targetBasename}”, but ${decision.detail ?? "that target"} already exists.`;
    }
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
    const skippedReason = result.changes.frontmatterSortSkippedReason;
    if (!result.changed) {
      return skippedReason
        ? `Markdown is unchanged. Frontmatter sorting was skipped because ${skippedReason}.`
        : "Markdown is already clean.";
    }

    const actions: string[] = [];
    const whitespaceLines = result.changes.whitespaceOnlyLinesCleaned;
    const blankLines = result.changes.extraBlankLinesRemoved;
    const trailingLines =
      result.changes.nonblankTrailingWhitespaceLinesCleaned;
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
    return skippedReason
      ? `${summary} Frontmatter sorting was skipped because ${skippedReason}.`
      : summary;
  }

  private getGcmPlugin(): GcmPluginLike | null {
    const plugins = (this.app as App & { plugins?: PluginManagerLike }).plugins;
    return (
      (plugins?.getPlugin?.(
        "tps-global-context-menu",
      ) as GcmPluginLike | null | undefined) ?? null
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
