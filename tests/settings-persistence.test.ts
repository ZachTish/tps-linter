import assert from "node:assert/strict";
import test from "node:test";

import {
  cloneSettings,
  isSupportedSettingsSchema,
  TPSLinterSettingsPersistence,
} from "../src/settings-persistence.ts";
import {
  SETTINGS_SCHEMA_VERSION,
  normalizeSettings,
  type TPSLinterSettings,
} from "../src/settings.ts";

function createSettings(
  overrides: Partial<TPSLinterSettings> = {},
): TPSLinterSettings {
  return normalizeSettings({
    ...normalizeSettings(undefined),
    ...overrides,
  });
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

test("local saves merge only changed fields into the latest synced payload", async () => {
  const baseline = createSettings();
  const live = cloneSettings(baseline);
  const latest = {
    ...baseline,
    headingCapitalizationStyle: "off",
    futureCompatibleField: { retained: true },
  };
  const saved: Record<string, unknown>[] = [];
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => latest,
    saveMerged: async (settings) => {
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);

  live.diagnostics = true;
  await persistence.request(live);

  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.diagnostics, true);
  assert.equal(saved[0]?.headingCapitalizationStyle, "off");
  assert.deepEqual(saved[0]?.futureCompatibleField, { retained: true });
  assert.equal(saved[0]?.schemaVersion, SETTINGS_SCHEMA_VERSION);
  assert.equal(live.diagnostics, true);
  assert.equal(live.headingCapitalizationStyle, "off");
});

test("rapid old-new-old edits persist the final local intent", async () => {
  const baseline = createSettings({ lintOnSave: true });
  const live = cloneSettings(baseline);
  const firstRead = createDeferred<unknown>();
  const saved: Record<string, unknown>[] = [];
  let reads = 0;
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => {
      reads += 1;
      if (reads === 1) return firstRead.promise;
      return saved.at(-1) ?? baseline;
    },
    saveMerged: async (settings) => {
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);

  live.lintOnSave = false;
  const firstSave = persistence.request(live);
  await Promise.resolve();
  live.lintOnSave = true;
  const secondSave = persistence.request(live);
  firstRead.resolve(baseline);
  await Promise.all([firstSave, secondSave]);

  assert.equal(saved.length, 2);
  assert.equal(saved[0]?.lintOnSave, false);
  assert.equal(saved[1]?.lintOnSave, true);
  assert.equal(live.lintOnSave, true);
});

test("external settings apply in place without writing them back", async () => {
  const baseline = createSettings();
  const live = cloneSettings(baseline);
  let writes = 0;
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => baseline,
    saveMerged: async () => {
      writes += 1;
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);
  const externalRead = persistence.captureExternalRead();
  const external = createSettings({
    lintOnSave: false,
    excludedPaths: ["Synced/Safe"],
  });

  const result = persistence.applyExternal(
    externalRead,
    external,
  );

  assert.deepEqual(result, { applied: true, changed: 2 });
  assert.equal(live.lintOnSave, false);
  assert.deepEqual(live.excludedPaths, ["Synced/Safe"]);
  assert.equal(writes, 0);
});

test("external reload preserves edits made after its read began", () => {
  const baseline = createSettings();
  const live = cloneSettings(baseline);
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => baseline,
    saveMerged: async () => undefined,
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);
  const externalRead = persistence.captureExternalRead();

  live.diagnostics = true;
  const result = persistence.applyExternal(
    externalRead,
    createSettings({
      diagnostics: false,
      headingCapitalizationStyle: "off",
    }),
  );

  assert.deepEqual(result, { applied: true, changed: 1 });
  assert.equal(live.diagnostics, true);
  assert.equal(live.headingCapitalizationStyle, "off");
});

test("a queued local save owns its fields during an external reload", async () => {
  const baseline = createSettings();
  const live = cloneSettings(baseline);
  const read = createDeferred<unknown>();
  const saved: Record<string, unknown>[] = [];
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => read.promise,
    saveMerged: async (settings) => {
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);

  live.lintOnSave = false;
  const save = persistence.request(live);
  await Promise.resolve();
  const result = persistence.applyExternal(
    persistence.captureExternalRead(),
    createSettings({ headingCapitalizationStyle: "off" }),
  );

  assert.deepEqual(result, { applied: true, changed: 1 });
  assert.equal(live.lintOnSave, false);
  assert.equal(live.headingCapitalizationStyle, "off");
  read.resolve({
    ...createSettings({ headingCapitalizationStyle: "off" }),
    futureCompatibleField: "keep",
  });
  await save;
  assert.equal(saved[0]?.lintOnSave, false);
  assert.equal(saved[0]?.headingCapitalizationStyle, "off");
  assert.equal(saved[0]?.futureCompatibleField, "keep");
});

test("no-op save requests do not rewrite data.json", async () => {
  const baseline = createSettings();
  const live = cloneSettings(baseline);
  let reads = 0;
  let writes = 0;
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => {
      reads += 1;
      return baseline;
    },
    saveMerged: async () => {
      writes += 1;
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);

  await persistence.request(live);

  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("a stale external read is rejected after local persistence advances", async () => {
  const baseline = createSettings({ lintOnSave: true });
  const live = cloneSettings(baseline);
  const saved: Record<string, unknown>[] = [];
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => baseline,
    saveMerged: async (settings) => {
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);
  const staleExternalRead = persistence.captureExternalRead();

  live.lintOnSave = false;
  await persistence.request(live);
  const result = persistence.applyExternal(
    staleExternalRead,
    createSettings({ headingCapitalizationStyle: "off" }),
  );

  assert.deepEqual(result, { applied: false, changed: 0 });
  assert.equal(saved.length, 1);
  assert.equal(live.lintOnSave, false);
  assert.equal(
    live.headingCapitalizationStyle,
    baseline.headingCapitalizationStyle,
  );
});

test("external reload preserves dirty intent after a failed local save", async () => {
  const baseline = createSettings({ lintOnSave: true });
  const live = cloneSettings(baseline);
  const external = createSettings({ headingCapitalizationStyle: "off" });
  const saved: Record<string, unknown>[] = [];
  let failWrite = true;
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => external,
    saveMerged: async (settings) => {
      if (failWrite) throw new Error("simulated settings write failure");
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline);

  live.lintOnSave = false;
  await assert.rejects(() => persistence.request(live));
  const result = persistence.applyExternal(
    persistence.captureExternalRead(),
    external,
  );

  assert.deepEqual(result, { applied: true, changed: 1 });
  assert.equal(live.lintOnSave, false);
  assert.equal(live.headingCapitalizationStyle, "off");

  failWrite = false;
  live.diagnostics = true;
  await persistence.request(live);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.lintOnSave, false);
  assert.equal(saved[0]?.diagnostics, true);
  assert.equal(saved[0]?.headingCapitalizationStyle, "off");
});

test("a first save writes a complete settings record when data.json does not exist", async () => {
  const baseline = createSettings({
    lintOnSave: false,
    cleanFilenames: false,
    excludedPaths: ["Custom"],
  });
  const live = cloneSettings(baseline);
  const saved: Record<string, unknown>[] = [];
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => null,
    saveMerged: async (settings) => {
      saved.push(structuredClone(settings));
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline, null);

  live.diagnostics = true;
  await persistence.request(live);

  assert.equal(saved.length, 1);
  assert.deepEqual(normalizeSettings(saved[0]), live);
  assert.equal(Object.keys(saved[0] ?? {}).length, Object.keys(live).length);
});

test("missing established settings fail closed without a partial rewrite", async () => {
  const baseline = createSettings({
    lintOnSave: false,
    cleanFilenames: false,
    excludedPaths: ["Custom"],
  });
  const live = cloneSettings(baseline);
  let writes = 0;
  const persistence = new TPSLinterSettingsPersistence({
    loadLatest: async () => undefined,
    saveMerged: async () => {
      writes += 1;
    },
    getLiveSettings: () => live,
  });
  persistence.setBaseline(baseline, baseline);
  live.diagnostics = true;

  await assert.rejects(
    () => persistence.request(live),
    /temporarily unavailable/,
  );
  assert.equal(writes, 0);
  assert.equal(live.lintOnSave, false);
  assert.equal(live.cleanFilenames, false);
  assert.deepEqual(live.excludedPaths, ["Custom"]);
});

test("settings schema validation rejects future and malformed versions", () => {
  assert.equal(isSupportedSettingsSchema({}), true);
  assert.equal(
    isSupportedSettingsSchema({ schemaVersion: SETTINGS_SCHEMA_VERSION }),
    true,
  );
  assert.equal(
    isSupportedSettingsSchema({ schemaVersion: SETTINGS_SCHEMA_VERSION + 1 }),
    false,
  );
  assert.equal(isSupportedSettingsSchema({ schemaVersion: -1 }), false);
  assert.equal(isSupportedSettingsSchema({ schemaVersion: 1.5 }), false);
  assert.equal(isSupportedSettingsSchema({ schemaVersion: "7" }), false);
});

test("invalid and newer settings payloads fail closed without a write", async (t) => {
  for (const [label, latest] of [
    ["non-object", []],
    [
      "newer schema",
      { ...createSettings(), schemaVersion: SETTINGS_SCHEMA_VERSION + 1 },
    ],
  ] as const) {
    await t.test(label, async () => {
      const baseline = createSettings();
      const live = cloneSettings(baseline);
      let writes = 0;
      const persistence = new TPSLinterSettingsPersistence({
        loadLatest: async () => latest,
        saveMerged: async () => {
          writes += 1;
        },
        getLiveSettings: () => live,
      });
      persistence.setBaseline(baseline);
      live.diagnostics = true;

      await assert.rejects(() => persistence.request(live));
      assert.equal(writes, 0);
    });
  }
});
