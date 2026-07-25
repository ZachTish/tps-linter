export const SETTINGS_SCHEMA_VERSION = 4 as const;

export type FilenameUnsafeCharacterStyle = "space" | "dash" | "remove";
export type HeadingCapitalizationStyle =
  | "off"
  | "first-letter"
  | "title-case";
export type HeadingStartLevel = 1 | 2;

export interface TPSLinterSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  cleanFilenames: boolean;
  filenameUnsafeCharacterStyle: FilenameUnsafeCharacterStyle;
  removeObsidianLinkCharacters: boolean;
  cleanWhitespaceOnlyLines: boolean;
  collapseConsecutiveBlankLines: boolean;
  trimNonblankTrailingWhitespace: boolean;
  removeTrailingBlankLines: boolean;
  ensureFinalNewline: boolean;
  headingCapitalizationStyle: HeadingCapitalizationStyle;
  normalizeHeadingLevels: boolean;
  pushHeadingHierarchyToH6: boolean;
  headingStartLevel: HeadingStartLevel;
  sortFrontmatterFields: boolean;
  excludedPaths: string[];
  diagnostics: boolean;
}

type ReadonlyTPSLinterSettings = Omit<Readonly<TPSLinterSettings>, "excludedPaths"> & {
  readonly excludedPaths: readonly string[];
};

const DEFAULT_EXCLUDED_PATHS = Object.freeze([
  "Templates",
  "Recurring Templates",
  "Fixtures",
  "Archive",
  "_archive",
  "_templates",
  "System/Templates",
  "README.md",
]);

export const DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS = Object.freeze([
  "status",
  "priority",
  "tags",
  "recurrence",
  "scheduled",
  "folderPath",
]);

export const DEFAULT_SETTINGS: ReadonlyTPSLinterSettings = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  cleanFilenames: true,
  filenameUnsafeCharacterStyle: "space",
  removeObsidianLinkCharacters: false,
  cleanWhitespaceOnlyLines: true,
  collapseConsecutiveBlankLines: true,
  trimNonblankTrailingWhitespace: false,
  removeTrailingBlankLines: false,
  ensureFinalNewline: true,
  headingCapitalizationStyle: "first-letter",
  normalizeHeadingLevels: true,
  pushHeadingHierarchyToH6: false,
  headingStartLevel: 1,
  sortFrontmatterFields: true,
  excludedPaths: DEFAULT_EXCLUDED_PATHS,
  diagnostics: false,
});

const FILENAME_UNSAFE_CHARACTER_STYLES = new Set<FilenameUnsafeCharacterStyle>([
  "space",
  "dash",
  "remove",
]);

const HEADING_CAPITALIZATION_STYLES = new Set<HeadingCapitalizationStyle>([
  "off",
  "first-letter",
  "title-case",
]);

const HEADING_START_LEVELS = new Set<HeadingStartLevel>([1, 2]);

export function normalizeSettings(loadedData: unknown): TPSLinterSettings {
  const data = isRecord(loadedData) ? loadedData : {};
  const loadedSchemaVersion =
    typeof data.schemaVersion === "number" &&
    Number.isInteger(data.schemaVersion)
      ? data.schemaVersion
      : 0;

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    cleanFilenames: readBoolean(
      data.cleanFilenames,
      DEFAULT_SETTINGS.cleanFilenames,
    ),
    filenameUnsafeCharacterStyle: isFilenameUnsafeCharacterStyle(
      data.filenameUnsafeCharacterStyle,
    )
      ? data.filenameUnsafeCharacterStyle
      : DEFAULT_SETTINGS.filenameUnsafeCharacterStyle,
    removeObsidianLinkCharacters: readBoolean(
      data.removeObsidianLinkCharacters,
      DEFAULT_SETTINGS.removeObsidianLinkCharacters,
    ),
    cleanWhitespaceOnlyLines: readBoolean(
      data.cleanWhitespaceOnlyLines,
      DEFAULT_SETTINGS.cleanWhitespaceOnlyLines,
    ),
    collapseConsecutiveBlankLines: readBoolean(
      data.collapseConsecutiveBlankLines,
      DEFAULT_SETTINGS.collapseConsecutiveBlankLines,
    ),
    trimNonblankTrailingWhitespace: readBoolean(
      data.trimNonblankTrailingWhitespace,
      DEFAULT_SETTINGS.trimNonblankTrailingWhitespace,
    ),
    removeTrailingBlankLines: readBoolean(
      data.removeTrailingBlankLines,
      DEFAULT_SETTINGS.removeTrailingBlankLines,
    ),
    ensureFinalNewline: readBoolean(
      data.ensureFinalNewline,
      DEFAULT_SETTINGS.ensureFinalNewline,
    ),
    headingCapitalizationStyle: isHeadingCapitalizationStyle(
      data.headingCapitalizationStyle,
    )
      ? data.headingCapitalizationStyle
      : DEFAULT_SETTINGS.headingCapitalizationStyle,
    normalizeHeadingLevels: readBoolean(
      data.normalizeHeadingLevels,
      DEFAULT_SETTINGS.normalizeHeadingLevels,
    ),
    pushHeadingHierarchyToH6: readBoolean(
      data.pushHeadingHierarchyToH6,
      DEFAULT_SETTINGS.pushHeadingHierarchyToH6,
    ),
    headingStartLevel: isHeadingStartLevel(data.headingStartLevel)
      ? data.headingStartLevel
      : DEFAULT_SETTINGS.headingStartLevel,
    sortFrontmatterFields: readBoolean(
      data.sortFrontmatterFields,
      DEFAULT_SETTINGS.sortFrontmatterFields,
    ),
    excludedPaths: normalizeExcludedPaths(
      data.excludedPaths,
      loadedSchemaVersion < 2,
    ),
    diagnostics: readBoolean(data.diagnostics, DEFAULT_SETTINGS.diagnostics),
  };
}

export function resolveFrontmatterPriorityKeys(properties: unknown): string[] {
  if (!Array.isArray(properties)) {
    return [...DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS];
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const property of properties) {
    if (!isRecord(property) || typeof property.key !== "string") continue;
    const key = property.key.trim();
    const folded = key.toLowerCase();
    if (!key || seen.has(folded)) continue;
    seen.add(folded);
    keys.push(key);
  }
  return keys.length > 0
    ? keys
    : [...DEFAULT_TPS_FRONTMATTER_PRIORITY_KEYS];
}

function normalizeExcludedPaths(
  value: unknown,
  appendV2SafetyDefaults: boolean,
): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SETTINGS.excludedPaths];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") continue;

    const path = entry.trim();
    if (!path || seen.has(path)) continue;

    seen.add(path);
    normalized.push(path);
  }

  if (appendV2SafetyDefaults) {
    for (const path of ["_templates", "System/Templates"]) {
      if (seen.has(path)) continue;
      seen.add(path);
      normalized.push(path);
    }
  }

  return normalized;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isFilenameUnsafeCharacterStyle(
  value: unknown,
): value is FilenameUnsafeCharacterStyle {
  return (
    typeof value === "string" &&
    FILENAME_UNSAFE_CHARACTER_STYLES.has(value as FilenameUnsafeCharacterStyle)
  );
}

function isHeadingCapitalizationStyle(
  value: unknown,
): value is HeadingCapitalizationStyle {
  return (
    typeof value === "string" &&
    HEADING_CAPITALIZATION_STYLES.has(value as HeadingCapitalizationStyle)
  );
}

function isHeadingStartLevel(value: unknown): value is HeadingStartLevel {
  return (
    typeof value === "number" &&
    HEADING_START_LEVELS.has(value as HeadingStartLevel)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
