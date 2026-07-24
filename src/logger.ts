const PREFIX = "[TPS Linter]";
const MAX_FIELD_LENGTH = 240;

let diagnosticsEnabled = false;

interface StructuredLogEntry {
  trigger: string;
  path: string;
  result: string;
}

export function setDiagnosticsEnabled(enabled: boolean): void {
  diagnosticsEnabled = enabled;
}

export function logDiagnostic(
  trigger: string,
  path: string,
  result: string,
): void {
  if (!diagnosticsEnabled) return;
  console.info(PREFIX, createEntry(trigger, path, result));
}

export function logWarning(
  trigger: string,
  path: string,
  result: string,
): void {
  console.warn(PREFIX, createEntry(trigger, path, result));
}

export function logError(
  trigger: string,
  path: string,
  result: string,
  error?: unknown,
): void {
  const entry: StructuredLogEntry & { error?: string } = createEntry(
    trigger,
    path,
    result,
  );
  if (error !== undefined) entry.error = summarizeError(error);
  console.error(PREFIX, entry);
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return compactField(`${error.name}: ${error.message}`, "Error");
  }
  return compactField(String(error ?? "Unknown error"), "Unknown error");
}

function createEntry(
  trigger: string,
  path: string,
  result: string,
): StructuredLogEntry {
  return {
    trigger: compactField(trigger, "unknown"),
    path: compactField(path, "(none)"),
    result: compactField(result, "unknown"),
  };
}

function compactField(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return (compact || fallback).slice(0, MAX_FIELD_LENGTH);
}
