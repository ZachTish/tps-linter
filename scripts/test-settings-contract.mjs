import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const versions = JSON.parse(readFileSync(new URL("../versions.json", import.meta.url), "utf8"));
const mainSource = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const settingsTabSource = readFileSync(new URL("../src/settings-tab.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const esbuildSource = readFileSync(new URL("../esbuild.config.mjs", import.meta.url), "utf8");
const allSource = readTypeScriptTree(sourceRoot);

test("TPS Linter release metadata is aligned", () => {
  assert.deepEqual(manifest, {
    id: "tps-linter",
    name: "TPS Linter",
    version: "0.2.0",
    minAppVersion: "1.10.0",
    description: "TPS-specific note and filename cleanup with explicit, ownership-safe actions.",
    author: "Zach Tisherman",
    authorUrl: "https://github.com/ZachTish",
    isDesktopOnly: false,
  });
  assert.equal(packageJson.name, manifest.id);
  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.license, "MIT");
  assert.equal(packageJson.dependencies?.yaml, "2.9.0");
  assert.deepEqual(versions, {
    "0.1.0": "1.10.0",
    "0.2.0": "1.10.0",
  });
  assert.match(esbuildSource, /Copyright Eemeli Aro/);
  assert.match(esbuildSource, /Permission to use, copy, modify/);
});

test("TPS Linter exposes explicit check and clean commands", () => {
  assert.match(mainSource, /name:\s*["']Check current note["']/);
  assert.match(mainSource, /name:\s*["']Clean current note["']/);
});

test("TPS Linter keeps automatic filename ownership with GCM", () => {
  assert.match(
    settingsTabSource,
    /TPS Global Context Menu currently owns automatic title and filename synchronization\./,
  );
  assert.match(settingsTabSource, /setButtonText\(["']Open GCM settings["']\)/);
  assert.match(settingsTabSource, /openPluginSettings\(["']tps-global-context-menu["']\)/);

  assert.doesNotMatch(
    mainSource,
    /\.vault\.on\(\s*["'](?:create|modify|rename)["']/,
    "TPS Linter must not register automatic create, modify, or rename hooks",
  );
  assert.doesNotMatch(
    mainSource,
    /\.workspace\.on\(\s*["']file-open["']/,
    "TPS Linter must not register an automatic file-open hook",
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

test("TPS Linter mutations use Obsidian-owned atomic operations", () => {
  assert.match(allSource, /\.vault\.process\(/, "note cleanup must use Vault.process");
  assert.match(allSource, /\.fileManager\.renameFile\(/, "filename cleanup must use fileManager.renameFile");
});

test("TPS Linter settings destinations stay accessible, responsive, and namespaced", () => {
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
