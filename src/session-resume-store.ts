/** Resume record storage and status updates. */
import {
  ResumeConflictError,
  createResumeConflict,
  normalizeTransportRecoveryCapabilities,
  parseResumeRecord
} from "./resume.js";
import type {
  IngestEvent,
  IngestIssueCode,
  ResumeRecord,
  ResumeRecordStatus,
  ResumeStore,
  ResumeTransportState,
  TransportSession,
  UploadSessionResult
} from "./types.js";
import { createIngestError, nowIso, PARALLEL_RESUME_SCHEMA_VERSION } from "./session-state.js";
import type { SessionRuntime } from "./session-runtime.js";

export async function getResumeRecord(rt: SessionRuntime, store: ResumeStore, recordId: string): Promise<ResumeRecord> {
  let record: ResumeRecord | undefined;
  try {
    const stored = await store.get(recordId);
    record = stored ? parseResumeRecord(stored) : undefined;
  } catch (error) {
    if (error instanceof ResumeConflictError) {
      throw emitResumeConflict(rt, error.code, error.message, recordId, error);
    }

    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "The resume store could not read the record.",
      recordId,
      error
    );
  }

  if (!record) {
    throw emitResumeConflict(
      rt,
      "resume.record_not_found",
      "The requested resume record does not exist.",
      recordId
    );
  }

  return record;
}

export async function putResumeRecord(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  const store = requireResumeStore(rt);
  rt.currentRecord = record;

  try {
    await store.put(record);
  } catch (error) {
    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "The resume store could not persist the record.",
      record.id,
      error
    );
  }

  return record;
}

export async function markRecordPaused(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  return putResumeRecord(rt, withStatus(rt, record, "paused"));
}

export async function markRecordCanceled(rt: SessionRuntime, record: ResumeRecord): Promise<ResumeRecord> {
  const canceled = await putResumeRecord(rt, withStatus(rt, record, "canceled"));
  rt.emitCancel(canceled.id);
  return canceled;
}

export async function markCurrentRecordFailed(rt: SessionRuntime, error: unknown): Promise<void> {
  if (!rt.currentRecord) {
    return;
  }

  if (rt.isTerminalOrControlledStatus(rt.currentRecord.progress.status)) {
    return;
  }

  const issueCode = rt.toIssueCode(error);
  rt.currentRecord = await putResumeRecord(
    rt,
    withStatus(rt, rt.currentRecord, "failed", issueCode)
  );
}

export function withStatus(
  rt: SessionRuntime,
  record: ResumeRecord,
  status: ResumeRecordStatus,
  lastErrorCode?: IngestIssueCode
): ResumeRecord {
  const progress: ResumeRecord["progress"] = {
    ...record.progress,
    status
  };

  if (lastErrorCode !== undefined) {
    progress.lastErrorCode = lastErrorCode;
  }

  return {
    ...record,
    ...(record.schemaVersion === PARALLEL_RESUME_SCHEMA_VERSION
      ? { parallel: { ...record.parallel, ambiguousChunkIndexes: [...rt.ambiguousChunks].sort((a, b) => a - b) } }
      : {}),
    progress,
    updatedAt: nowIso()
  };
}

export function withTransport(rt: SessionRuntime, record: ResumeRecord, transport: ResumeTransportState): ResumeRecord {
  return {
    ...record,
    transport,
    updatedAt: nowIso()
  };
}

export function createTransportState(rt: SessionRuntime, session: TransportSession | UploadSessionResult): ResumeTransportState {
  const state: ResumeTransportState = {
    uploadId: session.uploadId
  };

  const transportName = "transportName" in session ? session.transportName : session.transportName;
  if (transportName !== undefined) {
    state.name = transportName;
  }

  if (session.resumeToken !== undefined) {
    state.resumeToken = session.resumeToken;
  }

  if (session.expiresAt !== undefined) {
    state.expiresAt = session.expiresAt;
  }

  const data = "data" in session ? session.data : session.remote;
  if (data !== undefined) {
    state.data = data;
  }

  return state;
}

export function validateRequestedResumeCapability(rt: SessionRuntime): void {
  const recovery = normalizeTransportRecoveryCapabilities(rt.options.transport.capabilities);
  if (
    rt.options.resume &&
    !recovery.persistentResume
  ) {
    throw emitResumeConflict(
      rt,
      "resume.transport_unsupported",
      "The configured upload transport does not support persistent resume."
    );
  }

  if (
    rt.options.resumeFrom &&
    !recovery.snapshotResume
  ) {
    throw createIngestError(
      "transport.resume_failed",
      "The configured upload transport does not support snapshot resume.",
      false
    );
  }
}

export function requireResumeStore(rt: SessionRuntime): ResumeStore {
  const store = rt.options.resume?.store;
  if (!store) {
    throw emitResumeConflict(
      rt,
      "resume.store_failed",
      "A resume store is required for persistent resume operations."
    );
  }

  return store;
}

export function emitResumeConflict(
  rt: SessionRuntime,
  code: ResumeConflictError["code"],
  message: string,
  recordId?: string,
  error?: unknown
): ResumeConflictError {
  const conflict = createResumeConflict(code, message, recordId);
  const event: IngestEvent = { type: "resume:conflict", code, error: error ?? conflict };
  if (recordId !== undefined) {
    event.recordId = recordId;
  }
  rt.emit(event);
  return conflict;
}
