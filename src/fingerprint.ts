import type { IngestFileLike } from "./types.js";

export async function createFastFingerprint(file: IngestFileLike): Promise<string> {
  const input = [
    file.name,
    file.size,
    file.type,
    file.lastModified ?? "unknown"
  ].join(":");

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  }

  return fallbackHash(input);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fallbackHash(input: string): string {
  let hash = 5381;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return `fast-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
