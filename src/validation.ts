import type { IngestFileLike, IngestIssue, ValidationResult, ValidationRules } from "./types.js";

const DEFAULT_RULES: Required<Pick<ValidationRules, "maxBytes" | "minBytes" | "requireNonEmpty">> = {
  maxBytes: 10 * 1024 * 1024 * 1024,
  minBytes: 0,
  requireNonEmpty: true
};

export function validateFile(file: IngestFileLike, rules: ValidationRules = {}): ValidationResult {
  const merged = { ...DEFAULT_RULES, ...rules };
  const issues: IngestIssue[] = [];

  if (merged.requireNonEmpty && file.size === 0) {
    issues.push({
      code: "file.empty",
      message: "File is empty.",
      severity: "error"
    });
  }

  if (file.size > merged.maxBytes) {
    issues.push({
      code: "file.too_large",
      message: `File exceeds the maximum allowed size of ${merged.maxBytes} bytes.`,
      severity: "error",
      details: { maxBytes: merged.maxBytes, actualBytes: file.size }
    });
  }

  if (file.size < merged.minBytes) {
    issues.push({
      code: "file.too_small",
      message: `File is smaller than the minimum allowed size of ${merged.minBytes} bytes.`,
      severity: "error",
      details: { minBytes: merged.minBytes, actualBytes: file.size }
    });
  }

  if (rules.acceptedMimeTypes?.length && !rules.acceptedMimeTypes.includes(file.type)) {
    issues.push({
      code: "file.mime_not_allowed",
      message: `MIME type "${file.type || "unknown"}" is not allowed.`,
      severity: "error",
      details: { acceptedMimeTypes: rules.acceptedMimeTypes, actualMimeType: file.type }
    });
  }

  if (rules.acceptedExtensions?.length) {
    const extension = getExtension(file.name);
    const accepted = rules.acceptedExtensions.map(normalizeExtension);

    if (!extension || !accepted.includes(extension)) {
      issues.push({
        code: "file.extension_not_allowed",
        message: `File extension "${extension || "none"}" is not allowed.`,
        severity: "error",
        details: { acceptedExtensions: accepted, actualExtension: extension }
      });
    }
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}

function getExtension(name: string): string | undefined {
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return undefined;
  }

  return normalizeExtension(name.slice(dotIndex + 1));
}

function normalizeExtension(extension: string): string {
  return extension.replace(/^\./, "").toLowerCase();
}
