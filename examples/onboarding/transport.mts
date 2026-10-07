import type { UploadTransport } from "large-image-ingest/core";
// Example-only bridge to the credential-free reference server, using real HTTP.
export function createReferenceTransport(baseUrl: string): UploadTransport {
  async function request(suffix: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await fetch(`${baseUrl}${suffix}`, options);
    if (!response.ok) {
      throw Object.assign(new Error("Local reference request failed."), {
        code: "transport.failed", retryable: response.status >= 500
      });
    }
    return response.status === 204 ? {} : response.json();
  }
  const status = (id: string, signal: AbortSignal) => request(`/uploads/${encodeURIComponent(id)}`, { signal });
  return {
    capabilities: { name: "local-http-reference", resumable: true, abortable: true,
      expires: false, supportsParallelChunks: false, supportsChunkChecksum: false, supportsPersistentResume: true, supportsSnapshotResume: false },
    async createSession({ manifest, signal }) {
      const result = await request("/uploads", { method: "POST", signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manifest, totalBytes: manifest.original.sizeBytes }) });
      return { uploadId: requireText(result.uploadId), transportName: "local-http-reference", createdAt: new Date().toISOString() };
    },
    async resumeSession({ record, signal }) {
      const remote = await status(record.transport.uploadId, signal);
      if (remote.status !== "open" || remote.acknowledgedBytes !== record.progress.uploadedBytes) {
        throw Object.assign(new Error("Local recovery state does not match."),
          { code: "transport.offset_mismatch", retryable: false });
      }
      return { uploadId: record.transport.uploadId, transportName: "local-http-reference",
        createdAt: record.createdAt, remote: { acknowledgedBytes: Number(remote.acknowledgedBytes) } };
    },
    async uploadChunk({ session, chunk, body, signal }) {
      const receipt = await request(`/uploads/${encodeURIComponent(session.uploadId)}/chunks/${chunk.index}`, {
        method: "PUT", signal, headers: { "x-chunk-start": String(chunk.start), "x-chunk-size": String(chunk.size) }, body
      });
      if (receipt.chunkIndex !== chunk.index || receipt.sizeBytes !== chunk.size) {
        throw Object.assign(new Error("Local receipt does not match."), { code: "transport.receipt_invalid", retryable: false });
      }
      return { chunkIndex: chunk.index, sizeBytes: chunk.size, completedAt: new Date().toISOString(),
        transport: { name: "local-http-reference", offset: chunk.end } };
    },
    async completeSession({ session, signal }) {
      const result = await request(`/uploads/${encodeURIComponent(session.uploadId)}/complete`, { method: "POST", signal });
      if (!result.completed || result.verification !== "verified") throw new Error("Stored original did not verify.");
    },
    async abortSession({ session }) {
      await request(`/uploads/${encodeURIComponent(session.uploadId)}`, { method: "DELETE" });
    }
  };
}

function requireText(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid local upload identifier.");
  return value;
}
