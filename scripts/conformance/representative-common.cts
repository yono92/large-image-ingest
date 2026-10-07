import type { ResumeStore, ResumeRecord, IngestFileLike } from "../../src/types.js";
import type { TransportConformanceObservation, TransportConformanceCategory, TransportConformanceTargetProfile } from "../../src/conformance.js";
export type ConformanceSdk = typeof import("../../src/core.js") & typeof import("../../src/conformance.js") & typeof import("../../src/s3.js") & typeof import("../../src/tus.js") & typeof import("../../src/node.js") & typeof import("../../src/package-version.js");
import assert = require("node:assert/strict");

class MemoryResumeStore implements ResumeStore {
  records = new Map<string, ResumeRecord>();
  failDelete: boolean;
  constructor(options: { failDelete?: boolean } = {}) {
    
    this.failDelete = options.failDelete === true;
  }

  async get(id: string) {
    return this.records.get(id);
  }

  async put(record: ResumeRecord) {
    this.records.set(record.id, record);
  }

  async list() {
    return [...this.records.values()];
  }

  async delete(id: string) {
    if (this.failDelete) throw new Error("Injected safe cleanup failure.");
    this.records.delete(id);
  }
}

function createNamedBlob(bytes: BlobPart | Uint8Array, name = "inspection.bin", type = "application/octet-stream") {
  const blob = new Blob([bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes], { type });
  return Object.assign(blob, { name, lastModified: 1 });
}

function createPatternBytes(size: number, seed = 17) {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31 + seed) % 251);
}

async function verifyStored(sdk: ConformanceSdk, source: IngestFileLike, stored: IngestFileLike) {
  const [expected, actual] = await Promise.all([
    sdk.calculateChecksum(source),
    sdk.calculateChecksum(stored)
  ]);
  return {
    byteCountMatched: source.size === stored.size,
    checksumMatched: expected.value === actual.value
  };
}

async function runSourceValidation(sdk: ConformanceSdk) {
  const source = createNamedBlob(createPatternBytes(32), "wafer.tif", "image/tiff");
  const before = await sdk.calculateChecksum(source);
  const validation = sdk.validateFile(source, { maxBytes: 1 });
  const after = await sdk.calculateChecksum(source);
  assert.equal(validation.ok, false);
  assert.equal(before.value, after.value);
  return {
    sourceValidationRejected: true,
    sourceBytesUnchanged: true,
    remoteMutationCountBeforeAuthority: 0
  };
}

async function runSourceMismatch(sdk: ConformanceSdk) {
  const source = createNamedBlob(createPatternBytes(64, 3), "same.tif", "image/tiff");
  const changed = createNamedBlob(createPatternBytes(64, 7), "same.tif", "image/tiff");
  const before = await sdk.createContentSourceIdentity(source);
  const actual = await sdk.createContentSourceIdentity(changed);
  const after = await sdk.createContentSourceIdentity(source);
  assert.equal(sdk.contentSourceIdentityMatches(before, actual), false);
  assert.equal(sdk.contentSourceIdentityMatches(before, after), true);
  return {
    sourceMismatchDetected: true,
    sourceBytesUnchanged: true,
    remoteMutationCountBeforeAuthority: 0
  };
}

function baseObservation(extra: TransportConformanceObservation = {}, limitationCodes: string[] = []): TransportConformanceObservation {
  return {
    durationMs: 0,
    cleanupStatus: "completed",
    limitationCodes,
    ...extra
  };
}

function safeProfile(transportCategory: TransportConformanceCategory, profileId: string, configurationCategories: string[]): TransportConformanceTargetProfile {
  return {
    profileId,
    transportCategory,
    targetClass: "credential-free-representative",
    environment: {
      runtime: `node-${process.versions.node.split(".")[0]}`,
      os: safeSlug(process.platform),
      architecture: safeSlug(process.arch)
    },
    configurationCategories
  };
}

function safeSlug(value: string) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 64);
  return /^[a-z0-9]/.test(normalized) ? normalized : `value-${normalized}`;
}

export {
  MemoryResumeStore,
  assert,
  baseObservation,
  createNamedBlob,
  createPatternBytes,
  runSourceMismatch,
  runSourceValidation,
  safeProfile,
  verifyStored
};
