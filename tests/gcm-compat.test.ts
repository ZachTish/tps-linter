import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectGcmAutomaticMutationPermission,
  inspectGcmIntegration,
} from "../src/gcm-compat.ts";

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

test("GCM version-1 template capability owns automatic mutation permission", async () => {
  const file = { path: "Templates/Daily.md" };
  let receivedFile: unknown;
  let receivedThis: unknown;
  const templates = {
    version: 1,
    async canAutomaticallyMutate(candidate: unknown) {
      receivedFile = candidate;
      receivedThis = this;
      return true;
    },
  };

  assert.deepEqual(
    await inspectGcmAutomaticMutationPermission(
      { getPlugin: () => ({ api: { templates } }) },
      file,
    ),
    { allowed: true, reason: "allowed" },
  );
  assert.equal(receivedFile, file);
  assert.equal(receivedThis, templates);

  templates.canAutomaticallyMutate = async () => false;
  assert.deepEqual(
    await inspectGcmAutomaticMutationPermission(
      { getPlugin: () => ({ api: { templates } }) },
      file,
    ),
    { allowed: false, reason: "declined" },
  );
});

test("GCM template capability failures deny automatic mutation", async () => {
  const file = { path: "Inbox/Note.md" };
  const permissionFor = (canAutomaticallyMutate: unknown) =>
    inspectGcmAutomaticMutationPermission(
      {
        getPlugin: () => ({
          api: {
            templates: { version: 1, canAutomaticallyMutate },
          },
        }),
      },
      file,
    );

  assert.deepEqual(await permissionFor(async () => "yes"), {
    allowed: false,
    reason: "failed",
  });
  assert.deepEqual(
    await permissionFor(() => {
      throw new Error("guard unavailable");
    }),
    { allowed: false, reason: "failed" },
  );
  assert.deepEqual(
    await permissionFor(async () => {
      throw new Error("read failed");
    }),
    { allowed: false, reason: "failed" },
  );
});

test("missing and older GCM template capabilities preserve automatic linting", async () => {
  const file = { path: "Inbox/Note.md" };
  let incompatibleCalled = false;
  const managers = [
    undefined,
    {},
    { getPlugin: () => null },
    { getPlugin: () => ({}) },
    { getPlugin: () => ({ api: { templates: { version: 1 } } }) },
    {
      getPlugin: () => ({
        api: {
          templates: {
            version: 2,
            canAutomaticallyMutate: async () => {
              incompatibleCalled = true;
              return false;
            },
          },
        },
      }),
    },
    {
      getPlugin: () => {
        throw new Error("plugin lookup unavailable");
      },
    },
  ];

  for (const manager of managers) {
    assert.deepEqual(
      await inspectGcmAutomaticMutationPermission(manager, file),
      { allowed: true, reason: "not-supported" },
    );
  }
  assert.equal(incompatibleCalled, false);
});
