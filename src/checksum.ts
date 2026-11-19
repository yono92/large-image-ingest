import { ChecksumCanceledError, ChecksumExecutionError } from "./errors.js";
import type {
  ChecksumExecutionOptions,
  ChecksumOptions,
  ChecksumProgress,
  ChunkChecksumValue,
  FileChecksum,
  IngestFileLike
} from "./types.js";

const DEFAULT_CHECKSUM_CHUNK_SIZE = 4 * 1024 * 1024;
const MIN_CHECKSUM_CHUNK_SIZE = 64 * 1024;
// WebCrypto digests a whole buffer at once, so larger blobs use the streaming hasher.
const WEB_CRYPTO_MAX_BLOB_BYTES = 64 * 1024 * 1024;

const SHA256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
];

const SHA256_K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

export async function calculateChecksum(
  file: IngestFileLike,
  options: ChecksumOptions = {}
): Promise<FileChecksum> {
  const execution = normalizeExecutionOptions(file, options);
  const reportProgress = createProgressReporter(file, execution.chunkSize, options);
  const executionOptions: ChecksumExecutionOptions = {
    algorithm: execution.algorithm,
    chunkSize: execution.chunkSize,
    ...(options.signal ? { signal: options.signal } : {}),
    onProgress: reportProgress
  };

  throwIfAborted(options.signal);

  if (options.executor) {
    try {
      const result = await options.executor.calculate(file, executionOptions);
      throwIfAborted(options.signal);
      return validateChecksumResult(result, execution);
    } catch (error) {
      if (isAbort(error, options.signal)) {
        throw new ChecksumCanceledError();
      }
      if (options.fallback !== "inline") {
        if (error instanceof ChecksumExecutionError) {
          throw error;
        }
        throw new ChecksumExecutionError();
      }
    }
  }

  return calculateChecksumInline(file, executionOptions);
}

export async function calculateBlobSha256(
  blob: Blob,
  options: { chunkSize?: number; encoding?: "hex" | "base64"; signal?: AbortSignal } = {}
): Promise<ChunkChecksumValue> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHECKSUM_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < MIN_CHECKSUM_CHUNK_SIZE) {
    throw new RangeError(`checksum chunkSize must be at least ${MIN_CHECKSUM_CHUNK_SIZE} bytes.`);
  }
  let bytes: Uint8Array;
  const subtle = globalThis.crypto?.subtle;
  if (subtle && blob.size <= WEB_CRYPTO_MAX_BLOB_BYTES) {
    throwIfAborted(options.signal);
    const data = await blob.arrayBuffer();
    throwIfAborted(options.signal);
    bytes = new Uint8Array(await subtle.digest("SHA-256", data));
  } else {
    const hasher = new Sha256();
    for (let start = 0; start < blob.size; start += chunkSize) {
      throwIfAborted(options.signal);
      const end = Math.min(start + chunkSize, blob.size);
      hasher.update(new Uint8Array(await blob.slice(start, end).arrayBuffer()));
    }
    bytes = hasher.digest();
  }
  throwIfAborted(options.signal);
  const encoding = options.encoding ?? "hex";
  return {
    algorithm: "sha256",
    encoding,
    value: encoding === "hex" ? toHex(bytes) : toBase64(bytes)
  };
}

export function checksumValuesEqual(
  left: ChunkChecksumValue,
  right: ChunkChecksumValue
): boolean {
  return left.algorithm === right.algorithm &&
    normalizeChecksumValue(left) === normalizeChecksumValue(right);
}

async function calculateChecksumInline(
  file: IngestFileLike,
  options: ChecksumExecutionOptions
): Promise<FileChecksum> {
  const totalChunks = file.size === 0 ? 0 : Math.ceil(file.size / options.chunkSize);
  const hasher = new Sha256();
  let loadedBytes = 0;

  throwIfAborted(options.signal);

  if (file.size === 0) {
    options.onProgress?.({ loadedBytes: 0, totalBytes: 0, chunkIndex: 0, totalChunks: 0 });
  }

  for (let start = 0, chunkIndex = 0; start < file.size; start += options.chunkSize, chunkIndex += 1) {
    throwIfAborted(options.signal);
    const end = Math.min(start + options.chunkSize, file.size);
    const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
    throwIfAborted(options.signal);
    hasher.update(bytes);
    loadedBytes += bytes.byteLength;
    options.onProgress?.({ loadedBytes, totalBytes: file.size, chunkIndex, totalChunks });
  }

  throwIfAborted(options.signal);
  return {
    algorithm: options.algorithm,
    calculatedAt: new Date().toISOString(),
    chunkSizeBytes: options.chunkSize,
    scope: "whole-file",
    value: toHex(hasher.digest())
  };
}

function normalizeExecutionOptions(
  file: IngestFileLike,
  options: ChecksumOptions
): { algorithm: "sha256"; chunkSize: number } {
  const algorithm = options.algorithm ?? "sha256";
  if (algorithm !== "sha256") {
    throw new RangeError(`Unsupported checksum algorithm: ${algorithm}`);
  }

  const chunkSize = options.chunkSize ?? DEFAULT_CHECKSUM_CHUNK_SIZE;
  if (!Number.isSafeInteger(chunkSize) || chunkSize < MIN_CHECKSUM_CHUNK_SIZE) {
    throw new RangeError(`checksum chunkSize must be at least ${MIN_CHECKSUM_CHUNK_SIZE} bytes.`);
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new RangeError("checksum source size must be a non-negative safe integer.");
  }

  return { algorithm, chunkSize };
}

function createProgressReporter(
  file: IngestFileLike,
  chunkSize: number,
  options: ChecksumOptions
): (progress: ChecksumProgress) => void {
  const totalChunks = file.size === 0 ? 0 : Math.ceil(file.size / chunkSize);
  let lastLoadedBytes = -1;

  return (progress) => {
    if (options.signal?.aborted || !Number.isFinite(progress.loadedBytes)) {
      return;
    }
    const loadedBytes = Math.max(0, Math.min(file.size, Math.floor(progress.loadedBytes)));
    if (loadedBytes < lastLoadedBytes) {
      return;
    }
    lastLoadedBytes = loadedBytes;
    const chunkIndex = totalChunks === 0
      ? 0
      : Math.max(0, Math.min(totalChunks - 1, Math.floor(progress.chunkIndex)));
    try {
      options.onProgress?.({ loadedBytes, totalBytes: file.size, chunkIndex, totalChunks });
    } catch (error) {
      try {
        options.onObserverError?.({ observer: "progress", error });
      } catch {
        // Observer-error reporting cannot participate in checksum authority.
      }
    }
  };
}

function validateChecksumResult(
  value: FileChecksum,
  execution: { algorithm: "sha256"; chunkSize: number }
): FileChecksum {
  if (
    !value ||
    value.algorithm !== execution.algorithm ||
    value.scope !== "whole-file" ||
    value.chunkSizeBytes !== execution.chunkSize ||
    !/^[a-f0-9]{64}$/.test(value.value) ||
    !Number.isFinite(Date.parse(value.calculatedAt))
  ) {
    throw new ChecksumExecutionError("Checksum executor returned malformed evidence.");
  }
  return { ...value };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ChecksumCanceledError();
  }
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || error instanceof ChecksumCanceledError || (
    error instanceof DOMException && error.name === "AbortError"
  );
}

class Sha256 {
  private readonly buffer = new Uint8Array(64);
  private readonly bufferView = new DataView(this.buffer.buffer);
  private bufferLength = 0;
  private bytesHashed = 0;
  private readonly state = new Uint32Array(SHA256_INITIAL_STATE);
  private readonly words = new Int32Array(64);

  update(data: Uint8Array): void {
    let position = 0;
    this.bytesHashed += data.byteLength;

    if (this.bufferLength > 0) {
      const needed = 64 - this.bufferLength;
      const available = Math.min(needed, data.byteLength);
      this.buffer.set(data.subarray(0, available), this.bufferLength);
      this.bufferLength += available;
      position += available;

      if (this.bufferLength === 64) {
        this.transform(this.bufferView, 0);
        this.bufferLength = 0;
      }
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    while (position + 64 <= data.byteLength) {
      this.transform(view, position);
      position += 64;
    }

    if (position < data.byteLength) {
      this.buffer.set(data.subarray(position), 0);
      this.bufferLength = data.byteLength - position;
    }
  }

  digest(): Uint8Array {
    const bytesHashed = this.bytesHashed;
    this.buffer[this.bufferLength] = 0x80;
    this.bufferLength += 1;

    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength, 64);
      this.transform(this.bufferView, 0);
      this.bufferLength = 0;
    }

    this.buffer.fill(0, this.bufferLength, 56);

    const bitLengthHigh = Math.floor(bytesHashed / 0x20000000);
    const bitLengthLow = (bytesHashed << 3) >>> 0;
    writeUint32(this.buffer, 56, bitLengthHigh);
    writeUint32(this.buffer, 60, bitLengthLow);
    this.transform(this.bufferView, 0);

    const digest = new Uint8Array(32);
    for (let index = 0; index < this.state.length; index += 1) {
      writeUint32(digest, index * 4, this.state[index] ?? 0);
    }
    return digest;
  }

  private transform(view: DataView, offset: number): void {
    // Hot loop: typed-array reads are always in bounds here, so the
    // non-null assertions avoid per-access fallbacks that slow V8 down.
    // A DataView reads big-endian words directly; the message schedule is
    // expanded inside the round loop.
    const words = this.words;
    const state = this.state;

    let a = state[0]! | 0;
    let b = state[1]! | 0;
    let c = state[2]! | 0;
    let d = state[3]! | 0;
    let e = state[4]! | 0;
    let f = state[5]! | 0;
    let g = state[6]! | 0;
    let h = state[7]! | 0;

    for (let index = 0; index < 64; index += 1) {
      let word: number;
      if (index < 16) {
        word = view.getInt32(offset + index * 4);
      } else {
        const word2 = words[index - 2]!;
        const word15 = words[index - 15]!;
        word = (words[index - 16]! +
          (((word15 >>> 7) | (word15 << 25)) ^ ((word15 >>> 18) | (word15 << 14)) ^ (word15 >>> 3)) +
          words[index - 7]! +
          (((word2 >>> 17) | (word2 << 15)) ^ ((word2 >>> 19) | (word2 << 13)) ^ (word2 >>> 10))) | 0;
      }
      words[index] = word;

      const temp1 = (h +
        (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) +
        ((e & f) ^ (~e & g)) + SHA256_K[index]! + word) | 0;
      const temp2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) +
        ((a & b) ^ (a & c) ^ (b & c))) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    state[0] = state[0]! + a;
    state[1] = state[1]! + b;
    state[2] = state[2]! + c;
    state[3] = state[3]! + d;
    state[4] = state[4]! + e;
    state[5] = state[5]! + f;
    state[6] = state[6]! + g;
    state[7] = state[7]! + h;
  }
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeChecksumValue(checksum: ChunkChecksumValue): string {
  if (checksum.encoding === "hex") {
    if (!/^[a-fA-F0-9]+$/.test(checksum.value) || checksum.value.length % 2 !== 0) {
      throw new TypeError("Checksum hex value is invalid.");
    }
    return checksum.value.toLowerCase();
  }
  return toHex(fromBase64(checksum.value));
}

function toBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    result += alphabet[(value >>> 18) & 63];
    result += alphabet[(value >>> 12) & 63];
    result += second === undefined ? "=" : alphabet[(value >>> 6) & 63];
    result += third === undefined ? "=" : alphabet[value & 63];
  }
  return result;
}

function fromBase64(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new TypeError("Checksum Base64 value is invalid.");
  }
  const output: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const a = alphabet.indexOf(value[index] ?? "");
    const b = alphabet.indexOf(value[index + 1] ?? "");
    const c = value[index + 2] === "=" ? 0 : alphabet.indexOf(value[index + 2] ?? "");
    const d = value[index + 3] === "=" ? 0 : alphabet.indexOf(value[index + 3] ?? "");
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new TypeError("Checksum Base64 value is invalid.");
    const combined = (a << 18) | (b << 12) | (c << 6) | d;
    output.push((combined >>> 16) & 255);
    if (value[index + 2] !== "=") output.push((combined >>> 8) & 255);
    if (value[index + 3] !== "=") output.push(combined & 255);
  }
  return Uint8Array.from(output);
}
