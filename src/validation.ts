import type {
  ImageMetadataInput,
  IngestFileLike,
  IngestIssue,
  ValidationResult,
  ValidationRules
} from "./types.js";

const DEFAULT_RULES: Required<Pick<ValidationRules, "maxBytes" | "minBytes" | "requireNonEmpty">> = {
  maxBytes: 10 * 1024 * 1024 * 1024,
  minBytes: 0,
  requireNonEmpty: true
};

export function validateFile(
  file: IngestFileLike,
  rules: ValidationRules = {},
  metadata: Record<string, unknown> = {},
  image?: ImageMetadataInput
): ValidationResult {
  const merged = { ...DEFAULT_RULES, ...rules };
  const issues: IngestIssue[] = [];

  if (merged.requireNonEmpty && file.size === 0) {
    issues.push({
      code: "file.empty",
      message: "File is empty.",
      path: "file.size",
      severity: "error"
    });
  }

  if (file.size > merged.maxBytes) {
    issues.push({
      code: "file.too_large",
      message: `File exceeds the maximum allowed size of ${merged.maxBytes} bytes.`,
      path: "file.size",
      severity: "error",
      details: { maxBytes: merged.maxBytes, actualBytes: file.size }
    });
  }

  if (file.size < merged.minBytes) {
    issues.push({
      code: "file.too_small",
      message: `File is smaller than the minimum allowed size of ${merged.minBytes} bytes.`,
      path: "file.size",
      severity: "error",
      details: { minBytes: merged.minBytes, actualBytes: file.size }
    });
  }

  if (rules.acceptedMimeTypes?.length && !rules.acceptedMimeTypes.includes(file.type)) {
    issues.push({
      code: "file.mime_not_allowed",
      message: `MIME type "${file.type || "unknown"}" is not allowed.`,
      path: "file.type",
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
        path: "file.name",
        severity: "error",
        details: { acceptedExtensions: accepted, actualExtension: extension }
      });
    }
  }

  for (const key of rules.requiredMetadata ?? []) {
    const value = metadata[key];
    if (value === undefined || value === null || value === "") {
      issues.push({
        code: "metadata.required_missing",
        message: `Required metadata "${key}" is missing.`,
        path: `metadata.${key}`,
        severity: "error",
        details: { key }
      });
    }
  }

  validateDimensions(issues, rules, image);

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

function validateDimensions(
  issues: IngestIssue[],
  rules: ValidationRules,
  image: ImageMetadataInput | undefined
): void {
  const hasDimensionRules =
    rules.minWidth !== undefined ||
    rules.maxWidth !== undefined ||
    rules.minHeight !== undefined ||
    rules.maxHeight !== undefined;

  if (!hasDimensionRules) {
    return;
  }

  if (image?.width === undefined || image.height === undefined) {
    issues.push({
      code: "image.dimensions_unavailable",
      message: "Image dimensions are required by validation rules but were not provided.",
      path: "image",
      severity: "error"
    });
    return;
  }

  if (rules.minWidth !== undefined && image.width < rules.minWidth) {
    issues.push({
      code: "image.width_too_small",
      message: `Image width is smaller than the minimum allowed width of ${rules.minWidth}.`,
      path: "image.width",
      severity: "error",
      details: { minWidth: rules.minWidth, actualWidth: image.width }
    });
  }

  if (rules.maxWidth !== undefined && image.width > rules.maxWidth) {
    issues.push({
      code: "image.width_too_large",
      message: `Image width exceeds the maximum allowed width of ${rules.maxWidth}.`,
      path: "image.width",
      severity: "error",
      details: { maxWidth: rules.maxWidth, actualWidth: image.width }
    });
  }

  if (rules.minHeight !== undefined && image.height < rules.minHeight) {
    issues.push({
      code: "image.height_too_small",
      message: `Image height is smaller than the minimum allowed height of ${rules.minHeight}.`,
      path: "image.height",
      severity: "error",
      details: { minHeight: rules.minHeight, actualHeight: image.height }
    });
  }

  if (rules.maxHeight !== undefined && image.height > rules.maxHeight) {
    issues.push({
      code: "image.height_too_large",
      message: `Image height exceeds the maximum allowed height of ${rules.maxHeight}.`,
      path: "image.height",
      severity: "error",
      details: { maxHeight: rules.maxHeight, actualHeight: image.height }
    });
  }
}
