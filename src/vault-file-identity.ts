import type { TFile, Vault } from "obsidian";

export function isCurrentMarkdownFile(vault: Vault, file: TFile): boolean {
  return file.extension === "md" && vault.getFileByPath(file.path) === file;
}
