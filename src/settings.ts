export const SETTINGS_SCHEMA_VERSION = 1 as const;

export type FilenameUnsafeCharacterStyle = "space" | "dash" | "remove";

export interface TPSLinterSettings {
  schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  filenameUnsafeCharacterStyle: FilenameUnsafeCharacterStyle;
  removeObsidianLinkCharacters: boolean;
  cleanWhitespaceOnlyLines: boolean;
  trimNonblankTrailingWhitespace: boolean;
  ensureFinalNewline: boolean;
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
  "README.md",
]);

export const DEFAULT_SETTINGS: ReadonlyTPSLinterSettings = Object.freeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  filenameUnsafeCharacterStyle: "space",
  removeObsidianLinkCharacters: false,
  cleanWhitespaceOnlyLines: true,
  trimNonblankTrailingWhitespace: false,
  ensureFinalNewline: true,
  excludedPaths: DEFAULT_EXCLUDED_PATHS,
  diagnostics: false,
});

const FILENAME_UNSAFE_CHARACTER_STYLES = new Set<FilenameUnsafeCharacterStyle>([
  "space",
  "dash",
  "remove",
]);

export function normalizeSettings(loadedData: unknown): TPSLinterSettings {
  const data = isRecord(loadedData) ? loadedData : {};

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
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
    trimNonblankTrailingWhitespace: readBoolean(
      data.trimNonblankTrailingWhitespace,
      DEFAULT_SETTINGS.trimNonblankTrailingWhitespace,
    ),
    ensureFinalNewline: readBoolean(
      data.ensureFinalNewline,
      DEFAULT_SETTINGS.ensureFinalNewline,
    ),
    excludedPaths: normalizeExcludedPaths(data.excludedPaths),
    diagnostics: readBoolean(data.diagnostics, DEFAULT_SETTINGS.diagnostics),
  };
}

function normalizeExcludedPaths(value: unknown): string[] {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
