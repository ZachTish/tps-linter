export type FilenameOwnershipStatus =
  | "gcm-absent"
  | "gcm-inactive"
  | "gcm-active"
  | "unavailable";

export interface GcmPluginLike {
  settings?: {
    enableAutoRename?: unknown;
    properties?: Array<{
      key?: unknown;
    }>;
  };
}

export interface GcmIntegration {
  ownership: FilenameOwnershipStatus;
  plugin: GcmPluginLike | null;
}

interface PluginManagerLike {
  getPlugin?: (id: string) => unknown;
}

export function inspectGcmIntegration(
  pluginManager: unknown,
): GcmIntegration {
  if (!isRecord(pluginManager)) {
    return unavailable();
  }

  const manager = pluginManager as PluginManagerLike;
  if (typeof manager.getPlugin !== "function") {
    return unavailable();
  }

  let candidate: unknown;
  try {
    candidate = manager.getPlugin("tps-global-context-menu");
  } catch {
    return unavailable();
  }

  if (candidate === null || candidate === undefined) {
    return { ownership: "gcm-absent", plugin: null };
  }
  if (!isRecord(candidate)) {
    return unavailable();
  }

  const plugin = candidate as GcmPluginLike;
  const autoRename = plugin.settings?.enableAutoRename;
  if (autoRename === true) {
    return { ownership: "gcm-active", plugin };
  }
  if (autoRename === false) {
    return { ownership: "gcm-inactive", plugin };
  }
  return { ownership: "unavailable", plugin };
}

function unavailable(): GcmIntegration {
  return { ownership: "unavailable", plugin: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
