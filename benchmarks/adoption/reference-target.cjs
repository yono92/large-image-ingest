const { createHash } = require("node:crypto");

const CHUNK_SIZE = 256 * 1024;

class ReferenceTarget {
  constructor(scenarioId = "happy-path") {
    this.scenarioId = scenarioId;
    this.sessionId = "reference-session";
    this.chunks = new Map();
    this.receipts = new Map();
    this.totalBytes = 0;
    this.totalChunks = 0;
    this.completed = false;
    this.stored = undefined;
    this.invalidated = false;
    this.expired = false;
    this.oneShotTriggered = false;
    this.completionResponseLost = false;
    this.remoteMutationCount = 0;
    this.acknowledgedBytesRetransmitted = 0;
    this.completionCallCount = 0;
    this.authoritativeCompletionCount = 0;
  }

  async create({ totalBytes, totalChunks }) {
    this.totalBytes = totalBytes;
    this.totalChunks = totalChunks;
    return { sessionId: this.sessionId };
  }

  async inspect(sessionId) {
    this.assertSession(sessionId);
    return {
      completed: this.completed,
      expired: this.expired,
      receipts: [...this.receipts.values()].sort((left, right) => left.index - right.index)
    };
  }

  async putChunk({ sessionId, index, bytes }) {
    this.assertSession(sessionId);
    if (this.scenarioId === "sensitive-provider-error") {
      const error = new Error("https://secret.invalid/object?token=customer-secret");
      error.code = "provider.sensitive_failure";
      throw error;
    }
    if (this.scenarioId === "persistent-interruption" && index === 1) {
      throw coded("transport.interrupted");
    }
    if (this.scenarioId === "failure-before-acknowledgement" && index === 1 && !this.oneShotTriggered) {
      this.oneShotTriggered = true;
      throw coded("transport.interrupted");
    }
    const existing = this.receipts.get(index);
    const digest = sha256(bytes);
    if (existing) {
      if (existing.digest !== digest || existing.sizeBytes !== bytes.byteLength) {
        throw coded("transport.remote_conflict");
      }
      this.acknowledgedBytesRetransmitted += bytes.byteLength;
      return existing;
    }
    this.remoteMutationCount += 1;
    const copy = Buffer.from(bytes);
    const receipt = { index, sizeBytes: copy.byteLength, digest };
    this.chunks.set(index, copy);
    this.receipts.set(index, receipt);
    if (
      (this.scenarioId === "failure-after-acknowledgement" ||
        this.scenarioId === "lost-acknowledgement-response") &&
      index === 1 && !this.oneShotTriggered
    ) {
      this.oneShotTriggered = true;
      throw coded("transport.acknowledgement_lost");
    }
    return receipt;
  }

  async complete({ sessionId, receipts }) {
    this.assertSession(sessionId);
    this.completionCallCount += 1;
    if (this.completed) return { completed: true };
    const indexes = receipts.map((receipt) => receipt.index);
    if (new Set(indexes).size !== indexes.length || indexes.length !== this.totalChunks) {
      throw coded(indexes.length === this.totalChunks ? "receipt.duplicate" : "receipt.missing");
    }
    const ordered = [...receipts].sort((left, right) => left.index - right.index);
    for (let index = 0; index < this.totalChunks; index += 1) {
      const local = ordered[index];
      const remote = this.receipts.get(index);
      if (!local || !remote || local.digest !== remote.digest || local.sizeBytes !== remote.sizeBytes) {
        throw coded("receipt.invalid");
      }
    }
    this.stored = Buffer.concat([...this.chunks.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, bytes]) => bytes));
    if (this.stored.byteLength !== this.totalBytes) throw coded("stored.size_mismatch");
    this.completed = true;
    this.authoritativeCompletionCount += 1;
    if (this.scenarioId === "lost-completion-response" && !this.completionResponseLost) {
      this.completionResponseLost = true;
      throw coded("completion.response_lost");
    }
    return { completed: true };
  }

  seedChunk(index, bytes) {
    const copy = Buffer.from(bytes);
    const receipt = { index, sizeBytes: copy.byteLength, digest: sha256(copy) };
    this.chunks.set(index, copy);
    this.receipts.set(index, receipt);
    this.remoteMutationCount += 1;
  }

  removeChunk(index) {
    this.chunks.delete(index);
    this.receipts.delete(index);
  }

  invalidate() {
    this.invalidated = true;
  }

  setExpired() {
    this.expired = true;
  }

  setScenario(scenarioId) {
    this.scenarioId = scenarioId;
    this.oneShotTriggered = false;
  }

  corrupt() {
    if (!this.stored || this.stored.byteLength === 0) return;
    this.stored = Buffer.from(this.stored);
    this.stored[0] ^= 0xff;
  }

  verify(source) {
    return Boolean(this.stored) &&
      this.stored.byteLength === source.bytes.byteLength &&
      sha256(this.stored) === sha256(source.bytes);
  }

  getReceipt(index) {
    return this.receipts.get(index);
  }

  assertSession(sessionId) {
    if (this.invalidated || sessionId !== this.sessionId) throw coded("transport.stale_state");
    if (this.expired) throw coded("transport.session_expired");
  }
}

function createSource(seed = 17) {
  const size = CHUNK_SIZE * 2 + 137;
  const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 31 + seed) % 251);
  return {
    bytes,
    name: "inspection.tif",
    type: "image/tiff",
    lastModified: 1,
    checksum: sha256(bytes)
  };
}

function changedMetadataEqualSource() {
  return createSource(29);
}

function chunksFor(source) {
  const chunks = [];
  for (let start = 0, index = 0; start < source.bytes.byteLength; start += CHUNK_SIZE, index += 1) {
    const end = Math.min(source.bytes.byteLength, start + CHUNK_SIZE);
    chunks.push({ index, start, end, bytes: source.bytes.slice(start, end) });
  }
  return chunks;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function coded(code) {
  const error = new Error("Reference target operation failed.");
  error.code = code;
  return error;
}

module.exports = {
  CHUNK_SIZE,
  ReferenceTarget,
  changedMetadataEqualSource,
  chunksFor,
  createSource,
  sha256
};
