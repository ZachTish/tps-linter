import assert from "node:assert/strict";
import test from "node:test";

import { inspectGcmIntegration } from "../src/gcm-compat.ts";

test("GCM integration distinguishes absent, inactive, and active ownership", () => {
  assert.deepEqual(
    inspectGcmIntegration({ getPlugin: () => null }),
    { ownership: "gcm-absent", plugin: null },
  );

  const inactive = {
    settings: {
      enableAutoRename: false,
      properties: [{ key: "status" }],
    },
  };
  assert.deepEqual(
    inspectGcmIntegration({ getPlugin: () => inactive }),
    { ownership: "gcm-inactive", plugin: inactive },
  );

  const active = { settings: { enableAutoRename: true } };
  assert.deepEqual(
    inspectGcmIntegration({ getPlugin: () => active }),
    { ownership: "gcm-active", plugin: active },
  );
});

test("GCM integration fails closed when lookup or ownership is unknown", () => {
  for (const manager of [
    undefined,
    null,
    {},
    { getPlugin: "not a function" },
    { getPlugin: () => "unexpected" },
    { getPlugin: () => ({}) },
    { getPlugin: () => ({ settings: {} }) },
    { getPlugin: () => ({ settings: { enableAutoRename: "false" } }) },
    {
      getPlugin: () => {
        throw new Error("private API changed");
      },
    },
  ]) {
    assert.equal(inspectGcmIntegration(manager).ownership, "unavailable");
  }
});

test("GCM properties remain readable even when filename ownership is unknown", () => {
  const plugin = {
    settings: {
      properties: [{ key: "status" }],
    },
  };
  const result = inspectGcmIntegration({ getPlugin: () => plugin });

  assert.equal(result.ownership, "unavailable");
  assert.equal(result.plugin, plugin);
});
