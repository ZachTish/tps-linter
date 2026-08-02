import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const versions = JSON.parse(readFileSync(new URL("../versions.json", import.meta.url), "utf8"));
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const cleanerSource = readFileSync(new URL("../src/cleaner.ts", import.meta.url), "utf8");
const gcmCompatSource = readFileSync(new URL("../src/gcm-compat.ts", import.meta.url), "utf8");
const lintControlsSource = readFileSync(new URL("../src/lint-controls.ts", import.meta.url), "utf8");
const saveLintSchedulerSource = readFileSync(new URL("../src/save-lint-scheduler.ts", import.meta.url), "utf8");
const settingsTabSource = readFileSync(new URL("../src/settings-tab.ts", import.meta.url), "utf8");
const vaultFileIdentitySource = readFileSync(new URL("../src/vault-file-identity.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const esbuildSource = readFileSync(new URL("../esbuild.config.mjs", import.meta.url), "utf8");
const allSource = readTypeScriptTree(sourceRoot);

test("TPS Linter release metadata is aligned", () => {
  assert.deepEqual(manifest, {
    id: "tps-linter",
    name: "TPS Linter",
    version: "0.6.0",
    minAppVersion: "1.10.0",
    description: "TPS-specific note and filename cleanup with safe active-note linting.",
    author: "Zach Tisherman",
    authorUrl: "https://github.com/ZachTish",
    isDesktopOnly: false,
  });
  assert.equal(packageJson.name, manifest.id);
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageLock.name, manifest.id);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(packageLock.packages?.[""]?.name, manifest.id);
  assert.equal(packageLock.packages?.[""]?.version, manifest.version);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.dependencies?.yaml, "2.9.0");
  assert.deepEqual(versions, {
    "0.1.0": "1.10.0",
    "0.2.0": "1.10.0",
    "0.3.0": "1.10.0",
    "0.4.0": "1.10.0",
    "0.5.0": "1.10.0",
    "0.5.1": "1.10.0",
    "0.5.2": "1.10.0",
    "0.5.3": "1.10.0",
    "0.5.4": "1.10.0",
    "0.5.5": "1.10.0",
    "0.5.6": "1.10.0",
    "0.5.7": "1.10.0",
    "0.5.8": "1.10.0",
    "0.6.0": "1.10.0",
  });
  assert.match(esbuildSource, /Copyright Eemeli Aro/);
  assert.match(esbuildSource, /Permission to use, copy, modify/);
});

test("TPS Linter exposes explicit check and clean commands", () => {
  assert.match(mainSource, /name:\s*["']Check current note["']/);
  assert.match(mainSource, /name:\s*["']Clean current note["']/);
});

test("leading blank-line cleanup is wired through settings, runtime, and reporting", () => {
  assert.match(
    mainSource,
    /ensureBlankLineAtBeginning:\s*this\.settings\.ensureBlankLineAtBeginning/,
  );
  assert.match(cleanerSource, /function addBlankLineAtBeginning\(input: string\)/);
  assert.match(cleanerSource, /!disabledRules\.has\("leading-blank-line"\)/);
  assert.match(cleanerSource, /cleanup output would exceed a safety limit/);
  assert.match(mainSource, /added a blank line at the beginning of the note/);
  assert.match(
    settingsTabSource,
    /setName\("Add blank line at beginning of note"\)/,
  );
});

test("save linting is active-note scoped and keeps automatic filename ownership with GCM", () => {
  assert.match(
    settingsTabSource,
    /TPS Global Context Menu currently owns automatic title and filename synchronization\./,
  );
  assert.match(settingsTabSource, /setButtonText\(["']Open GCM settings["']\)/);
  assert.match(settingsTabSource, /openPluginSettings\(["']tps-global-context-menu["']\)/);

  assert.equal(
    (mainSource.match(/\.vault\.on\(\s*["']modify["']/g) ?? []).length,
    1,
    "TPS Linter should register one supported modify hook",
  );
  assert.match(mainSource, /this\.queueSaveLint\(file\)/);
  assert.doesNotMatch(
    allSource,
    /\.vault\.on\(\s*["'](?:create|rename|delete)["']/,
    "save linting must not add create, rename, or delete hooks",
  );
  assert.doesNotMatch(
    allSource,
    /\.workspace\.on\(\s*["'](?:file-open|editor-change|active-leaf-change)["']/,
    "TPS Linter must not register automatic workspace cleanup hooks",
  );
  assert.doesNotMatch(allSource, /\bsetInterval\s*\(/);

  const queueSource = sourceBetween(
    mainSource,
    "  private queueSaveLint(file: TAbstractFile): void {",
    "  private async lintFileOnSave(file: TFile): Promise<void> {",
  );
  assert.match(queueSource, /this\.settings\.lintOnSave/);
  assert.match(queueSource, /this\.saveLintLifecycle\.isActive\(\)/);
  assert.match(queueSource, /file\.extension !== "md"/);
  assert.match(queueSource, /this\.getActiveEditingView\(file\)/);
  assert.match(queueSource, /inspectPathExclusion\(/);
  assert.match(queueSource, /this\.saveLintScheduler\?\.request\(file\)/);

  const saveSource = sourceBetween(
    mainSource,
    "  private async lintFileOnSave(file: TFile): Promise<void> {",
    "  getGcmFilenameOwnership(): FilenameOwnershipStatus {",
  );
  assert.match(saveSource, /const freshContent = await this\.app\.vault\.read\(file\)/);
  assert.match(
    saveSource,
    /const lifecycleGeneration = this\.saveLintLifecycle\.capture\(\)/,
  );
  assert.ok(
    (saveSource.match(
      /this\.saveLintLifecycle\.isCurrent\(lifecycleGeneration\)/g,
    ) ?? []).length >= 3,
    "save lint must guard entry, post-read preflight, and the process callback",
  );
  assert.match(saveSource, /if \(!preflight\.changed\)/);
  assert.match(saveSource, /await this\.app\.vault\.process\(file,/);
  assert.match(saveSource, /mergeExcludedPaths\(/);
  assert.match(saveSource, /this\.settings\.lintOnSave/);
  assert.match(saveSource, /currentView\.editor\.getValue\(\)/);
  assert.match(saveSource, /processView\.editor\.getValue\(\)/);
  assert.match(saveSource, /editorContentMatchesFile\(/);
  assert.match(saveSource, /the editor has newer unsaved content/);
  assert.match(
    saveSource,
    /const processOptions = this\.markdownOptions\(\)/,
    "the atomic callback must resolve current rule settings",
  );
  assert.match(
    saveSource,
    /currentContent === freshContent[\s\S]*JSON\.stringify\(processOptions\) === preflightOptionsFingerprint[\s\S]*\? preflight[\s\S]*: cleanMarkdown\(currentContent, processOptions\)/,
    "an unchanged revision may reuse the verified preflight only when current rule settings match",
  );
  assert.doesNotMatch(
    saveSource,
    /cleanMarkdown\(currentContent,\s*preflightOptions\)/,
    "a changed revision must not use the preflight options snapshot",
  );
  assert.doesNotMatch(saveSource, /createFilenamePlan|createFilenameDecision/);
  assert.doesNotMatch(saveSource, /renameFile|new Notice/);

  assert.match(saveLintSchedulerSource, /rerunRequested/);
  assert.match(saveLintSchedulerSource, /cancelPending\(\)/);
  assert.match(saveLintSchedulerSource, /dispose\(\)/);

  const unloadSource = sourceBetween(
    mainSource,
    "  onunload(): void {",
    "  async loadSettings(): Promise<void> {",
  );
  assert.ok(
    unloadSource.indexOf("this.saveLintLifecycle.invalidate()") <
      unloadSource.indexOf("this.saveLintScheduler?.dispose()"),
    "unload must invalidate in-flight work before disposing queued work",
  );

  const onloadSource = sourceBetween(
    mainSource,
    "  async onload(): Promise<void> {",
    "  onunload(): void {",
  );
  assert.match(
    onloadSource,
    /await this\.loadSettings\(\);\s*if \(!this\.saveLintLifecycle\.isCurrent\(lifecycleGeneration\)\)/,
    "onload must not initialize after an unload during settings I/O",
  );
});

test("TPS Linter follows GCM frontmatter priority without invoking its mutator", () => {
  assert.match(mainSource, /settings\?\.properties/);
  assert.match(mainSource, /getFrontmatterPriorityKeys/);
  assert.match(allSource, /status[\s\S]*priority[\s\S]*tags[\s\S]*recurrence[\s\S]*scheduled[\s\S]*folderPath/);
  assert.doesNotMatch(allSource, /frontmatterMutationService/);
  assert.doesNotMatch(allSource, /processFrontMatter/);
  assert.match(allSource, /sortTopLevelFrontmatterFields/);
  assert.match(allSource, /Semantic verification failed/);
});

test("clean always takes a fresh preflight and enters the atomic process path", () => {
  const inspectionInterfaceSource = sourceBetween(
    mainSource,
    "interface FileInspection {",
    "interface CleanResult {",
  );
  const inspectFileSource = sourceBetween(
    mainSource,
    "  private async inspectFile(",
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
  );
  const cleanFileSource = sourceBetween(
    mainSource,
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
    "  private createFilenamePlan(",
  );
  const processSource = sourceBetween(
    cleanFileSource,
    "    await this.app.vault.process(initialInspection.file, (currentContent) => {",
    "\n\n    if (processGuard.decision) {",
  );

  assert.match(
    cleanFileSource,
    /const initialInspection = await this\.inspectFile\(\s*file,\s*true,/,
    "Clean must request a fresh Vault.read preflight",
  );
  assert.match(
    mainSource,
    /const content = readFresh\s*\?\s*await this\.app\.vault\.read\(liveFile\)\s*:\s*await this\.app\.vault\.cachedRead\(liveFile\)/,
  );
  assert.match(
    inspectionInterfaceSource,
    /sourceContent: string;/,
    "the fresh inspection must retain the exact bytes that produced its cleanup result",
  );
  assert.match(
    inspectFileSource,
    /sourceContent: content,/,
    "the retained preflight bytes must come from the same fresh read passed to cleanMarkdown",
  );
  assert.equal(
    (cleanFileSource.match(/this\.app\.vault\.process\(/g) ?? []).length,
    1,
    "the manual clean workflow should have one unconditional atomic process entry",
  );
  assert.doesNotMatch(
    cleanFileSource,
    /if\s*\(\s*initialInspection\.markdown\.changed\s*\)/,
    "a cached or preflight no-op must not bypass the fresh process callback",
  );

  assert.match(
    processSource,
    /inspectPathExclusion\(\s*initialInspection\.file\.path,/,
    "path exclusion must be rechecked inside the atomic callback",
  );
  assert.match(
    processSource,
    /mergeExcludedPaths\(initialExcludedPaths,\s*this\.settings\.excludedPaths\)/,
    "the callback must retain both initial and newly-added exclusions",
  );
  assert.match(processSource, /return currentContent;/);
  assert.match(
    processSource,
    /currentMarkdown\s*=\s*currentContent === initialInspection\.sourceContent\s*\?\s*initialInspection\.markdown\s*:\s*cleanMarkdown\(currentContent,\s*markdownOptions\)/,
    "only exact byte equality may reuse the verified manual-clean preflight",
  );
  assert.ok(
    processSource.indexOf("if (exclusion.excluded)") <
      processSource.indexOf("currentContent === initialInspection.sourceContent"),
    "the live path exclusion must run before preflight reuse",
  );
  assert.doesNotMatch(
    processSource,
    /editorContentMatchesFile|normalizeLineEndings/,
    "manual preflight reuse must not treat representation-only differences as equal",
  );
  assert.match(allSource, /\.vault\.process\(/, "note cleanup must use Vault.process");
  assert.match(allSource, /\.fileManager\.renameFile\(/, "filename cleanup must use fileManager.renameFile");
});

test("manual inspection shares one safety and control analysis with cleanup", () => {
  const inspectFileSource = sourceBetween(
    mainSource,
    "  private async inspectFile(",
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
  );
  const combinedAnalysisSource = sourceBetween(
    cleanerSource,
    "export function analyzeMarkdownCleanup(",
    "export function cleanMarkdown(",
  );

  assert.equal(
    (inspectFileSource.match(/analyzeMarkdownCleanup\(/g) ?? []).length,
    1,
    "manual inspection should request one combined analysis",
  );
  assert.doesNotMatch(
    inspectFileSource,
    /inspectMarkdownInputSafety\(|parseLintControls\(|cleanMarkdown\(/,
    "manual inspection must not repeat work already owned by the combined analysis",
  );
  assert.equal(
    (combinedAnalysisSource.match(/inspectMarkdownInputSafety\(/g) ?? [])
      .length,
    1,
  );
  assert.equal(
    (combinedAnalysisSource.match(/parseLintControls\(/g) ?? []).length,
    1,
  );
});

test("manual inspection and clean never hand work to a same-path replacement", () => {
  const inspectFileSource = sourceBetween(
    mainSource,
    "  private async inspectFile(",
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
  );
  const cleanFileSource = sourceBetween(
    mainSource,
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
    "  private createFilenamePlan(",
  );
  const processSource = sourceBetween(
    cleanFileSource,
    "    await this.app.vault.process(initialInspection.file, (currentContent) => {",
    "\n\n    if (processGuard.decision) {",
  );
  const postProcessSource = sourceBetween(
    cleanFileSource,
    "    const liveFile = initialInspection.file;",
    "    let filenamePlan = this.createFilenamePlan(liveFile, filenameOptions);",
  );
  const finalReadSource = sourceBetween(
    cleanFileSource,
    "        const liveContent = await this.app.vault.read(liveFile);",
    "          if (filenameDecision.allowed) {",
  );

  assert.match(
    vaultFileIdentitySource,
    /file\.extension === "md" && vault\.getFileByPath\(file\.path\) === file/,
    "current-file checks must use strict object identity and the Markdown type",
  );
  assert.equal(
    (inspectFileSource.match(
      /isCurrentMarkdownFile\(this\.app\.vault,\s*liveFile\)/g,
    ) ?? []).length,
    2,
    "inspection must check identity before and after its asynchronous read",
  );
  const inspectionCheck = "isCurrentMarkdownFile(this.app.vault, liveFile)";
  const firstInspectionCheck = inspectFileSource.indexOf(inspectionCheck);
  const inspectionRead = inspectFileSource.indexOf("const content = readFresh");
  const secondInspectionCheck = inspectFileSource.indexOf(
    inspectionCheck,
    firstInspectionCheck + inspectionCheck.length,
  );
  assert.ok(
    firstInspectionCheck < inspectionRead &&
      inspectionRead < secondInspectionCheck,
    "the inspection identity checks must bracket the asynchronous read",
  );
  assert.match(
    processSource,
    /isCurrentMarkdownFile\(\s*this\.app\.vault,\s*initialInspection\.file,\s*\)/,
    "the atomic callback must return the current bytes when the indexed file identity changed",
  );
  const processIdentityCheck = processSource.indexOf(
    "!isCurrentMarkdownFile(",
  );
  const processExclusion = processSource.indexOf(
    "const exclusion = inspectPathExclusion(",
  );
  const processIdentityGuard = processSource.slice(
    processIdentityCheck,
    processExclusion,
  );
  assert.match(processIdentityGuard, /reason:\s*"invalid-plan"/);
  assert.match(processIdentityGuard, /return currentContent;/);
  assert.ok(
    processSource.indexOf("isCurrentMarkdownFile(") <
      processSource.indexOf("cleanMarkdown(currentContent, markdownOptions)"),
    "identity must be checked before the process callback cleans content",
  );
  assert.match(
    postProcessSource,
    /if \(!isCurrentMarkdownFile\(this\.app\.vault,\s*liveFile\)\)/,
    "post-process filename work must stay attached to the processed object",
  );
  assert.match(
    finalReadSource,
    /if \(!isCurrentMarkdownFile\(this\.app\.vault,\s*liveFile\)\)/,
    "the final asynchronous read must be followed by one last identity and type check",
  );
  assert.ok(
    finalReadSource.indexOf("isCurrentMarkdownFile(") <
      finalReadSource.indexOf("parseLintControls(liveContent)"),
    "a replacement must be rejected before control parsing, planning, or rename",
  );
  assert.doesNotMatch(
    cleanFileSource,
    /getFileByPath\([^)]*\.path\)[\s\S]{0,120}instanceof TFile[\s\S]{0,120}createFilenamePlan/,
    "a same-path TFile must not be accepted for filename work by type alone",
  );
});

test("same-file cleans serialize with save reruns preserved", () => {
  const cleanWithNoticeSource = sourceBetween(
    mainSource,
    "  private async cleanFileWithNotice(",
    "  private async inspectFile(",
  );

  assert.match(mainSource, /private readonly activeCleans = new WeakSet<TFile>\(\);/);
  assert.match(cleanWithNoticeSource, /this\.activeCleans\.has\(file\)/);
  assert.match(cleanWithNoticeSource, /already cleaning/);
  assert.match(cleanWithNoticeSource, /this\.activeCleans\.add\(file\)/);
  assert.match(
    cleanWithNoticeSource,
    /finally\s*\{\s*this\.activeCleans\.delete\(file\);\s*\}/,
  );
  const saveSource = sourceBetween(
    mainSource,
    "  private async lintFileOnSave(file: TFile): Promise<void> {",
    "  getGcmFilenameOwnership(): FilenameOwnershipStatus {",
  );
  assert.match(saveSource, /if \(this\.activeCleans\.has\(file\)\)/);
  assert.match(saveSource, /this\.saveLintScheduler\?\.request\(file\)/);
  assert.match(saveSource, /finally\s*\{\s*this\.activeCleans\.delete\(file\);\s*\}/);
});

test("filename collision checks stay sibling-local and never scan the vault", () => {
  const decisionSource = sourceBetween(
    mainSource,
    "  private createFilenameDecision(",
    "  private markdownOptions(): MarkdownCleanupOptions {",
  );

  assert.match(decisionSource, /file\.parent\?\.children/);
  assert.match(
    decisionSource,
    /\.filter\(\(child\): child is TFile => child instanceof TFile\)/,
  );
  assert.match(decisionSource, /\.map\(\(child\) => child\.path\)/);
  assert.doesNotMatch(allSource, /\.vault\.getMarkdownFiles\(\)/);
  assert.doesNotMatch(allSource, /\.vault\.getFiles\(\)/);
});

test("filename collision decisions normalize each sibling in one ordered pass", () => {
  const decisionSource = sourceBetween(
    cleanerSource,
    "export function decideFilenameRename(",
    "export function inspectPathExclusion(",
  );

  assert.match(
    decisionSource,
    /for \(const siblingPath of siblingPaths\)/,
  );
  assert.equal(
    (decisionSource.match(/normalizeVaultPath\(siblingPath\)/g) ?? [])
      .length,
    1,
  );
  assert.doesNotMatch(decisionSource, /\.map\(normalizeVaultPath\)/);
  assert.match(decisionSource, /collisionKey\(path\) === targetPathKey/);
  assert.match(decisionSource, /collision = path;\s*break;/);
});

test("rename failures remain partial results with explicit reporting and warning logs", () => {
  const cleanFileSource = sourceBetween(
    mainSource,
    "  private async cleanFile(file: TFile): Promise<CleanResult> {",
    "  private createFilenamePlan(",
  );
  const renameFailureSource = sourceBetween(
    cleanFileSource,
    '      filenameDecision = {\n        allowed: false,\n        reason: "rename-failed",',
    "\n\n    return {",
  );
  const cleanSummarySource = sourceBetween(
    mainSource,
    "  private describeCleanResult(result: CleanResult): string {",
    "  private describeFilename(",
  );
  const filenameSummarySource = sourceBetween(
    mainSource,
    "  private describeFilename(",
    "  private describeMarkdown(",
  );

  assert.match(cleanerSource, /\|\s*"rename-failed"/);
  assert.match(renameFailureSource, /detail:\s*summarizeError\(error\)/);
  assert.match(renameFailureSource, /logWarning\(/);
  assert.match(renameFailureSource, /"clean:filename"/);
  assert.match(renameFailureSource, /markdownChanged=/);
  assert.doesNotMatch(renameFailureSource, /\bthrow\b/);
  assert.match(cleanSummarySource, /this\.describeMarkdown\(/);
  assert.match(
    filenameSummarySource,
    /decision\.reason === "rename-failed"/,
  );
  assert.match(filenameSummarySource, /Filename cleanup could not finish/);
});

test("GCM lookup and filename ownership fail closed when integration is unknown", () => {
  assert.match(mainSource, /return inspectGcmIntegration\(/);
  assert.match(gcmCompatSource, /if \(!isRecord\(pluginManager\)\)\s*\{\s*return unavailable\(\);/);
  assert.match(gcmCompatSource, /typeof manager\.getPlugin !== "function"/);
  assert.match(
    gcmCompatSource,
    /catch\s*\{\s*return unavailable\(\);\s*\}/,
  );
  assert.match(gcmCompatSource, /autoRename === true/);
  assert.match(gcmCompatSource, /autoRename === false/);
  assert.match(
    gcmCompatSource,
    /return \{ ownership: "unavailable", plugin \};/,
    "an installed GCM with an unknown ownership setting must fail closed",
  );

  const unavailableGuard = cleanerSource.indexOf(
    'if (ownership === "unavailable")',
  );
  const eligibleReturn = cleanerSource.indexOf(
    "return { allowed: true, reason: \"eligible\", detail: null };",
  );
  assert.ok(unavailableGuard >= 0);
  assert.ok(
    eligibleReturn > unavailableGuard,
    "unknown ownership must be rejected before a rename can become eligible",
  );
  assert.match(cleanerSource, /reason:\s*"gcm-ownership-unavailable"/);
});

test("note-local controls, range markers, and idempotence gates remain stable", () => {
  assert.match(
    lintControlsSource,
    /TPS_LINTER_CONTROL_KEY = "tps-linter" as const/,
  );
  assert.match(
    lintControlsSource,
    /TPS_LINTER_DISABLED_RULES_KEY =\s*"tps-linter-disabled-rules" as const/,
  );
  for (const ruleId of [
    "filename",
    "whitespace-only-lines",
    "blank-lines",
    "trailing-whitespace",
    "trailing-blank-lines",
    "final-newline",
    "leading-blank-line",
    "heading-capitalization",
    "heading-levels",
    "frontmatter-blank-line",
    "frontmatter-sort",
    "all",
  ]) {
    assert.match(lintControlsSource, new RegExp(`"${ruleId}"`));
  }

  const invalidControlsSource = sourceBetween(
    lintControlsSource,
    "function invalidControls(detail: string): LintControlResult {",
    "function readFrontmatter(",
  );
  assert.match(invalidControlsSource, /controlsPresent:\s*true/);
  assert.match(invalidControlsSource, /disabledAll:\s*true/);
  assert.match(mainSource, /lintControls\.disabledAll/);
  assert.match(mainSource, /lintControls\.disabledRules\.has\("filename"\)/);
  assert.match(
    mainSource,
    /const liveContent = await this\.app\.vault\.read\(liveFile\)[\s\S]*inspectMarkdownInputSafety\(liveContent\)[\s\S]*lintControls = contentSafetyBlock[\s\S]*parseLintControls\(liveContent\)[\s\S]*this\.createFilenameDecision\(/,
    "filename controls must be re-read immediately before rename eligibility",
  );
  assert.match(
    mainSource,
    /filenameCleaningEnabled && this\.settings\.cleanFilenames/,
    "a setting disabled during a clean must not be relaxed by the initial snapshot",
  );

  assert.ok(
    cleanerSource.includes(
      "<!--\\s*tps-linter-(disable|enable)\\s*-->",
    ),
    "the HTML range marker contract must stay stable",
  );
  assert.ok(
    cleanerSource.includes(
      "%%\\s*tps-linter-(disable|enable)\\s*%%",
    ),
    "the Obsidian range marker contract must stay stable",
  );
  assert.match(cleanerSource, /let lintRangeDisabled = false/);
  const activeRangeSource = sourceBetween(
    cleanerSource,
    "    const lintRangeDirective = readLintRangeDirective(comparisonBody);",
    "\n\n    if (index === 0",
  );
  assert.match(
    activeRangeSource,
    /lintRangeDisabled && lintRangeDirective === "enable"/,
  );
  assert.match(activeRangeSource, /lintRangeDisabled = false/);
  assert.match(
    activeRangeSource,
    /!lintRangeDisabled && lintRangeDirective === "disable"/,
  );
  assert.match(activeRangeSource, /lintRangeDisabled = true/);
  assert.match(activeRangeSource, /protected:\s*true/);
  assert.match(activeRangeSource, /continue;/);
  assert.ok(
    cleanerSource.indexOf("if (hasActiveProtectedConstruct(protectedConstructs))") <
      cleanerSource.indexOf(
        "const lintRangeDirective = readLintRangeDirective(comparisonBody)",
      ),
    "range markers inside already-protected constructs must not change lint state",
  );
  assert.match(
    cleanerSource,
    /verificationControls\.disabledAll\s*\|\|\s*!sameRuleSet\(/,
  );
  assert.match(cleanerSource, /note-local controls changed during cleanup/);
  assert.match(
    cleanerSource,
    /const verification = cleanMarkdownOnce\(\s*first\.output,/,
  );
  assert.match(
    cleanerSource,
    /verification\.changed\s*\|\|\s*verification\.noteDisabledReason\s*\|\|\s*verification\.safetyBlockedReason/,
  );
  assert.match(
    cleanerSource,
    /a second cleanup pass would make additional changes/,
  );
});

test("TPS Linter settings destinations stay accessible, responsive, and namespaced", () => {
  assert.match(settingsTabSource, /setName\("Lint notes on save"\)/);
  assert.match(settingsTabSource, /setName\("Add blank line at beginning of note"\)/);
  assert.match(settingsTabSource, /setName\("Add blank line after frontmatter"\)/);
  assert.match(settingsTabSource, /tps-linter-settings-actions/);
  assert.match(settingsTabSource, /tps-linter-settings-ownership/);
  assert.doesNotMatch(settingsTabSource, /createEl\(\s*["']details["']/);
  assert.doesNotMatch(settingsTabSource, /createEl\(\s*["']summary["']/);
  assert.match(settingsTabSource, /Choose what to configure/);
  assert.match(settingsTabSource, /activeDestination: SettingsDestination = "clean-notes"/);
  assert.match(settingsTabSource, /"aria-pressed"/);
  assert.match(settingsTabSource, /routeButtons\.get\(destination\.id\)\?\.focus\(\)/);
  for (const label of ["Clean notes", "Headings", "Frontmatter", "Files & safety"]) {
    assert.match(settingsTabSource, new RegExp(`label: "${label}"`));
  }

  assert.match(stylesSource, /\.tps-linter-settings-actions/);
  assert.match(stylesSource, /\.tps-linter-settings-ownership/);
  assert.match(stylesSource, /\.tps-linter-settings-route:focus-visible/);
  assert.match(stylesSource, /@media \(max-width: 640px\)/);
  assert.match(
    stylesSource,
    /@media \(max-width: 640px\)[\s\S]*\.tps-linter-settings-route-strip[\s\S]*overflow-x:\s*auto/,
  );
  assert.doesNotMatch(stylesSource, /(?:^|\n)\.tps-settings-/);

  const selectorLines = stylesSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("."));
  assert.ok(selectorLines.length > 0);
  for (const selector of selectorLines) {
    assert.match(selector, /^\.tps-linter-/, `unscoped CSS selector: ${selector}`);
  }
});

function readTypeScriptTree(directoryPath) {
  const sources = [];
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const path = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      sources.push(readTypeScriptTree(path));
    } else if (entry.isFile() && extname(entry.name) === ".ts") {
      sources.push(readFileSync(path, "utf8"));
    }
  }
  return sources.join("\n");
}

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}
