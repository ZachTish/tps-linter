import {
  App,
  ButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";

import type TPSLinterPlugin from "./main";
import type {
  FilenameUnsafeCharacterStyle,
  HeadingCapitalizationStyle,
  HeadingStartLevel,
} from "./settings";

type SettingsDestination =
  | "clean-notes"
  | "headings"
  | "frontmatter"
  | "files-safety";

const SETTINGS_DESTINATIONS: ReadonlyArray<{
  id: SettingsDestination;
  label: string;
  description: string;
}> = [
  {
    id: "clean-notes",
    label: "Clean notes",
    description: "Save workflow and whitespace",
  },
  {
    id: "headings",
    label: "Headings",
    description: "Capitalization and levels",
  },
  {
    id: "frontmatter",
    label: "Frontmatter",
    description: "Field order and body spacing",
  },
  {
    id: "files-safety",
    label: "Files & safety",
    description: "Names, scope, and diagnostics",
  },
];

export class TPSLinterSettingTab extends PluginSettingTab {
  private readonly plugin: TPSLinterPlugin;
  private activeDestination: SettingsDestination = "clean-notes";
  private routeButtons = new Map<SettingsDestination, HTMLButtonElement>();
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
      text: "Check or clean one Markdown note. Lint on save can automatically clean the active Markdown editor; TPS Linter never scans the whole vault.",
    });

    this.renderActions(containerEl);
    this.renderDestinationHub(containerEl);

    const destination = containerEl.createDiv({
      cls: "tps-linter-settings-destination",
    });
    destination.setAttribute("data-destination", this.activeDestination);

    switch (this.activeDestination) {
      case "clean-notes":
        this.renderMarkdownRules(destination);
        break;
      case "headings":
        this.renderHeadingRules(destination);
        break;
      case "frontmatter":
        this.renderFrontmatterRules(destination);
        break;
      case "files-safety":
        this.renderOwnership(destination);
        this.renderFilenameRules(destination);
        this.renderScope(destination);
        this.renderNoteLocalControls(destination);
        this.renderDiagnostics(destination);
        break;
    }
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

  private renderDestinationHub(parent: HTMLElement): void {
    const hub = parent.createDiv({ cls: "tps-linter-settings-route-hub" });
    hub.createEl("h3", { text: "Choose what to configure" });
    hub.createEl("p", {
      text: "Each area stays one click away. Your selected area is temporary and is not saved as a plugin setting.",
    });

    const routes = hub.createDiv({ cls: "tps-linter-settings-route-strip" });
    routes.setAttribute("role", "group");
    routes.setAttribute("aria-label", "TPS Linter settings areas");
    this.routeButtons.clear();

    for (const destination of SETTINGS_DESTINATIONS) {
      const button = routes.createEl("button", {
        cls: "tps-linter-settings-route",
        attr: {
          type: "button",
          "aria-pressed":
            destination.id === this.activeDestination ? "true" : "false",
          "aria-label": `${destination.label}: ${destination.description}`,
        },
      });
      button.createEl("strong", { text: destination.label });
      button.createSpan({ text: destination.description });
      button.addEventListener("click", () => {
        this.activeDestination = destination.id;
        this.display();
        this.routeButtons.get(destination.id)?.focus();
      });
      this.routeButtons.set(destination.id, button);
    }
  }

  private renderOwnership(parent: HTMLElement): void {
    const ownershipStatus = this.plugin.getGcmFilenameOwnership();
    const ownership = parent.createDiv({ cls: "tps-linter-settings-ownership" });
    const copy = ownership.createDiv({ cls: "tps-linter-settings-ownership-copy" });
    copy.createEl("strong", { text: "Automatic filename ownership" });
    copy.createSpan({
      text: "TPS Global Context Menu currently owns automatic title and filename synchronization.",
    });
    copy.createSpan({
      text:
        ownershipStatus === "gcm-active"
          ? "Its automatic rename setting is active, so TPS Linter will check but not rename filenames."
          : ownershipStatus === "unavailable"
            ? "TPS Linter cannot safely verify GCM's filename ownership right now, so filename changes will fail closed."
            : "TPS Linter can apply an explicit manual filename cleanup when GCM automatic rename is inactive or GCM is not loaded.",
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
      .setName("Clean filenames")
      .setDesc("Allow an explicit Clean action to apply an eligible filename plan. Turn this off to lint note content only.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.cleanFilenames)
          .onChange(async (value) => {
            this.plugin.settings.cleanFilenames = value;
            await this.plugin.saveSettings();
          });
      });

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
    parent.createEl("h3", { text: "Clean notes" });

    new Setting(parent)
      .setName("Lint notes on save")
      .setDesc("Automatically clean the active Markdown editor after Obsidian persists a modification or when you press the standard Cmd-S/Ctrl-S shortcut in that editor. A small notice lists applied changes; filename cleanup remains manual, and no whole-vault scan runs.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.lintOnSave)
          .onChange(async (value) => {
            this.plugin.settings.lintOnSave = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Add blank line at beginning of note")
      .setDesc("Insert one empty first line in notes without frontmatter. Frontmatter stays on line one; use Add blank line after frontmatter for those notes.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ensureBlankLineAtBeginning)
          .onChange(async (value) => {
            this.plugin.settings.ensureBlankLineAtBeginning = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Remove extra blank lines")
      .setDesc("Collapse consecutive blank lines to one outside protected YAML, code, math, raw HTML, and Templater regions.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.collapseConsecutiveBlankLines)
          .onChange(async (value) => {
            this.plugin.settings.collapseConsecutiveBlankLines = value;
            await this.plugin.saveSettings();
          });
      });

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

    new Setting(parent)
      .setName("Remove trailing blank lines")
      .setDesc("Remove unprotected blank padding at the end of a note while retaining exactly one final newline. Off preserves existing terminal blank lines.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.removeTrailingBlankLines)
          .onChange(async (value) => {
            this.plugin.settings.removeTrailingBlankLines = value;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderHeadingRules(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Headings" });

    new Setting(parent)
      .setName("Capitalize headings")
      .setDesc("Choose how cleanup adjusts plain ATX heading text. First letter is the conservative TPS default.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("off", "Off")
          .addOption("first-letter", "Capitalize first letter")
          .addOption("title-case", "Use title case")
          .setValue(this.plugin.settings.headingCapitalizationStyle)
          .onChange(async (value) => {
            this.plugin.settings.headingCapitalizationStyle =
              value as HeadingCapitalizationStyle;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Normalize heading levels")
      .setDesc("Start the heading hierarchy at the selected level and prevent a heading from increasing by more than one level.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.normalizeHeadingLevels)
          .onChange(async (value) => {
            this.plugin.settings.normalizeHeadingLevels = value;
            await this.plugin.saveSettings();
            this.display();
            this.focusSettingControl("Normalize heading levels");
          });
      });

    if (this.plugin.settings.normalizeHeadingLevels) {
      new Setting(parent)
        .setName("Push heading hierarchy down to H6")
        .setDesc("Move the complete ATX heading outline down so its deepest nested level is H6. A standalone heading becomes H6 while parent and sibling relationships stay intact.")
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.pushHeadingHierarchyToH6)
            .onChange(async (value) => {
              this.plugin.settings.pushHeadingHierarchyToH6 = value;
              await this.plugin.saveSettings();
              this.display();
              this.focusSettingControl("Push heading hierarchy down to H6");
            });
        });
    }

    if (
      this.plugin.settings.normalizeHeadingLevels &&
      !this.plugin.settings.pushHeadingHierarchyToH6
    ) {
      new Setting(parent)
        .setName("First heading level")
        .setDesc("Use H1 for normal notes or H2 when another system owns the page title.")
        .addDropdown((dropdown) => {
          dropdown
            .addOption("1", "H1")
            .addOption("2", "H2")
            .setValue(String(this.plugin.settings.headingStartLevel))
            .onChange(async (value) => {
              this.plugin.settings.headingStartLevel =
                Number(value) as HeadingStartLevel;
              await this.plugin.saveSettings();
            });
        });
    }
  }

  private renderFrontmatterRules(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Frontmatter" });

    new Setting(parent)
      .setName("Sort frontmatter fields")
      .setDesc("Order top-level fields using TPS Global Context Menu property priority first, then sort remaining fields alphabetically.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.sortFrontmatterFields)
          .onChange(async (value) => {
            this.plugin.settings.sortFrontmatterFields = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Add blank line after frontmatter")
      .setDesc("Keep one empty, editable body line after valid top-of-note frontmatter, including metadata-only notes. Existing body spacing is left to the blank-line rules.")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.ensureBlankLineAfterFrontmatter)
          .onChange(async (value) => {
            this.plugin.settings.ensureBlankLineAfterFrontmatter = value;
            await this.plugin.saveSettings();
          });
      });

    const ownership = parent.createDiv({
      cls: "tps-linter-settings-frontmatter-ownership",
    });
    const copy = ownership.createDiv({
      cls: "tps-linter-settings-frontmatter-copy",
    });
    copy.createEl("strong", { text: "Property order ownership" });
    copy.createSpan({
      text: "TPS Global Context Menu owns the shared priority order. TPS Linter follows that order when available and uses its TPS fallback order otherwise; fields not listed there remain alphabetical.",
    });
    copy.createSpan({
      text: `Current priority: ${this.plugin.getFrontmatterPriorityKeys().join(" → ")}`,
    });
    const controls = ownership.createDiv({
      cls: "tps-linter-settings-frontmatter-actions",
    });
    new ButtonComponent(controls)
      .setButtonText("Open GCM settings")
      .setTooltip("Configure TPS Global Context Menu property order")
      .onClick(() => this.openPluginSettings("tps-global-context-menu"));
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

  private renderNoteLocalControls(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Note-local controls" });
    const reference = parent.createDiv({
      cls: "tps-linter-settings-reference",
    });
    const switchCopy = reference.createEl("p");
    switchCopy.appendText("Use ");
    switchCopy.createEl("code", { text: "tps-linter: false" });
    switchCopy.appendText(
      " in top-level frontmatter to disable every rule for one note. Use ",
    );
    switchCopy.createEl("code", {
      text: "tps-linter-disabled-rules",
    });
    switchCopy.appendText(" to disable selected stable rule IDs.");
    const ruleCopy = reference.createEl("p");
    ruleCopy.appendText("Rule IDs: ");
    ruleCopy.createEl("code", {
      text: "filename, whitespace-only-lines, blank-lines, trailing-whitespace, trailing-blank-lines, final-newline, leading-blank-line, heading-capitalization, heading-levels, frontmatter-blank-line, frontmatter-sort, all",
    });
    ruleCopy.appendText(".");

    const rangeCopy = reference.createEl("p");
    rangeCopy.appendText("Protect an exact body range with standalone ");
    rangeCopy.createEl("code", {
      text: "<!-- tps-linter-disable -->",
    });
    rangeCopy.appendText(" and ");
    rangeCopy.createEl("code", {
      text: "<!-- tps-linter-enable -->",
    });
    rangeCopy.appendText(
      " markers; Obsidian %% marker forms are also supported. Invalid controls fail closed.",
    );
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
    if (!settings?.open || !settings.openTabById) {
      new Notice(
        "TPS Linter could not open that plugin's settings in this Obsidian version.",
        7000,
      );
      return;
    }
    settings.open();
    settings.openTabById(pluginId);
  }

  private focusSettingControl(settingName: string): void {
    const settingItems = Array.from(
      this.containerEl.querySelectorAll(".setting-item"),
    ) as HTMLElement[];
    for (const settingItem of settingItems) {
      const name = settingItem.querySelector(
        ".setting-item-name",
      ) as HTMLElement | null;
      if (name?.textContent !== settingName) continue;

      const control = settingItem.querySelector(
        "button, input, select, textarea",
      ) as HTMLElement | null;
      control?.focus();
      return;
    }
  }
}
