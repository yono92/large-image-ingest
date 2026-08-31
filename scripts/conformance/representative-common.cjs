const assert = require("node:assert/strict");

class MemoryResumeStore {
  constructor(options = {}) {
    this.records = new Map();
    this.failDelete = options.failDelete === true;
  }

  async get(id) {
    return this.records.get(id);
  }

  async put(record) {
    this.records.set(record.id, record);
  }

  async list() {
    return [...this.records.values()];
  }

  async delete(id) {
    if (this.failDelete) throw new Error("Injected safe cleanup failure.");
    this.records.delete(id);
  }
}

function createNamedBlob(bytes, name = "inspection.bin", type = "application/octet-stream") {
  const blob = new Blob([bytes], { type });
  Object.defineProperties(blob, {
    name: { value: name },
    lastModified: { value: 1 }
  });
  return blob;
}

function createPatternBytes(size, seed = 17) {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31 + seed) % 251);
}

async function verifyStored(sdk, source, stored) {
  const [expected, actual] = await Promise.all([
    sdk.calculateChecksum(source),
    sdk.calculateChecksum(stored)
  ]);
  return {
    byteCountMatched: source.size === stored.size,
    checksumMatched: expected.value === actual.value
  };
}

async function runSourceValidation(sdk) {
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

async function runSourceMismatch(sdk) {
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

function baseObservation(extra = {}, limitationCodes = []) {
  return {
    durationMs: 0,
    cleanupStatus: "completed",
    limitationCodes,
    ...extra
  };
}

function safeProfile(transportCategory, profileId, configurationCategories) {
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

function safeSlug(value) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 64);
  return /^[a-z0-9]/.test(normalized) ? normalized : `value-${normalized}`;
}

module.exports = {
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
