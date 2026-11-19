// Part of nas.ts, split out to keep modules under 500 lines; public exports stay on nas.ts.
import type { NasGatewayLockScope } from "./nas.js";

export const metadataFileName = "metadata.json";
export const metadataCandidatePrefix = `${metadataFileName}.candidate-`;
export const metadataCandidateSuffix = ".tmp";
export const chunksDirectoryName = "chunks";
export const defaultLockRootDirectoryName = ".locks";
export const lockMetadataFileName = "owner.json";
export const sessionIdPattern = /^[A-Za-z0-9_-]+$/;
export const lockMetadataSchemaVersion = "large-image-ingest.nas-lock.v0.1";
export const sessionLockWaitTimeoutMs = 30_000;

export type SessionLockContentionMode = "fail" | "skip" | "wait";

export interface NasFileLockMetadata {
  schemaVersion: typeof lockMetadataSchemaVersion;
  acquiredAt: string;
  ownerId: string;
  scope: NasGatewayLockScope;
  sessionId: string;
}
