import {
  DEFAULT_SETTINGS,
  SETTINGS_SCHEMA_VERSION,
  normalizeSettings,
  type TPSLinterSettings,
} from "./settings.ts";

type SettingsKey = keyof TPSLinterSettings;
type SettingsRecord = Record<string, unknown>;

interface SettingsSaveRequest {
  snapshot: TPSLinterSettings;
  intentKeys: Set<SettingsKey>;
}

export interface TPSLinterExternalSettingsRead {
  revision: number;
  baseline: TPSLinterSettings;
  live: TPSLinterSettings;
}

export interface TPSLinterExternalSettingsApplyResult {
  applied: boolean;
  changed: number;
}

export interface TPSLinterSettingsPersistenceOptions {
  loadLatest: () => Promise<unknown>;
  saveMerged: (settings: SettingsRecord) => Promise<void>;
  getLiveSettings: () => TPSLinterSettings;
}

const KNOWN_SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];

export function cloneSettings(
  settings: TPSLinterSettings,
): TPSLinterSettings {
  return cloneSerializable(settings);
}

export function isSettingsRecord(
  value: unknown,
): value is SettingsRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isSupportedSettingsSchema(settings: SettingsRecord): boolean {
  if (!Object.prototype.hasOwnProperty.call(settings, "schemaVersion")) {
    return true;
  }

  const schemaVersion = settings.schemaVersion;
  return (
    typeof schemaVersion === "number" &&
    Number.isInteger(schemaVersion) &&
    schemaVersion >= 0 &&
    schemaVersion <= SETTINGS_SCHEMA_VERSION
  );
}

function cloneSerializable<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function settingsValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) =>
        settingsValueEqual(value, right[index]),
      )
    );
  }
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object"
  ) {
    return false;
  }

  const leftRecord = left as SettingsRecord;
  const rightRecord = right as SettingsRecord;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        settingsValueEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function changedSettingsKeys(
  baseline: TPSLinterSettings,
  snapshot: TPSLinterSettings,
): Set<SettingsKey> {
  return new Set(
    KNOWN_SETTINGS_KEYS.filter(
      (key) => !settingsValueEqual(baseline[key], snapshot[key]),
    ),
  );
}

function asSettingsRecord(value: unknown): SettingsRecord {
  if (!isSettingsRecord(value)) {
    throw new Error("TPS Linter settings data must be a JSON object.");
  }
  return cloneSerializable(value);
}

function assertWritableSchema(settings: SettingsRecord): void {
  if (!isSupportedSettingsSchema(settings)) {
    throw new Error(
      "TPS Linter settings use an unsupported schema version.",
    );
  }
}

function settingsRecordFromSnapshot(
  settings: TPSLinterSettings,
): SettingsRecord {
  return cloneSerializable(settings) as unknown as SettingsRecord;
}

/**
 * Serializes settings writes and applies only locally changed top-level fields
 * to the newest data on disk. This preserves settings downloaded by Sync and
 * unknown fields owned by newer compatible releases.
 */
export class TPSLinterSettingsPersistence {
  private readonly options: TPSLinterSettingsPersistenceOptions;
  private baseline = normalizeSettings(undefined);
  private active: SettingsSaveRequest | null = null;
  private pending: SettingsSaveRequest | null = null;
  private drainPromise: Promise<void> | null = null;
  private revision = 0;
  private hasPersistedData = false;

  constructor(options: TPSLinterSettingsPersistenceOptions) {
    this.options = options;
  }

  setBaseline(
    settings: TPSLinterSettings,
    persistedData: unknown = settings,
  ): void {
    this.baseline = cloneSettings(settings);
    this.hasPersistedData = isSettingsRecord(persistedData);
    this.revision += 1;
  }

  request(settings: TPSLinterSettings): Promise<void> {
    const snapshot = cloneSettings(settings);
    const intentKeys = changedSettingsKeys(this.baseline, snapshot);
    const previousDesired = this.pending ?? this.active;

    if (previousDesired) {
      for (const key of previousDesired.intentKeys) intentKeys.add(key);
      for (const key of changedSettingsKeys(previousDesired.snapshot, snapshot)) {
        intentKeys.add(key);
      }
    }

    this.pending = { snapshot, intentKeys };
    if (!this.drainPromise) this.startDrain();
    return this.drainPromise as Promise<void>;
  }

  async waitForIdle(): Promise<void> {
    while (this.drainPromise) {
      await this.drainPromise;
    }
  }

  captureExternalRead(): TPSLinterExternalSettingsRead {
    return {
      revision: this.revision,
      baseline: cloneSettings(this.baseline),
      live: cloneSettings(this.options.getLiveSettings()),
    };
  }

  /**
   * Adopts an externally loaded snapshot without writing it back. Fields edited
   * locally before or after the read began, or already owned by a queued save,
   * win. A local persistence completion invalidates the read so its stale
   * snapshot can be discarded and loaded again.
   */
  applyExternal(
    read: TPSLinterExternalSettingsRead,
    persisted: TPSLinterSettings,
  ): TPSLinterExternalSettingsApplyResult {
    if (read.revision !== this.revision) {
      return { applied: false, changed: 0 };
    }

    const changed = this.reconcileLiveSettings(
      read.live,
      persisted,
      read.baseline,
    );
    this.baseline = cloneSettings(persisted);
    this.hasPersistedData = true;
    this.revision += 1;
    return { applied: true, changed };
  }

  private startDrain(): void {
    this.drainPromise = Promise.resolve().then(() => this.drain());
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const requested = this.pending;
        this.pending = null;
        if (requested.intentKeys.size === 0) continue;
        this.active = requested;

        try {
          const latestData = await this.options.loadLatest();
          const latestRaw =
            latestData === null || latestData === undefined
              ? this.createFirstPersistedRecord(requested.snapshot)
              : asSettingsRecord(latestData);
          assertWritableSchema(latestRaw);
          const mergedRaw = cloneSerializable(latestRaw);
          for (const key of requested.intentKeys) {
            mergedRaw[key] = cloneSerializable(requested.snapshot[key]);
          }
          mergedRaw.schemaVersion = SETTINGS_SCHEMA_VERSION;

          await this.options.saveMerged(mergedRaw);

          const persisted = normalizeSettings(mergedRaw);
          this.baseline = cloneSettings(persisted);
          this.hasPersistedData = true;
          this.revision += 1;
          this.reconcileLiveSettings(requested.snapshot, persisted);
        } catch (error) {
          if (!this.pending) throw error;
        } finally {
          this.active = null;
        }
      }
    } finally {
      this.drainPromise = null;
    }
  }

  private createFirstPersistedRecord(
    snapshot: TPSLinterSettings,
  ): SettingsRecord {
    if (this.hasPersistedData) {
      throw new Error(
        "TPS Linter settings data is temporarily unavailable.",
      );
    }
    return settingsRecordFromSnapshot(snapshot);
  }

  private reconcileLiveSettings(
    requested: TPSLinterSettings,
    persisted: TPSLinterSettings,
    baselineAtRequest?: TPSLinterSettings,
  ): number {
    const live = this.options.getLiveSettings();
    let changed = 0;

    for (const key of KNOWN_SETTINGS_KEYS) {
      if (
        this.active?.intentKeys.has(key) ||
        this.pending?.intentKeys.has(key)
      ) {
        continue;
      }
      if (
        baselineAtRequest &&
        !settingsValueEqual(requested[key], baselineAtRequest[key])
      ) {
        continue;
      }
      if (!settingsValueEqual(live[key], requested[key])) continue;
      if (settingsValueEqual(live[key], persisted[key])) continue;

      (live as Record<SettingsKey, unknown>)[key] = cloneSerializable(
        persisted[key],
      );
      changed += 1;
    }

    return changed;
  }
}
