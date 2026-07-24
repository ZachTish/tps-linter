import { App, ButtonComponent, PluginSettingTab, Setting } from "obsidian";

import type TPSLinterPlugin from "./main";
import type { FilenameUnsafeCharacterStyle } from "./settings";

export class TPSLinterSettingTab extends PluginSettingTab {
  private readonly plugin: TPSLinterPlugin;
  private statusEl: HTMLElement | null = null;

  constructor(app: App, plugin: TPSLinterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("tps-linter-settings");

    containerEl.createEl("h2", { text: "TPS Linter" });
    containerEl.createEl("p", {
      cls: "tps-linter-settings-intro",
      text: "Check first, then clean one explicit Markdown note. Version 0.1.0 performs no background or whole-vault cleanup.",
    });

    this.renderActions(containerEl);
    this.renderOwnership(containerEl);
    this.renderFilenameRules(containerEl);
    this.renderMarkdownRules(containerEl);
    this.renderScope(containerEl);
    this.renderDiagnostics(containerEl);
  }

  private renderActions(parent: HTMLElement): void {
    const actions = parent.createDiv({ cls: "tps-linter-settings-actions" });
    const copy = actions.createDiv({ cls: "tps-linter-settings-action-copy" });
    copy.createEl("strong", { text: "Current note" });
    copy.createSpan({
      text: "Check is read-only. Clean rechecks the live file and applies only eligible changes.",
    });

    const controls = actions.createDiv({ cls: "tps-linter-settings-action-buttons" });
    new ButtonComponent(controls)
      .setButtonText("Check current note")
      .setTooltip("Report eligible filename and Markdown changes without writing")
      .onClick(() => {
        void this.runAction(() => this.plugin.checkActiveNote("settings", false));
      });
    new ButtonComponent(controls)
      .setButtonText("Clean current note")
      .setTooltip("Apply the configured rules to the current eligible note")
      .setCta()
      .onClick(() => {
        void this.runAction(() => this.plugin.cleanActiveNote("settings", false));
      });

    this.statusEl = parent.createDiv({ cls: "tps-linter-settings-status" });
    this.statusEl.setAttribute("aria-live", "polite");
    this.statusEl.setAttribute("role", "status");
  }

  private renderOwnership(parent: HTMLElement): void {
    const ownership = parent.createDiv({ cls: "tps-linter-settings-ownership" });
    const copy = ownership.createDiv({ cls: "tps-linter-settings-ownership-copy" });
    copy.createEl("strong", { text: "Automatic filename ownership" });
    copy.createSpan({
      text: "TPS Global Context Menu currently owns automatic title and filename synchronization.",
    });
    copy.createSpan({
      text: this.plugin.isGcmAutoRenameActive()
        ? "Its automatic rename setting is active, so TPS Linter will check but not rename filenames."
        : "TPS Linter can apply an explicit manual filename cleanup when GCM automatic rename is inactive.",
    });

    const controls = ownership.createDiv({ cls: "tps-linter-settings-ownership-actions" });
    new ButtonComponent(controls)
      .setButtonText("Open GCM settings")
      .setTooltip("Open TPS Global Context Menu settings")
      .onClick(() => this.openPluginSettings("tps-global-context-menu"));
  }

  private renderFilenameRules(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Filename rules" });

    new Setting(parent)
      .setName("Unsafe character replacement")
      .setDesc("How a manual filename plan handles control characters and cross-platform-unsafe filename characters.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("space", "Replace with a space")
          .addOption("dash", "Replace with a dash")
          .addOption("remove", "Remove")
          .setValue(this.plugin.settings.filenameUnsafeCharacterStyle)
          .onChange(async (value) => {
            this.plugin.settings.filenameUnsafeCharacterStyle = value as FilenameUnsafeCharacterStyle;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Remove Obsidian link-control characters")
      .setDesc("Also remove #, ^, [, and ] from a manual filename plan. Off preserves existing TPS names.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.removeObsidianLinkCharacters)
          .onChange(async (value) => {
            this.plugin.settings.removeObsidianLinkCharacters = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderMarkdownRules(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Markdown rules" });

    new Setting(parent)
      .setName("Clear whitespace-only lines")
      .setDesc("Remove spaces and tabs from blank lines outside protected YAML, code, raw HTML, and Templater regions.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.cleanWhitespaceOnlyLines)
          .onChange(async (value) => {
            this.plugin.settings.cleanWhitespaceOnlyLines = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Trim nonblank trailing whitespace")
      .setDesc("Remove trailing spaces and tabs outside protected regions while retaining a two-space Markdown hard break.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.trimNonblankTrailingWhitespace)
          .onChange(async (value) => {
            this.plugin.settings.trimNonblankTrailingWhitespace = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Ensure a final newline")
      .setDesc("Add one missing final newline to a non-empty note without removing existing terminal blank lines or changing existing line endings.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ensureFinalNewline)
          .onChange(async (value) => {
            this.plugin.settings.ensureFinalNewline = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderScope(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Scope" });

    new Setting(parent)
      .setName("Excluded paths")
      .setDesc("One exact file, folder prefix, or segment-safe * wildcard per line. Internal TPS safety guards always remain active.")
      .addTextArea((text) => {
        text
          .setPlaceholder("Templates\nRecurring Templates\n_archive")
          .setValue(this.plugin.settings.excludedPaths.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludedPaths = value
              .split(/\r?\n/)
              .map((entry) => entry.trim())
              .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 7;
        text.inputEl.setAttribute("aria-label", "Excluded TPS Linter paths");
      });
  }

  private renderDiagnostics(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Diagnostics" });

    new Setting(parent)
      .setName("Log cleanup decisions")
      .setDesc("Log compact trigger, path, and result fields. Note bodies and full settings are never logged.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.diagnostics)
          .onChange(async (value) => {
            this.plugin.settings.diagnostics = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private async runAction(action: () => Promise<string>): Promise<void> {
    if (this.statusEl) this.statusEl.setText("Working…");
    try {
      const result = await action();
      if (this.statusEl) this.statusEl.setText(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.statusEl) this.statusEl.setText(`TPS Linter could not finish: ${message}`);
    }
  }

  private openPluginSettings(pluginId: string): void {
    const settings = (this.app as App & {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    }).setting;
    settings?.open?.();
    settings?.openTabById?.(pluginId);
  }
}
