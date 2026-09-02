export type FilenameOwnershipStatus =
  | "gcm-absent"
  | "gcm-inactive"
  | "gcm-active"
  | "unavailable";

export interface GcmPluginLike {
  api?: {
    templates?: {
      version?: unknown;
      canAutomaticallyMutate?: unknown;
    };
  };
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

export type GcmAutomaticMutationPermission =
  | { allowed: true; reason: "not-supported" | "allowed" }
  | { allowed: false; reason: "declined" | "failed" };

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

/**
 * Delegates automatic-mutation ownership to the additive GCM templates API.
 *
 * GCM releases without the capability retain the existing TPS Linter
 * behavior. Once the version-1 capability is present, only a literal `true`
 * allows background work; rejection, exceptions, and malformed results fail
 * closed. Explicit manual lint actions intentionally do not use this guard.
 */
export async function inspectGcmAutomaticMutationPermission(
  pluginManager: unknown,
  file: unknown,
): Promise<GcmAutomaticMutationPermission> {
  if (!isRecord(pluginManager)) {
    return { allowed: true, reason: "not-supported" };
  }

  const manager = pluginManager as PluginManagerLike;
  if (typeof manager.getPlugin !== "function") {
    return { allowed: true, reason: "not-supported" };
  }

  let candidate: unknown;
  try {
    candidate = manager.getPlugin("tps-global-context-menu");
  } catch {
    return { allowed: true, reason: "not-supported" };
  }
  if (!isRecord(candidate)) {
    return { allowed: true, reason: "not-supported" };
  }

  const plugin = candidate as GcmPluginLike;
  const templates = plugin.api?.templates;
  if (
    !isRecord(templates) ||
    templates.version !== 1 ||
    typeof templates.canAutomaticallyMutate !== "function"
  ) {
    return { allowed: true, reason: "not-supported" };
  }

  try {
    const result = await templates.canAutomaticallyMutate.call(
      templates,
      file,
    );
    if (result === true) return { allowed: true, reason: "allowed" };
    if (result === false) return { allowed: false, reason: "declined" };
    return { allowed: false, reason: "failed" };
  } catch {
    return { allowed: false, reason: "failed" };
  }
}

function unavailable(): GcmIntegration {
  return { ownership: "unavailable", plugin: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
