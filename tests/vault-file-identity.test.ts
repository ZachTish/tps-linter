import assert from "node:assert/strict";
import test from "node:test";

import type { TFile, Vault } from "obsidian";

import { isCurrentMarkdownFile } from "../src/vault-file-identity.ts";

function file(path: string, extension = "md"): TFile {
  return {
    path,
    extension,
    name: path.split("/").at(-1) ?? path,
    stat: {
      ctime: 1,
      mtime: 1,
      size: 10,
    },
  } as unknown as TFile;
}

test("current Markdown identity rejects deletion and same-path replacement", () => {
  const original = file("Inbox/Note.md");
  const identicalReplacement = file("Inbox/Note.md");
  let indexedFile: TFile | null = original;
  const vault = {
    getFileByPath(path: string) {
      return indexedFile?.path === path ? indexedFile : null;
    },
  } as unknown as Vault;

  assert.equal(isCurrentMarkdownFile(vault, original), true);

  indexedFile = identicalReplacement;
  assert.equal(
    isCurrentMarkdownFile(vault, original),
    false,
    "matching path and stat values must not transfer work to another object",
  );

  indexedFile = null;
  assert.equal(isCurrentMarkdownFile(vault, original), false);

  const nonMarkdown = file("Inbox/Note.canvas", "canvas");
  indexedFile = nonMarkdown;
  assert.equal(isCurrentMarkdownFile(vault, nonMarkdown), false);

  const renamedOriginal = file("Moved/Note.md");
  indexedFile = renamedOriginal;
  assert.equal(
    isCurrentMarkdownFile(vault, renamedOriginal),
    true,
    "the same indexed Markdown object remains eligible after a supported rename",
  );
});
