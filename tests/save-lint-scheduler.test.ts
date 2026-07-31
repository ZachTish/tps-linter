import assert from "node:assert/strict";
import test from "node:test";

import {
  SaveLintLifecycle,
  SaveLintScheduler,
  editorContentMatchesFile,
  editorContentNeedsNormalization,
} from "../src/save-lint-scheduler.ts";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(message);
    }
    await sleep(2);
  }
}

test("editor/file comparison tolerates representation-only BOM and line-ending differences", () => {
  assert.equal(
    editorContentMatchesFile(
      "---\nstatus: open\n---\nBody\n",
      "\uFEFF---\r\nstatus: open\r\n---\r\nBody\r\n",
    ),
    true,
  );
  assert.equal(
    editorContentMatchesFile("Body\n", "Body"),
    false,
  );
  assert.equal(
    editorContentMatchesFile("Body changed\n", "Body\n"),
    false,
  );
});

test("plain LF editor buffers do not enter representation normalization", () => {
  assert.equal(editorContentNeedsNormalization("Body\n"), false);
  assert.equal(editorContentNeedsNormalization("Body changed\n"), false);
  assert.equal(editorContentNeedsNormalization("\uFEFFBody\n"), true);
  assert.equal(editorContentNeedsNormalization("Body\r\n"), true);
  assert.equal(editorContentNeedsNormalization("Body\r"), true);
});

test("editor/file comparison exactly matches the former normalization semantics", () => {
  const fragments = [
    "a",
    "b",
    "\n",
    "\r",
    "\r\n",
    "\uFEFF",
    "\ud83e",
    "\uddea",
  ];
  const samples = [""];
  for (const first of fragments) {
    samples.push(first);
    for (const second of fragments) {
      samples.push(`${first}${second}`);
    }
  }

  const referenceMatches = (left: string, right: string): boolean =>
    left.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n") ===
    right.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n");

  for (const editorContent of samples) {
    for (const fileContent of samples) {
      assert.equal(
        editorContentMatchesFile(editorContent, fileContent),
        referenceMatches(editorContent, fileContent),
        `editor=${JSON.stringify(editorContent)} file=${JSON.stringify(fileContent)}`,
      );
    }
  }
});

test("lifecycle generations invalidate in-flight work across unload and reactivation", () => {
  const lifecycle = new SaveLintLifecycle();

  assert.equal(lifecycle.isActive(), false);
  assert.equal(lifecycle.isCurrent(lifecycle.capture()), false);

  const firstGeneration = lifecycle.activate();
  assert.equal(lifecycle.isActive(), true);
  assert.equal(lifecycle.isCurrent(firstGeneration), true);

  lifecycle.invalidate();
  assert.equal(lifecycle.isActive(), false);
  assert.equal(lifecycle.isCurrent(firstGeneration), false);

  const secondGeneration = lifecycle.activate();
  assert.equal(lifecycle.isCurrent(firstGeneration), false);
  assert.equal(lifecycle.isCurrent(secondGeneration), true);
  assert.notEqual(secondGeneration, firstGeneration);
});

test("coalesces repeated requests independently per item", async () => {
  const completed: string[] = [];
  const scheduler = new SaveLintScheduler<string>(
    (item) => {
      completed.push(item);
    },
    { delayMs: 15 },
  );

  scheduler.request("note-a");
  scheduler.request("note-a");
  scheduler.request("note-b");
  scheduler.request("note-a");
  scheduler.request("note-b");

  await waitFor(
    () => completed.length === 2,
    "both item workers should run",
  );
  await sleep(25);

  assert.deepEqual(completed.toSorted(), ["note-a", "note-b"]);
  scheduler.dispose();
});

test("events during a run yield exactly one delayed rerun", async () => {
  const firstRun = deferred();
  const starts: number[] = [];
  const scheduler = new SaveLintScheduler<string>(
    async () => {
      starts.push(Date.now());
      if (starts.length === 1) {
        await firstRun.promise;
      }
    },
    { delayMs: 20 },
  );

  scheduler.request("note");
  await waitFor(() => starts.length === 1, "first worker should start");

  scheduler.request("note");
  scheduler.request("note");
  scheduler.request("note");
  const releasedAt = Date.now();
  firstRun.resolve();

  await sleep(6);
  assert.equal(starts.length, 1, "rerun should still respect the debounce");
  await waitFor(() => starts.length === 2, "rerun should start");
  await sleep(30);

  assert.equal(starts.length, 2);
  assert.ok(
    (starts[1] ?? 0) - releasedAt >= 10,
    "rerun should be delayed after the active worker finishes",
  );
  scheduler.dispose();
});

test("worker errors are reported and do not wedge the item", async () => {
  const errors: Array<{ error: unknown; item: string }> = [];
  let attempts = 0;
  const scheduler = new SaveLintScheduler<string>(
    () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("lint failed");
      }
    },
    {
      delayMs: 5,
      onError(error, item) {
        errors.push({ error, item });
      },
    },
  );

  scheduler.request("note");
  await waitFor(() => errors.length === 1, "worker error should be reported");

  scheduler.request("note");
  await waitFor(() => attempts === 2, "item should run again after an error");

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.item, "note");
  assert.match(String(errors[0]?.error), /lint failed/);
  scheduler.dispose();
});

test("cancelPending clears timers and suppresses an in-flight rerun", async () => {
  const activeRun = deferred();
  const starts: string[] = [];
  const scheduler = new SaveLintScheduler<string>(
    async (item) => {
      starts.push(item);
      if (item === "active" && starts.length === 1) {
        await activeRun.promise;
      }
    },
    { delayMs: 15 },
  );

  scheduler.request("active");
  await waitFor(() => starts.length === 1, "active worker should start");
  scheduler.request("active");
  scheduler.request("active");
  scheduler.request("queued");

  scheduler.cancelPending();
  activeRun.resolve();
  await sleep(35);

  assert.deepEqual(starts, ["active"]);

  scheduler.request("queued");
  await waitFor(
    () => starts.length === 2,
    "scheduler should accept requests after cancellation",
  );
  assert.deepEqual(starts, ["active", "queued"]);
  scheduler.dispose();
});

test("dispose clears timers, suppresses reruns, and ignores new requests", async () => {
  const activeRun = deferred();
  const starts: string[] = [];
  const scheduler = new SaveLintScheduler<string>(
    async (item) => {
      starts.push(item);
      if (item === "active") {
        await activeRun.promise;
      }
    },
    { delayMs: 15 },
  );

  scheduler.request("active");
  await waitFor(() => starts.length === 1, "active worker should start");
  scheduler.request("active");
  scheduler.request("queued");

  scheduler.dispose();
  scheduler.request("ignored");
  activeRun.resolve();
  await sleep(35);

  assert.deepEqual(starts, ["active"]);
});
