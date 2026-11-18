import type {
  ChunkDescriptor,
  ChunkPlan,
  CompletedChunkRange,
  ResumeTransportState,
  TransportCapabilities,
  TransportSession,
  UploadChunkReceipt,
  UploadChunkResult,
  UploadSessionResult
} from "./types.js";
import { cloneRecord, createIngestError, nowIso } from "./session-state.js";

export interface NormalizedUploadChunkResult {
  receipt: UploadChunkReceipt;
  transportResult?: UploadChunkResult | undefined;
  attemptId?: string | undefined;
  attemptNumber?: number | undefined;
}

export function normalizeTransportSession(
  session: TransportSession | UploadSessionResult,
  transportName: string,
  fallback?: Partial<TransportSession | ResumeTransportState>
): TransportSession {
  const normalized: TransportSession = {
    uploadId: session.uploadId,
    transportName: session.transportName ?? transportName,
    createdAt: session.createdAt ?? nowIso()
  };

  const expiresAt = session.expiresAt ?? fallback?.expiresAt;
  if (expiresAt !== undefined) {
    normalized.expiresAt = expiresAt;
  }

  const resumeToken = session.resumeToken ?? fallback?.resumeToken;
  if (resumeToken !== undefined) {
    normalized.resumeToken = resumeToken;
  }

  const secretsRef = "secretsRef" in session ? session.secretsRef : undefined;
  if (secretsRef !== undefined) {
    normalized.secretsRef = secretsRef;
  }

  const remote = session.remote ?? ("data" in session ? session.data : undefined);
  if (remote !== undefined) {
    normalized.remote = remote;
  }

  return normalized;
}

export function normalizeChunkResult(
  chunk: ChunkDescriptor,
  session: TransportSession,
  result: void | UploadChunkResult | UploadChunkReceipt
): NormalizedUploadChunkResult {
  if (isUploadChunkReceipt(result)) {
    const receipt = validateReceipt(chunk, result);
    validateReceiptTransport(receipt, session.transportName);
    return {
      receipt
    };
  }

  return {
    receipt: {
      chunkIndex: chunk.index,
      sizeBytes: chunk.size,
      completedAt: nowIso(),
      transport: {
        name: session.transportName
      }
    },
    transportResult: result ?? undefined
  };
}

export function isUploadChunkReceipt(value: unknown): value is UploadChunkReceipt {
  return Boolean(
    value &&
      typeof value === "object" &&
      "chunkIndex" in value &&
      "sizeBytes" in value &&
      "transport" in value
  );
}

export function validateResumeChunkPlan(snapshotPlan: ChunkPlan, activePlan: ChunkPlan): void {
  if (
    snapshotPlan.chunkSize !== activePlan.chunkSize ||
    snapshotPlan.totalBytes !== activePlan.totalBytes ||
    snapshotPlan.totalChunks !== activePlan.totalChunks
  ) {
    throw createIngestError(
      "transport.resume_failed",
      "Cannot resume upload because the snapshot chunk plan does not match the active file.",
      false,
      {
        snapshotChunkSize: snapshotPlan.chunkSize,
        activeChunkSize: activePlan.chunkSize,
        snapshotTotalBytes: snapshotPlan.totalBytes,
        activeTotalBytes: activePlan.totalBytes
      }
    );
  }

  for (const activeChunk of activePlan.chunks) {
    const snapshotChunk = snapshotPlan.chunks[activeChunk.index];

    if (
      !snapshotChunk ||
      snapshotChunk.start !== activeChunk.start ||
      snapshotChunk.end !== activeChunk.end ||
      snapshotChunk.size !== activeChunk.size
    ) {
      throw createIngestError(
        "transport.resume_failed",
        "Cannot resume upload because the snapshot chunk ranges do not match the active file.",
        false,
        { chunkIndex: activeChunk.index }
      );
    }
  }
}

export function validateChunkPlanForTransport(
  chunkPlan: ChunkPlan,
  capabilities: TransportCapabilities | undefined
): void {
  if (!capabilities) {
    return;
  }

  if (capabilities.maxChunkCount !== undefined && chunkPlan.totalChunks > capabilities.maxChunkCount) {
    throw createIngestError(
      "chunk.invalid_size",
      `Chunk plan exceeds transport max chunk count of ${capabilities.maxChunkCount}.`,
      false
    );
  }

  for (const chunk of chunkPlan.chunks) {
    const isFinalChunk = chunk.index === chunkPlan.totalChunks - 1;
    const minChunkSize = isFinalChunk
      ? capabilities.minFinalChunkSizeBytes ?? capabilities.minChunkSizeBytes
      : capabilities.minChunkSizeBytes;

    if (minChunkSize !== undefined && chunk.size < minChunkSize) {
      throw createIngestError(
        "chunk.invalid_size",
        `Chunk ${chunk.index} is smaller than the transport minimum chunk size.`,
        false,
        { chunkIndex: chunk.index, chunkSize: chunk.size, minChunkSize }
      );
    }

    if (capabilities.maxChunkSizeBytes !== undefined && chunk.size > capabilities.maxChunkSizeBytes) {
      throw createIngestError(
        "chunk.invalid_size",
        `Chunk ${chunk.index} is larger than the transport maximum chunk size.`,
        false,
        {
          chunkIndex: chunk.index,
          chunkSize: chunk.size,
          maxChunkSize: capabilities.maxChunkSizeBytes
        }
      );
    }
  }
}

export function validateReceipt(
  chunk: ChunkDescriptor,
  receipt: UploadChunkReceipt | undefined
): UploadChunkReceipt {
  if (!receipt) {
    throw createIngestError(
      "transport.receipt_missing",
      `Transport did not return a receipt for chunk ${chunk.index}.`,
      false,
      { chunkIndex: chunk.index }
    );
  }

  if (receipt.chunkIndex !== chunk.index) {
    throw createIngestError(
      "transport.receipt_invalid",
      `Transport returned a receipt for chunk ${receipt.chunkIndex} while uploading chunk ${chunk.index}.`,
      false,
      { chunkIndex: chunk.index, receiptChunkIndex: receipt.chunkIndex }
    );
  }

  if (receipt.sizeBytes !== chunk.size) {
    throw createIngestError(
      "transport.receipt_invalid",
      `Transport returned a receipt with size ${receipt.sizeBytes} for chunk ${chunk.index}, expected ${chunk.size}.`,
      false,
      { chunkIndex: chunk.index, chunkSize: chunk.size, receiptSize: receipt.sizeBytes }
    );
  }

  return receipt;
}

export function validateReceiptTransport(receipt: UploadChunkReceipt, expectedTransportName: string): void {
  if (receipt.transport.name !== expectedTransportName) {
    throw createIngestError(
      "transport.receipt_invalid",
      "Transport receipt identity does not match the active upload session.",
      false,
      { chunkIndex: receipt.chunkIndex }
    );
  }
}

export function receiptsToRanges(receipts: readonly UploadChunkReceipt[]): CompletedChunkRange[] {
  return receipts
    .slice()
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .reduce<CompletedChunkRange[]>((ranges, receipt) => {
      const previous = ranges[ranges.length - 1];

      if (!previous || receipt.chunkIndex > previous.endIndexInclusive + 1) {
        ranges.push({
          startIndex: receipt.chunkIndex,
          endIndexInclusive: receipt.chunkIndex
        });
        return ranges;
      }

      previous.endIndexInclusive = Math.max(previous.endIndexInclusive, receipt.chunkIndex);
      return ranges;
    }, []);
}

export function calculateUploadedBytes(receipts: readonly UploadChunkReceipt[]): number {
  return receipts.reduce((total, receipt) => total + receipt.sizeBytes, 0);
}

export function cloneReceipt(receipt: UploadChunkReceipt): UploadChunkReceipt {
  return {
    ...receipt,
    checksum: receipt.checksum ? { ...receipt.checksum } : undefined,
      integrity: receipt.integrity ? {
        ...receipt.integrity,
        binding: { ...receipt.integrity.binding },
        local: { ...receipt.integrity.local },
      remote: receipt.integrity.remote ? { ...receipt.integrity.remote } : undefined
    } : undefined,
    transport: {
      ...receipt.transport,
      opaque: cloneRecord(receipt.transport.opaque)
    }
  };
}

export function receiptsDescribeSameRemoteChunk(
  left: UploadChunkReceipt,
  right: UploadChunkReceipt
): boolean {
  return left.chunkIndex === right.chunkIndex &&
    left.sizeBytes === right.sizeBytes &&
    left.transport.name === right.transport.name &&
    left.transport.partNumber === right.transport.partNumber &&
    left.transport.etag === right.transport.etag &&
    JSON.stringify(left.integrity) === JSON.stringify(right.integrity);
}
