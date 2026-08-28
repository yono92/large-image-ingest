import {
  classifyResumeRecordForFile,
  listRecoverableResumeRecords,
  type ChunkPlanOptions,
  type ResumeRecord
} from "large-image-ingest/core";
import type { ReactIngestStatus } from "large-image-ingest/react";

export interface UppySelectedFileLike {
  id: string;
  name: string;
  data?: unknown;
}

export interface SelectedSource {
  uppyFileId: string;
  file: File;
}

export type SelectionResult =
  | { ok: true; source: SelectedSource }
  | { ok: false; code: "selection.remote_unsupported" | "selection.file_unavailable" };

export type RemovalPolicy = "remove" | "cancel-first" | "detach-recoverable";

const ACTIVE_STATUSES = new Set<ReactIngestStatus>([
  "starting",
  "validating",
  "creating",
  "uploading",
  "resuming",
  "completing"
]);

export function toSelectedSource(file: UppySelectedFileLike): SelectionResult {
  if (file.data === undefined || file.data === null) {
    return { ok: false, code: "selection.file_unavailable" };
  }

  if (typeof File === "undefined" || !(file.data instanceof File)) {
    return { ok: false, code: "selection.remote_unsupported" };
  }

  return {
    ok: true,
    source: {
      uppyFileId: file.id,
      file: file.data
    }
  };
}

export function getRemovalPolicy(
  status: ReactIngestStatus,
  hasRecoverableRecord: boolean
): RemovalPolicy {
  if (ACTIVE_STATUSES.has(status)) {
    return "cancel-first";
  }

  if ((status === "paused" || status === "failed") && hasRecoverableRecord) {
    return "detach-recoverable";
  }

  if (status === "paused") {
    return "cancel-first";
  }

  return "remove";
}

export async function findCompatibleResumeRecord(
  records: readonly ResumeRecord[],
  file: File,
  chunking: ChunkPlanOptions
): Promise<ResumeRecord | undefined> {
  for (const record of listRecoverableResumeRecords(records)) {
    if (await classifyResumeRecordForFile(record, file, chunking) === "compatible") {
      return record;
    }
  }

  return undefined;
}
