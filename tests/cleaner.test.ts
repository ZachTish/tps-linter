import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanMarkdown,
  decideFilenameRename,
  inspectPathExclusion,
  planMarkdownFilename,
  type FilenamePlan,
} from "../src/cleaner.ts";

const DEFAULT_FILENAME_OPTIONS = {
  unsafeCharacterStyle: "space" as const,
  removeObsidianLinkCharacters: false,
};

const DEFAULT_MARKDOWN_OPTIONS = {
  cleanWhitespaceOnlyLines: true,
  trimNonblankTrailingWhitespace: false,
  ensureFinalNewline: true,
};

test("filename planning cleans only narrow cross-platform hazards", () => {
  const plan = planMarkdownFilename(
    "Inbox/  2026-07-17   Same:Event...  .md",
    DEFAULT_FILENAME_OPTIONS,
  );

  assert.equal(plan.valid, true);
  assert.equal(plan.changed, true);
  assert.equal(plan.targetPath, "Inbox/2026-07-17 Same Event.md");
  assert.deepEqual(plan.changes, [
    "unsafe characters",
    "filename whitespace",
    "trailing spaces or periods",
  ]);
});

test("filename planning preserves established TPS naming patterns", () => {
  for (const basename of [
    "20260720",
    "2026-07-17 Same Event",
    "02 Review",
    "GCM 1.2.1 Statusless QA",
    "B & C",
    "Unicode café 🧭",
    "under_score-and (punctuation)",
    "A deliberately long TPS widget title that remains deliberately long",
    "queue-019f9546-2711-7a40-ae5c-ae5a0eaa5941",
  ]) {
    const plan = planMarkdownFilename(
      `Inbox/${basename}.md`,
      DEFAULT_FILENAME_OPTIONS,
    );
    assert.equal(plan.valid, true, basename);
    assert.equal(plan.changed, false, basename);
    assert.equal(plan.targetBasename, basename);
  }
});

test("unsafe filename replacement styles and optional link controls are explicit", () => {
  assert.equal(
    planMarkdownFilename("Inbox/A:B.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "dash",
    }).targetPath,
    "Inbox/A-B.md",
  );
  assert.equal(
    planMarkdownFilename("Inbox/A:B.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "remove",
    }).targetPath,
    "Inbox/AB.md",
  );
  assert.equal(
    planMarkdownFilename("Inbox/[A] #B^1.md", {
      ...DEFAULT_FILENAME_OPTIONS,
      removeObsidianLinkCharacters: true,
    }).targetPath,
    "Inbox/A B1.md",
  );
  assert.equal(
    planMarkdownFilename(
      "Inbox/[A] #B^1.md",
      DEFAULT_FILENAME_OPTIONS,
    ).changed,
    false,
  );
});

test("invalid filename plans fail closed", () => {
  for (const path of [
    "Inbox/....md",
    "Inbox/CON.md",
    "Inbox/CON.txt.md",
    "Inbox/prn.md",
    "Inbox/LPT9.md",
    "Inbox/Not Markdown.base",
  ]) {
    const plan = planMarkdownFilename(path, {
      ...DEFAULT_FILENAME_OPTIONS,
      unsafeCharacterStyle: "remove",
    });
    assert.equal(plan.valid, false, path);
    assert.ok(plan.blockReason, path);
  }
});

test("rename decisions block GCM ownership, collisions, and case-only changes", () => {
  const eligible = planMarkdownFilename(
    "Inbox/Needs   Space.md",
    DEFAULT_FILENAME_OPTIONS,
  );
  assert.deepEqual(decideFilenameRename(eligible, [eligible.sourcePath], false), {
    allowed: true,
    reason: "eligible",
    detail: null,
  });
  assert.equal(
    decideFilenameRename(eligible, [eligible.sourcePath], true).reason,
    "gcm-auto-rename-active",
  );
  assert.deepEqual(
    decideFilenameRename(
      eligible,
      [eligible.sourcePath, "inbox/needs space.md"],
      false,
    ),
    {
      allowed: false,
      reason: "target-collision",
      detail: "inbox/needs space.md",
    },
  );

  const caseOnlyPlan: FilenamePlan = {
    sourcePath: "Inbox/Name.md",
    targetPath: "Inbox/name.md",
    sourceBasename: "Name",
    targetBasename: "name",
    changed: true,
    valid: true,
    changes: ["case"],
    blockReason: null,
  };
  assert.equal(
    decideFilenameRename(caseOnlyPlan, [caseOnlyPlan.sourcePath], false).reason,
    "case-only-rename",
  );
});

test("filename planning is idempotent", () => {
  const first = planMarkdownFilename(
    "Inbox/  A:B   C... .md",
    DEFAULT_FILENAME_OPTIONS,
  );
  const second = planMarkdownFilename(
    first.targetPath,
    DEFAULT_FILENAME_OPTIONS,
  );
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.targetPath, first.targetPath);
});

test("hard exclusions and editable exclusions use path boundaries", () => {
  for (const path of [
    ".obsidian/plugins/example/README.md",
    ".trash/Old.md",
    ".tps/State.md",
    ".plugin-dev-cache.nosync/cache.md",
    "Plugin Development/TPS-Linter (Dev)/README.md",
    "_assets/TPS AI Queue/job.md",
    "AGENTS.md",
    "Inbox/__type__.md",
    "Inbox/__root__.md",
    "Inbox/file.base",
  ]) {
    assert.equal(inspectPathExclusion(path, []).excluded, true, path);
  }

  assert.equal(
    inspectPathExclusion("Templates/Note.md", ["Templates"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Templates Extra/Note.md", ["Templates"]).excluded,
    false,
  );
  assert.equal(
    inspectPathExclusion("Projects/2026/Note.md", ["Projects/*"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Projects/2026/Deep/Note.md", ["Projects/*"]).excluded,
    true,
  );
  assert.equal(
    inspectPathExclusion("Inbox/Note.md", ["Templates", "_archive"]).excluded,
    false,
  );
});

test("Markdown cleanup preserves BOM and every existing line separator", () => {
  const input = "\uFEFFTitle\r\n   \nBody\r\t\r\nTail";
  const result = cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS);

  assert.equal(result.output, "\uFEFFTitle\r\n\nBody\r\r\nTail\r\n");
  assert.deepEqual(result.changes, {
    whitespaceOnlyLinesCleaned: 2,
    nonblankTrailingWhitespaceLinesCleaned: 0,
    finalNewlineAdded: true,
  });
  assert.equal(result.changed, true);
});

test("Markdown cleanup leaves protected regions byte-identical", () => {
  const input = [
    "---\r\n",
    "title: Test   \r\n",
    "   \r\n",
    "---\r\n",
    "```ts\r\n",
    "   \r\n",
    "const x = 1;   \r\n",
    "```\r\n",
    "<pre>\r\n",
    "   \r\n",
    "</pre>\r\n",
    "<%*\r\n",
    "   \r\n",
    "%>\r\n",
    "Body\r\n",
  ].join("");

  assert.equal(cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output, input);
});

test("sequential protected openers on one line remain byte-identical", () => {
  for (const input of [
    "<pre>x</pre><pre>\n   \nvalue   \n</pre>\n",
    "<% x %><%*\n   \nvalue   \n%>\n",
    "<pre>x</pre><%*\n   \nvalue   \n%>\n",
  ]) {
    assert.equal(
      cleanMarkdown(input, {
        ...DEFAULT_MARKDOWN_OPTIONS,
        trimNonblankTrailingWhitespace: true,
      }).output,
      input,
      input,
    );
  }
});

test("tilde and unclosed fences remain protected instead of guessed at", () => {
  const tilde = "~~~text\n   \nvalue   \n~~~\n";
  const unclosed = "Before\n```\n   \nvalue   ";
  assert.equal(cleanMarkdown(tilde, DEFAULT_MARKDOWN_OPTIONS).output, tilde);
  assert.equal(
    cleanMarkdown(unclosed, {
      ...DEFAULT_MARKDOWN_OPTIONS,
      trimNonblankTrailingWhitespace: true,
    }).output,
    unclosed,
  );
});

test("a protected construct at end of file does not receive a guessed newline", () => {
  for (const input of [
    "---\ntitle: Test",
    "<pre>\nvalue",
    "<%*\nvalue",
    "```\nvalue",
  ]) {
    assert.equal(
      cleanMarkdown(input, DEFAULT_MARKDOWN_OPTIONS).output,
      input,
      input,
    );
  }
});

test("opt-in trailing cleanup preserves two-space hard breaks and TPS fields", () => {
  const input =
    "- [ ] Task [scheduled:: 2026-07-24]   \n" +
    "Text\t \n" +
    "Already hard break  \n";
  const result = cleanMarkdown(input, {
    ...DEFAULT_MARKDOWN_OPTIONS,
    trimNonblankTrailingWhitespace: true,
  });

  assert.equal(
    result.output,
    "- [ ] Task [scheduled:: 2026-07-24]  \n" +
      "Text\n" +
      "Already hard break  \n",
  );
  assert.equal(result.changes.nonblankTrailingWhitespaceLinesCleaned, 2);
});

test("empty and already-clean Markdown are no-ops and cleanup is idempotent", () => {
  assert.deepEqual(cleanMarkdown("", DEFAULT_MARKDOWN_OPTIONS), {
    output: "",
    changed: false,
    changes: {
      whitespaceOnlyLinesCleaned: 0,
      nonblankTrailingWhitespaceLinesCleaned: 0,
      finalNewlineAdded: false,
    },
  });

  const clean = "Title\n\nBody\n";
  assert.equal(cleanMarkdown(clean, DEFAULT_MARKDOWN_OPTIONS).changed, false);

  const first = cleanMarkdown("Title\n \nBody", DEFAULT_MARKDOWN_OPTIONS);
  const second = cleanMarkdown(first.output, DEFAULT_MARKDOWN_OPTIONS);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(second.output, first.output);
});
