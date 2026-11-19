/** Start and resume flows for `SessionRuntime`. */
import { planChunks } from "./chunks.js";
import { createManifest } from "./manifest.js";
import { mergeTransportState } from "./resume.js";
import type {
  ChunkPlan,
  ContentSourceIdentityV1,
  IngestManifest,
  TransportSession
} from "./types.js";
import { normalizeTransportSession, validateChunkPlanForTransport } from "./session-receipts.js";
import { createIngestError, isIngestError, nowIso } from "./session-state.js";
import {
  validateParallelAdmission,
  validateParallelResume,
  reconcileParallelResume,
  validateParallelSnapshot
} from "./session-parallel.js";
import { completeUpload, selectTransferEngine } from "./session-transfer.js";
import { settleOverlapChecksum, startOverlapChecksum, validateOverlapAdmission } from "./session-overlap.js";
import { prepareContentSourceIdentity, createInitialResumeRecord, validateResumeRecord, hydrateResumeSnapshot, hydrateResumeRecord } from "./session-resume.js";
import { getResumeRecord, putResumeRecord, withStatus, withTransport, createTransportState, validateRequestedResumeCapability, requireResumeStore, emitResumeConflict } from "./session-resume-store.js";
import type { SessionRuntime } from "./session-runtime.js";

export async function startUpload(rt: SessionRuntime): Promise<IngestManifest> {
  let manifest: IngestManifest | undefined;
  let chunkPlan: ChunkPlan | undefined;
  let contentIdentity: ContentSourceIdentityV1 | undefined;
  const snapshotCreatedAt = rt.options.resumeFrom?.createdAt ?? nowIso();

  try {
    rt.throwIfStopped();
    validateOverlapAdmission(rt);
    const overlap = rt.options.overlapChecksum === true;
    manifest = rt.options.manifest ?? await createManifest(
      rt.file,
      overlap ? { ...rt.options, checksum: false } : rt.createManifestOptions()
    );
    rt.validateDomainProfileBinding(manifest);
    rt.emit({ type: "validated", manifest });

    if (!manifest.validation.ok) {
      throw createIngestError(
        "validation.failed",
        "Cannot start upload because validation failed.",
        false
      );
    }

    chunkPlan = planChunks(rt.file.size, rt.options.chunking);
    validateChunkPlanForTransport(chunkPlan, rt.options.transport.capabilities);
    validateParallelAdmission(rt);
    validateRequestedResumeCapability(rt);
    if (overlap) {
      rt.pendingChecksum = startOverlapChecksum(rt);
    } else if (rt.options.resume && !rt.options.resumeFrom) {
      contentIdentity = await prepareContentSourceIdentity(rt, manifest);
    }
    if (rt.options.parallel) {
      contentIdentity ??= await prepareContentSourceIdentity(rt, manifest);
      rt.parallelSourceIdentity = contentIdentity;
    }
    await validateParallelSnapshot(rt, manifest, chunkPlan);
    hydrateResumeSnapshot(rt, manifest, chunkPlan);

    const session = await rt.createOrResumeSnapshotSession(manifest, chunkPlan);
    rt.currentTransportSession = session;
    manifest.upload.transport = { name: session.transportName };

    rt.emit({ type: "started", manifest, uploadId: session.uploadId });
    rt.updateSnapshot({
      manifest,
      chunkPlan,
      session,
      status: rt.options.resumeFrom ? "resuming" : "uploading",
      createdAt: snapshotCreatedAt
    });

    let record = rt.options.resumeFrom || rt.pendingChecksum
      ? undefined
      : await createInitialResumeRecord(rt, manifest, session, contentIdentity);

    if (rt.options.resumeFrom) {
      rt.updateSnapshot({
        manifest,
        chunkPlan,
        session,
        status: "uploading",
        createdAt: snapshotCreatedAt
      });
    }

    record = await selectTransferEngine(rt).uploadRemaining(rt, manifest, session, chunkPlan, record, snapshotCreatedAt);
    if (rt.pendingChecksum) {
      await settleOverlapChecksum(rt, manifest, rt.pendingChecksum);
    }
    await completeUpload(rt, manifest, session, record, chunkPlan, snapshotCreatedAt);

    return manifest;
  } catch (error) {
    await rt.handleSessionError(error, manifest, chunkPlan, snapshotCreatedAt);
    throw rt.normalizeStopError(error);
  }
}

export async function resumeUpload(rt: SessionRuntime, recordId: string): Promise<IngestManifest> {
  const store = requireResumeStore(rt);
  let manifest: IngestManifest | undefined;
  let chunkPlan: ChunkPlan | undefined;
  const snapshotCreatedAt = nowIso();

  try {
    const record = await getResumeRecord(rt, store, recordId);
    if (
      record.schemaVersion === "large-image-ingest.resume.v0.1" ||
      record.schemaVersion === "large-image-ingest.resume.v0.2"
    ) {
      rt.emit({ type: "resume:legacy-record", recordId: record.id, schemaVersion: record.schemaVersion, removedIn: "2.0.0" });
    }
    manifest = record.manifest;
    rt.emit({ type: "validated", manifest });
    rt.throwIfStopped();

    if (!rt.options.transport.resumeSession) {
      throw emitResumeConflict(
        rt,
        "resume.transport_unsupported",
        "The configured upload transport does not support persistent resume.",
        record.id
      );
    }

    chunkPlan = planChunks(rt.file.size, rt.options.chunking);
    validateChunkPlanForTransport(chunkPlan, rt.options.transport.capabilities);
    validateParallelAdmission(rt);
    validateParallelResume(rt, record, chunkPlan);
    rt.resumeSourceIdentity = await validateResumeRecord(rt, record, store);
    rt.parallelSourceIdentity = rt.resumeSourceIdentity;

    let session: TransportSession;
    try {
      session = normalizeTransportSession(
        await rt.options.transport.resumeSession({
          manifest,
          file: rt.file,
          signal: rt.abortController.signal,
          record
        }),
        rt.transportName(record.transport.name),
        record.transport
      );
    } catch (error) {
      if (
        isIngestError(error) &&
        (error.code === "resume.receipt_missing" || error.code === "resume.receipt_invalid")
      ) {
        throw emitResumeConflict(rt, error.code, error.message, record.id, error);
      }

      throw emitResumeConflict(
        rt,
        "resume.transport_mismatch",
        "The transport could not validate the remote resume session.",
        record.id,
        error
      );
    }

    if (session.uploadId !== record.transport.uploadId) {
      throw emitResumeConflict(
        rt,
        "resume.transport_mismatch",
        "The transport returned a different remote upload session.",
        record.id
      );
    }

    rt.currentTransportSession = session;
    hydrateResumeRecord(rt, record, chunkPlan, session);
    const reconciledRecord = await reconcileParallelResume(rt, record, manifest, session, chunkPlan);
    manifest.upload.transport = { name: session.transportName };
    const activeRecord = await putResumeRecord(
      rt,
      withTransport(
        rt,
        withStatus(rt, reconciledRecord, "active"),
        mergeTransportState(reconciledRecord.transport, createTransportState(rt, session))
      )
    );

    rt.emit({ type: "resume:started", recordId: activeRecord.id, manifestId: manifest.id });

    rt.updateSnapshot({
      manifest,
      chunkPlan,
      session,
      status: "resuming",
      createdAt: snapshotCreatedAt
    });

    const nextRecord = await selectTransferEngine(rt).uploadRemaining(
      rt,
      manifest,
      session,
      chunkPlan,
      activeRecord,
      snapshotCreatedAt
    );
    await completeUpload(rt, manifest, session, nextRecord, chunkPlan, snapshotCreatedAt);

    return manifest;
  } catch (error) {
    await rt.handleSessionError(error, manifest, chunkPlan, snapshotCreatedAt);
    throw rt.normalizeStopError(error);
  }
}
